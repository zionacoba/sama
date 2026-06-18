import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { safeExternalUrl } from "@/lib/safe-url";
import { BookingModal } from "@/app/trips/[slug]/booking-modal";
import { WaitlistModal } from "@/app/trips/[slug]/waitlist-modal";
import { ShareButton } from "@/app/components/share-button";
import { PhotoGallery } from "@/app/components/photo-gallery";
import { Footer } from "@/app/components/footer";
import { CANCELLATION_POLICIES } from "@/lib/cancellation-policies";
import { SLOT_HOLDING_STATUSES } from "@/lib/booking-status";
import { formatDate, formatDateShort, formatDateRange, formatReviewDate, formatPeso } from "@/lib/format";
import { PublishedBanner } from "@/app/trips/[slug]/published-banner";
import { DifficultyInfoButton } from "@/app/components/difficulty-info";

export const revalidate = 30;

type TripDetail = {
  id: number;
  title: string;
  destination: string;
  region: string | null;
  activity_type: string | null;
  difficulty: string;
  duration: string | null;
  price: string | number;
  description: string;
  date_start: string;
  date_end: string | null;
  meeting_point: string;
  total_slots: number;
  remaining_slots: number;
  photos: string[] | null;
  includes: string | null;
  what_to_bring: string | null;
  organizer_id: string | null;
  template_id: string | null;
  is_template: boolean | null;
  payment_type: string | null;
  min_downpayment: number | null;
  downpayment_cutoff_days: number | null;
  cancellation_policy: string | null;
  cancellation_policy_custom: string | null;
  waiver_text: string | null;
  meeting_points: { location: string; time: string }[] | null;
  waitlist_enabled: boolean | null;
  status: 'draft' | 'active' | 'cancelled';
  custom_questions: string[] | null;
  custom_question: string | null;
};

type OrganizerInfo = {
  display_name: string | null;
  full_name: string;
  bio: string | null;
  photo_url: string | null;
  facebook_url: string | null;
  social_links: { organizer_facebook?: string | null; facebook?: string | null; instagram?: string | null; tiktok?: string | null } | null;
  is_founding_partner: boolean | null;
};

type TripWithOrganizer = TripDetail & {
  // Supabase TS inference says array for joined tables, but for a many-to-one FK the runtime value is a single object or null.
  organizers: (OrganizerInfo & { user_id: string }) | null;
};

type Review = {
  id: number;
  full_name: string | null;
  rating: number;
  body: string;
  created_at: string;
  organizer_response: string | null;
  organizer_responded_at: string | null;
  trips: { title: string; date_start: string } | null;
};

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const full = Math.round(rating);
  const cls = size === "lg" ? "text-xl" : "text-base";
  return (
    <span aria-label={`${rating.toFixed(1)} out of 5 stars`} className={cls}>
      <span className="text-amber-400">{"★".repeat(full)}</span>
      <span className="text-stone-200">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  const colorClass =
    level === "Beginner"
        ? "bg-emerald-100 text-emerald-800"
        : level === "Intermediate"
          ? "bg-amber-100 text-amber-900"
          : level === "Advanced"
            ? "bg-orange-100 text-orange-900"
            : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {level}
    </span>
  );
}

function ActivityBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-trailhead-muted px-2.5 py-0.5 text-xs font-semibold text-trailhead">
      {type}
    </span>
  );
}

function formatPrice(price: string | number) {
  if (typeof price === "string") return price;
  return formatPeso(price);
}

function getUnitPrice(price: string | number): number {
  if (typeof price === "number") return price;
  const digits = price.replace(/[^\d.]/g, "");
  return parseFloat(digits) || 0;
}



function CancellationPolicyCard({ policy, custom }: { policy: string | null; custom: string | null }) {
  if (!policy) return null;
  const meta = CANCELLATION_POLICIES[policy as keyof typeof CANCELLATION_POLICIES] ?? CANCELLATION_POLICIES.flexible;
  const text = policy === "custom" ? (custom ?? "") : meta.text;
  if (!text) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden>🛡️</span>
        <h2 className="text-lg font-bold text-stone-900">Cancellation policy</h2>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}>
          {meta.label}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">{text}</p>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">Refunds to GCash are processed automatically. QR Ph payments are processed manually, and our team will reach out within 3–5 business days.</p>
    </div>
  );
}

// Reusable collapsible section built on native <details>/<summary>: SSR-friendly,
// keyboard-accessible by default, with a chevron that rotates via group-open.
function CollapsibleSection({
  title,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={`group ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg font-bold text-stone-900">{title}</h2>
        <svg className="h-5 w-5 shrink-0 text-stone-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>
      {children}
    </details>
  );
}

function parseList(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ book?: string; published?: string }>;
};

const getTripBySlug = cache(async (slug: string) => {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("trips")
    .select("id, title, slug, destination, region, date_start, date_end, total_slots, remaining_slots, price, payment_type, min_downpayment, downpayment_cutoff_days, difficulty, activity_type, duration, meeting_points, meeting_point, description, photos, waiver_text, cancellation_policy, cancellation_policy_custom, messenger_gc_link, organizer_id, status, is_template, template_id, includes, what_to_bring, waitlist_enabled, custom_questions, custom_question, organizers!organizer_id(display_name, full_name, bio, photo_url, facebook_url, social_links, is_founding_partner, user_id)")
    .eq("slug", slug)
    .maybeSingle();
  return data;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const trip = await getTripBySlug(slug);

  if (!trip) {
    return { title: "Trip not found" };
  }

  const description = trip.description
    ? trip.description.slice(0, 157).trimEnd() + (trip.description.length > 157 ? "…" : "")
    : `An outdoor adventure in ${trip.destination} — book your spot on Sama.`;

  return {
    title: trip.title,
    description,
    openGraph: {
      title: `${trip.title} | Sama`,
      description,
      // Relative — resolves against metadataBase (VERCEL_URL or sama.com.ph)
      url: `/trips/${slug}`,
      type: "website",
      // og:image is handled exclusively by opengraph-image.tsx (file convention)
      // to avoid duplicate / conflicting tags that confuse Facebook's scraper
    },
    twitter: {
      card: "summary_large_image",
      title: `${trip.title} | Sama`,
      description,
    },
  };
}

export default async function TripDetailPage({ params, searchParams }: PageProps) {
  const [{ slug }, { book, published }] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const [trip, { data: { user } }] = await Promise.all([
    getTripBySlug(slug),
    supabase.auth.getUser(),
  ]);

  if (!trip) {
    const adminForRedirect = createSupabaseAdminClient();
    const { data: slugRedirect } = await adminForRedirect
      .from("trip_slug_redirects")
      .select("new_slug")
      .eq("old_slug", slug)
      .maybeSingle();
    if (slugRedirect?.new_slug) {
      redirect(`/trips/${slugRedirect.new_slug}`);
    }
    return (
      <div className="min-h-full bg-stone-50 text-stone-900 font-sans">
        <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-trailhead">
              <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-2xl font-bold text-stone-900">Not found</h1>
          <p className="mt-2 text-stone-600">
            We couldn&apos;t find a trip with that link.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
          >
            Back to trips
          </Link>
        </main>
      </div>
    );
  }

  // Don't expose template trips as public bookable pages
  if (trip.is_template === true || trip.date_start === "2099-12-31") {
    notFound();
  }

  const tripData = trip as unknown as TripWithOrganizer;
  const organizerData = tripData.organizers ?? null;

  const [
    reviewsResult,
    { data: siblingRunsData },
    { data: existingWaitlistEntry },
    { data: existingBooking },
  ] = await Promise.all([
    tripData.organizer_id
      ? supabase
          .from("reviews")
          .select("id, full_name, rating, body, created_at, organizer_response, organizer_responded_at, trips(title, date_start)", { count: "exact" })
          .eq("organizer_id", tripData.organizer_id)
          .eq("approved", true)
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as any[], count: 0 }),
    tripData.template_id
      ? supabase
          .from("trips")
          .select("slug, date_start, date_end, price, remaining_slots, duration")
          .eq("template_id", tripData.template_id)
          .eq("status", "active")
          .neq("slug", slug)
          .gt("date_start", new Date().toISOString())
          .order("date_start", { ascending: true })
      : Promise.resolve({ data: null }),
    user && tripData.remaining_slots === 0
      ? supabase.from("waitlist").select("id").eq("trip_id", tripData.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? admin.from("bookings").select("id").eq("trip_id", tripData.id).eq("user_id", user.id).in("status", [...SLOT_HOLDING_STATUSES]).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // isOwnTrip: user.id matches the organizer's user_id (embedded in Round 1 join),
  // avoiding a separate organizers lookup just to find the owning user.
  const isOwnTrip =
    !!user &&
    !!organizerData?.user_id &&
    user.id === organizerData.user_id;

  // Draft (unpublished) trips are private previews: only the owning organizer
  // may view them via direct slug. Anyone else gets a 404 so an in-progress
  // trip is not disclosed before it is published.
  if (tripData.status === "draft" && !isOwnTrip) {
    notFound();
  }

  const isPast = new Date(tripData.date_start) < new Date();

  const reviews = (reviewsResult.data ?? []) as unknown as Review[];
  const totalReviewCount = reviewsResult.count ?? reviews.length;
  const organizer = organizerData as OrganizerInfo | null;
  const organizerName = organizer?.display_name ?? organizer?.full_name ?? null;

  const organizerContactUrl = (() => {
    if (!organizer) return null;
    const rawLinks = organizer.social_links as unknown;
    const sl = typeof rawLinks === "string"
      ? (() => { try { return JSON.parse(rawLinks) as OrganizerInfo["social_links"]; } catch { return null; } })()
      : organizer.social_links;
    return safeExternalUrl(sl?.organizer_facebook?.trim() || sl?.facebook?.trim() || organizer.facebook_url?.trim() || null);
  })();

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const includesList = parseList(tripData.includes);
  const whatToBringList = parseList(tripData.what_to_bring);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
  const jsonLdDescription = tripData.description
    ? tripData.description.slice(0, 160).trimEnd() + (tripData.description.length > 160 ? "…" : "")
    : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: tripData.title,
    description: jsonLdDescription,
    startDate: tripData.date_start,
    endDate: tripData.date_end ?? tripData.date_start,
    location: { "@type": "Place", name: tripData.destination },
    offers: {
      "@type": "Offer",
      price: Number(tripData.price),
      priceCurrency: "PHP",
      availability: tripData.remaining_slots > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
    },
    organizer: { "@type": "Organization", name: organizerName ?? "Sama" },
    url: `${siteUrl}/trips/${slug}`,
  };

  return (
    <div className="min-h-full bg-stone-50 text-stone-900 font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026") }}
      />
      {published === "1" && <PublishedBanner tripSlug={slug} />}
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-trailhead">
            <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
          </Link>
          <Link href="/trips" className="text-sm font-medium text-stone-600 transition hover:text-trailhead">
            ← All trips
          </Link>
        </div>
      </header>

      <main>
        {/* Compact hero */}
        <section className="border-b-0 border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 pt-2 pb-5 sm:border-b sm:pt-4">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                {tripData.activity_type && <ActivityBadge type={tripData.activity_type} />}
                <span className="inline-flex items-center gap-1">
                  <DifficultyBadge level={tripData.difficulty} />
                  <DifficultyInfoButton variant="joiner" difficulty={tripData.difficulty} />
                </span>
                {totalReviewCount > 0 && avgRating !== null && (
                  <a href="#reviews" className="group flex items-center gap-1.5">
                    <Stars rating={avgRating} />
                    <span className="text-xs text-stone-500 underline-offset-4 group-hover:text-trailhead group-hover:underline">
                      {avgRating.toFixed(1)} · {totalReviewCount} review{totalReviewCount !== 1 ? "s" : ""}
                    </span>
                  </a>
                )}
              </div>
              <ShareButton
                url={`/trips/${slug}`}
                title={tripData.title}
                className="lg:hidden flex-shrink-0 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:border-trailhead hover:text-trailhead"
              />
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              {tripData.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-stone-600">
              <span>📍 {tripData.destination}{tripData.region ? ` · ${tripData.region}` : ""}</span>
              <span>📅 {formatDateRange(tripData.date_start, tripData.date_end)}</span>
              {tripData.duration && <span>⏱ {tripData.duration}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="hidden lg:inline-flex items-center text-xl font-bold text-trailhead">
                {formatPrice(tripData.price)}
              </span>
              <span className={`hidden lg:inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                tripData.remaining_slots === 0
                  ? "bg-stone-100 text-stone-500"
                  : tripData.remaining_slots < 5
                    ? "bg-red-100 text-red-700"
                    : "bg-stone-100 text-stone-600"
              }`}>
                {tripData.remaining_slots === 0
                  ? "Full"
                  : `${tripData.remaining_slots} of ${tripData.total_slots} slot${tripData.total_slots !== 1 ? "s" : ""} left`}
              </span>
              <div className="hidden lg:block">
                <ShareButton
                  url={`/trips/${slug}`}
                  title={tripData.title}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:border-trailhead hover:text-trailhead"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Photo grid — full width, between hero and content */}
        <div className="mx-auto max-w-6xl px-4 pt-1 pb-2 sm:pt-4">
          {tripData.photos && tripData.photos.length > 0 ? (
            <PhotoGallery photos={tripData.photos} alt={tripData.title} />
          ) : (
            <div className="flex h-60 items-center justify-center rounded-2xl bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80 sm:h-[400px]">
              <div className="flex flex-col items-center gap-2 text-trailhead/60">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
                <span className="text-sm font-medium">No photos yet</span>
              </div>
            </div>
          )}
        </div>

        {/* Two-column layout */}
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-8 lg:grid lg:grid-cols-[1fr_280px] lg:items-start lg:gap-8 lg:pb-12">

          {/* Main column */}
          <div className="space-y-4 pb-20 lg:pb-0">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-stone-900">Overview</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-600">{tripData.description}</p>
            </div>

            {(() => {
              const validMeetingPoints = (tripData.meeting_points ?? []).filter((mp) => mp.location?.trim());
              if (validMeetingPoints.length > 0) {
                return (
                  <CollapsibleSection title="Meeting points" defaultOpen className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                    <ul className="mt-2 space-y-1">
                      {validMeetingPoints.map((mp, idx) => (
                        <li key={idx} className="text-stone-700">
                          <span className="font-medium">{mp.location}</span>
                          {mp.time && <span className="text-stone-500"> · {mp.time}</span>}
                        </li>
                      ))}
                    </ul>
                  </CollapsibleSection>
                );
              }
              if (tripData.meeting_point?.trim()) {
                return (
                  <CollapsibleSection title="Meeting point" defaultOpen className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                    <p className="mt-1.5 font-medium text-stone-900">{tripData.meeting_point}</p>
                  </CollapsibleSection>
                );
              }
              return null;
            })()}

            {siblingRunsData && siblingRunsData.length > 0 && (
              <div className="rounded-2xl border border-trailhead/20 bg-trailhead-muted p-4 sm:p-5">
                <h2 className="text-lg font-bold text-stone-900">Other available dates</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {siblingRunsData.map((run) => (
                    <Link
                      key={run.slug}
                      href={`/trips/${run.slug}`}
                      className="rounded-xl border border-trailhead/30 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-trailhead"
                    >
                      <span className="font-semibold text-stone-900">{formatDateRange(run.date_start, run.date_end)}</span>
                      {run.duration && <span className="ml-1.5 text-stone-500">· {run.duration}</span>}
                      <span className="ml-2 font-bold text-trailhead">{formatPrice(run.price)}</span>
                      {run.remaining_slots === 0 && <span className="ml-1.5 text-xs text-stone-500">· Full</span>}
                      {run.remaining_slots > 0 && run.remaining_slots < 5 && (
                        <span className="ml-1.5 text-xs text-red-600">· {run.remaining_slots} left</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(includesList.length > 0 || whatToBringList.length > 0) && (
              <div className="grid items-start gap-4">
                {includesList.length > 0 && (
                  <CollapsibleSection title="What's included" defaultOpen className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <ul className={`mt-3 ${includesList.length >= 6 ? "grid gap-x-6 gap-y-1.5 sm:grid-cols-2" : "space-y-1.5"}`}>
                      {includesList.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-stone-600">
                          <span className="mt-0.5 shrink-0 text-trailhead" aria-hidden="true">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleSection>
                )}
                {whatToBringList.length > 0 && (
                  <CollapsibleSection title="What to bring" defaultOpen className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <ul className={`mt-3 ${whatToBringList.length >= 6 ? "grid gap-x-6 gap-y-1.5 sm:grid-cols-2" : "space-y-1.5"}`}>
                      {whatToBringList.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-stone-600">
                          <span className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CollapsibleSection>
                )}
              </div>
            )}

            <CancellationPolicyCard
              policy={tripData.cancellation_policy}
              custom={tripData.cancellation_policy_custom}
            />

            {organizer && (
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-lg font-bold text-stone-900">Your organizer</h2>
                <Link href={`/organizers/${tripData.organizer_id}`} className="mt-3 flex items-center gap-3 group">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-trailhead-muted text-base font-bold text-trailhead">
                    {organizer.photo_url ? (
                      <Image src={organizer.photo_url} alt={organizer.display_name ?? organizer.full_name} fill className="object-cover" sizes="40px" />
                    ) : (
                      organizer.full_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <span className="font-semibold text-trailhead underline-offset-4 group-hover:underline">
                    {organizer.display_name ?? organizer.full_name}
                  </span>
                </Link>
                {organizer.is_founding_partner && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.745 3.745 0 0 1 3.296-1.043A3.745 3.745 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.745 3.745 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                    </svg>
                    Founding Partner
                  </span>
                )}
                {organizer.bio?.trim() && (
                  <p className="mt-3 text-sm leading-relaxed text-stone-600">{organizer.bio}</p>
                )}
                <Link
                  href={`/organizers/${tripData.organizer_id}`}
                  className="mt-3 inline-flex items-center text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
                >
                  See all trips by {organizer.display_name ?? organizer.full_name} →
                </Link>
              </div>
            )}

            {organizer && (
              <div id="reviews">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-bold text-stone-900">
                    Reviews for {organizer.display_name ?? organizer.full_name}
                    {totalReviewCount > 0 && (
                      <span className="ml-2 text-base font-normal text-stone-500">({totalReviewCount})</span>
                    )}
                  </h2>
                  {totalReviewCount > 3 && (
                    <Link href={`/organizers/${tripData.organizer_id}`} className="shrink-0 text-sm font-semibold text-trailhead underline-offset-4 hover:underline">
                      See all →
                    </Link>
                  )}
                </div>
                {reviews.length === 0 && (
                  <div className="mt-4 rounded-2xl border border-stone-100 bg-stone-50 px-6 py-8 text-center">
                    <p className="text-2xl" aria-hidden>★</p>
                    <p className="mt-2 text-sm font-medium text-stone-600">No reviews yet for this organizer.</p>
                    <p className="mt-1 text-xs text-stone-500">Reviews appear here after participants complete a trip.</p>
                  </div>
                )}
                {reviews.length > 0 && (
                  <ul className="mt-4 space-y-4">
                    {reviews.map((review) => (
                      <li key={review.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                        <div>
                          <p className="font-semibold text-stone-900">{review.full_name ?? "Verified joiner"}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Stars rating={review.rating} />
                            <span className="text-xs text-stone-500">{formatReviewDate(review.created_at)}</span>
                          </div>
                          {review.trips && (
                            <p className="mt-1 text-xs text-stone-500">
                              {review.trips.title} · {formatReviewDate(review.trips.date_start)}
                            </p>
                          )}
                        </div>
                        <p className="mt-3 leading-relaxed text-stone-600">{review.body}</p>
                        {review.organizer_response && (
                          <div className="mt-3 ml-4 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
                            <p className="text-xs font-semibold text-stone-500">Response from {organizerName}</p>
                            <p className="mt-1 text-sm leading-relaxed text-stone-600">{review.organizer_response}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {totalReviewCount > 3 && (
                  <Link href={`/organizers/${tripData.organizer_id}`} className="mt-4 inline-block text-sm font-semibold text-trailhead underline-offset-4 hover:underline">
                    See all {totalReviewCount} reviews →
                  </Link>
                )}
              </div>
            )}

            {organizer && (
              <div className="block lg:hidden p-4 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-sm font-medium text-stone-900 mb-1">Have questions about this trip?</p>
                <p className="text-sm text-stone-500 mb-3">
                  Reach out to {organizer.display_name ?? organizer.full_name} directly before booking.
                </p>
                {organizerContactUrl ? (
                  <a
                    href={organizerContactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-trailhead hover:underline"
                  >
                    Message on Facebook →
                  </a>
                ) : (
                  <p className="text-sm text-stone-600">
                    Have questions? Email{" "}
                    <a href="mailto:hello@sama.com.ph" className="font-medium text-trailhead underline-offset-4 hover:underline">
                      hello@sama.com.ph
                    </a>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Desktop sidebar */}
          <aside className="hidden lg:sticky lg:top-24 lg:block">
            <div className="space-y-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
              <div>
                <p className="text-2xl font-bold text-trailhead">{formatPrice(tripData.price)}</p>
                <p className="text-xs text-stone-500">per person</p>
              </div>
              <div className={`rounded-xl px-3 py-2 text-sm font-medium ${
                tripData.remaining_slots === 0
                  ? "bg-stone-100 text-stone-500"
                  : tripData.remaining_slots < 5
                    ? "bg-red-50 text-red-700"
                    : "bg-stone-50 text-stone-600"
              }`}>
                {tripData.remaining_slots === 0
                  ? "This trip is full"
                  : `${tripData.remaining_slots} of ${tripData.total_slots} slot${tripData.total_slots !== 1 ? "s" : ""} left`}
              </div>
              {isOwnTrip ? (
                <div className="space-y-2">
                  <p className="text-sm text-stone-500">You are the organizer of this trip.</p>
                  <Link
                    href={`/organizer/trips/${slug}/edit`}
                    className="flex w-full items-center justify-center rounded-xl border border-trailhead px-4 py-2.5 text-sm font-semibold text-trailhead transition hover:bg-trailhead hover:text-white"
                  >
                    Edit trip
                  </Link>
                </div>
              ) : existingBooking ? (
                <div className="rounded-xl bg-emerald-50 px-3 py-3">
                  <p className="text-sm font-semibold text-emerald-800">You&apos;re already booked!</p>
                  <Link href="/profile" className="mt-1 block text-xs text-emerald-700 underline-offset-4 hover:underline">
                    View booking →
                  </Link>
                </div>
              ) : isPast ? (
                <p className="text-sm text-stone-500">This trip has already taken place.</p>
              ) : tripData.status === "cancelled" ? (
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-center">
                  <p className="text-sm font-semibold text-red-700 mb-1">This trip has been cancelled</p>
                  <p className="text-sm text-red-500">All participants have been notified and refunds are being processed.</p>
                </div>
              ) : tripData.remaining_slots === 0 ? (
                tripData.waitlist_enabled !== false ? (
                  <WaitlistModal
                    compact
                    tripId={tripData.id}
                    tripSlug={slug}
                    tripTitle={tripData.title}
                    defaultName={(user?.user_metadata?.full_name as string | undefined)?.trim() ?? user?.email?.split("@")[0] ?? ""}
                    defaultEmail={user?.email ?? ""}
                    isOnWaitlist={!!existingWaitlistEntry}
                  />
                ) : (
                  <p className="text-sm text-stone-500">This trip is full.</p>
                )
              ) : (
                <BookingModal
                  compact
                  tripId={tripData.id}
                  tripSlug={slug}
                  tripTitle={tripData.title}
                  tripDateStart={tripData.date_start}
                  tripDateEnd={tripData.date_end ?? null}
                  unitPrice={getUnitPrice(tripData.price)}
                  remainingSlots={tripData.remaining_slots}
                  paymentType={tripData.payment_type ?? "full"}
                  minDownpayment={tripData.min_downpayment ?? null}
                  downpaymentCutoffDays={tripData.downpayment_cutoff_days ?? 10}
                  meetingPoints={tripData.meeting_points ?? []}
                  difficulty={tripData.difficulty}
                  waiverText={tripData.waiver_text ?? null}
                  organizerName={organizerName}
                  customQuestions={tripData.custom_questions ?? (tripData.custom_question ? [tripData.custom_question] : null)}
                  autoOpen={book === "1"}
                  initialName={(user?.user_metadata?.full_name as string | undefined)?.trim() ?? ""}
                  initialEmail={user?.email ?? ""}
                />
              )}
            </div>
            {organizer && (
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-sm font-medium text-stone-900 mb-1">Have questions about this trip?</p>
                <p className="text-sm text-stone-500 mb-3">
                  Reach out to {organizer.display_name ?? organizer.full_name} directly before booking.
                </p>
                {organizerContactUrl ? (
                  <a
                    href={organizerContactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-trailhead hover:underline"
                  >
                    Message on Facebook →
                  </a>
                ) : (
                  <p className="text-sm text-stone-600">
                    Have questions? Email{" "}
                    <a href="mailto:hello@sama.com.ph" className="font-medium text-trailhead underline-offset-4 hover:underline">
                      hello@sama.com.ph
                    </a>
                  </p>
                )}
              </div>
            )}
            </div>
          </aside>
        </div>

        {/* Mobile fixed bottom bar */}
        {!isOwnTrip && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 pt-3 backdrop-blur-sm lg:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))', paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-bold text-trailhead">{formatPrice(tripData.price)}</p>
                <p className="text-xs text-stone-500">
                  {tripData.remaining_slots === 0 ? "Full" : `${tripData.remaining_slots} slot${tripData.remaining_slots !== 1 ? "s" : ""} left`}
                </p>
              </div>
              <div className="w-44 shrink-0">
                {existingBooking ? (
                  <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center">
                    <p className="text-xs font-semibold text-emerald-800">You&apos;re booked!</p>
                    <Link href="/profile" className="text-xs text-emerald-700 underline-offset-4 hover:underline">
                      View booking →
                    </Link>
                  </div>
                ) : isPast ? (
                  <button disabled className="w-full cursor-not-allowed rounded-xl bg-stone-200 px-5 py-3 text-sm font-semibold text-stone-500">
                    Trip ended
                  </button>
                ) : tripData.status === "cancelled" ? (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-center">
                    <p className="text-sm font-semibold text-red-700 mb-1">This trip has been cancelled</p>
                    <p className="text-sm text-red-500">All participants have been notified and refunds are being processed.</p>
                  </div>
                ) : tripData.remaining_slots === 0 ? (
                  tripData.waitlist_enabled !== false ? (
                    <WaitlistModal
                      compact
                      tripId={tripData.id}
                      tripSlug={slug}
                      tripTitle={tripData.title}
                      defaultName={(user?.user_metadata?.full_name as string | undefined)?.trim() ?? user?.email?.split("@")[0] ?? ""}
                      defaultEmail={user?.email ?? ""}
                      isOnWaitlist={!!existingWaitlistEntry}
                    />
                  ) : (
                    <button disabled className="w-full cursor-not-allowed rounded-xl bg-stone-200 px-5 py-3 text-sm font-semibold text-stone-500">
                      Full
                    </button>
                  )
                ) : (
                  <BookingModal
                    compact
                    tripId={tripData.id}
                    tripSlug={slug}
                    tripTitle={tripData.title}
                    tripDateStart={tripData.date_start}
                    tripDateEnd={tripData.date_end ?? null}
                    unitPrice={getUnitPrice(tripData.price)}
                    remainingSlots={tripData.remaining_slots}
                    paymentType={tripData.payment_type ?? "full"}
                    minDownpayment={tripData.min_downpayment ?? null}
                    downpaymentCutoffDays={tripData.downpayment_cutoff_days ?? 10}
                    meetingPoints={tripData.meeting_points ?? []}
                    difficulty={tripData.difficulty}
                    waiverText={tripData.waiver_text ?? null}
                    organizerName={organizerName}
                    customQuestions={tripData.custom_questions ?? (tripData.custom_question ? [tripData.custom_question] : null)}
                    autoOpen={book === "1"}
                    initialName={(user?.user_metadata?.full_name as string | undefined)?.trim() ?? ""}
                    initialEmail={user?.email ?? ""}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
