import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BookingModal } from "@/app/trips/[slug]/booking-modal";
import { WaitlistModal } from "@/app/trips/[slug]/waitlist-modal";
import { ShareButton } from "@/app/components/share-button";
import { PhotoGallery } from "@/app/components/photo-gallery";
import { CANCELLATION_POLICIES } from "@/lib/cancellation-policies";
import { formatDate, formatDateShort, formatDateRange, formatReviewDate } from "@/lib/format";
import { PublishedBanner } from "@/app/trips/[slug]/published-banner";

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
};

type OrganizerInfo = {
  display_name: string | null;
  full_name: string;
  bio: string | null;
  photo_url: string | null;
};

type Review = {
  id: number;
  full_name: string | null;
  rating: number;
  body: string;
  created_at: string;
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
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(price);
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
      <p className="mt-3 leading-relaxed text-stone-600">{text}</p>
    </div>
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("title, description, photos, destination")
    .eq("slug", slug)
    .maybeSingle();

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

  const [{ data: trip }, { data: { user } }] = await Promise.all([
    supabase.from("trips").select("id, title, slug, destination, region, activity_type, difficulty, duration, price, description, date_start, date_end, meeting_point, total_slots, remaining_slots, photos, includes, what_to_bring, organizer_id, template_id, is_template, payment_type, min_downpayment, downpayment_cutoff_days, cancellation_policy, cancellation_policy_custom, waiver_text, meeting_points, waitlist_enabled").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!trip) {
    return (
      <div className="min-h-full bg-stone-50 text-stone-900 font-sans">
        <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
            <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
              ⛰ Sama
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

  const tripData = trip as TripDetail;

  const [
    { data: reviewsData },
    reviewCountResult,
    { data: organizerData },
    { data: siblingRunsData },
    { data: userOrgData },
    { data: existingWaitlistEntry },
    { data: existingBooking },
  ] = await Promise.all([
    tripData.organizer_id
      ? supabase
          .from("reviews")
          .select("id, full_name, rating, body, created_at, trips(title, date_start)")
          .eq("organizer_id", tripData.organizer_id)
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    tripData.organizer_id
      ? supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("organizer_id", tripData.organizer_id)
      : Promise.resolve({ count: 0 }),
    tripData.organizer_id
      ? createSupabaseAdminClient().from("organizers").select("display_name, full_name, bio, photo_url").eq("id", tripData.organizer_id).maybeSingle()
      : Promise.resolve({ data: null }),
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
    user
      ? supabase.from("organizers").select("id").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user && tripData.remaining_slots === 0
      ? supabase.from("waitlist").select("id").eq("trip_id", tripData.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? createSupabaseAdminClient().from("bookings").select("id").eq("trip_id", tripData.id).eq("user_id", user.id).in("status", ["confirmed", "pending"]).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const isOwnTrip =
    !!userOrgData?.id &&
    !!tripData.organizer_id &&
    String(userOrgData.id) === String(tripData.organizer_id);

  const isPast = new Date(tripData.date_start) < new Date();

  const reviews = (reviewsData ?? []) as unknown as Review[];
  const totalReviewCount = reviewCountResult.count ?? reviews.length;
  const organizer = organizerData as OrganizerInfo | null;
  const organizerName = organizer?.display_name ?? organizer?.full_name ?? null;

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const includesList = parseList(tripData.includes);
  const whatToBringList = parseList(tripData.what_to_bring);

  return (
    <div className="min-h-full bg-stone-50 text-stone-900 font-sans">
      {published === "1" && <PublishedBanner tripSlug={slug} />}
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
          <Link href="/trips" className="text-sm font-medium text-stone-600 transition hover:text-trailhead">
            ← All trips
          </Link>
        </div>
      </header>

      <main>
        {/* Compact hero */}
        <section className="border-b border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 pt-4 pb-5">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-center gap-2">
              {tripData.activity_type && <ActivityBadge type={tripData.activity_type} />}
              <DifficultyBadge level={tripData.difficulty} />
              {totalReviewCount > 0 && avgRating !== null && (
                <a href="#reviews" className="group flex items-center gap-1.5">
                  <Stars rating={avgRating} />
                  <span className="text-xs text-stone-500 underline-offset-4 group-hover:text-trailhead group-hover:underline">
                    {avgRating.toFixed(1)} · {totalReviewCount} review{totalReviewCount !== 1 ? "s" : ""}
                  </span>
                </a>
              )}
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
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                tripData.remaining_slots === 0
                  ? "bg-stone-100 text-stone-500"
                  : tripData.remaining_slots < 5
                    ? "bg-red-100 text-red-700"
                    : "bg-stone-100 text-stone-600"
              }`}>
                {tripData.remaining_slots === 0
                  ? "Full"
                  : `${tripData.remaining_slots} of ${tripData.total_slots} slots left`}
              </span>
              <p className="text-xl font-bold text-trailhead lg:hidden">
                {formatPrice(tripData.price)}
              </p>
              <ShareButton
                url={`/trips/${slug}`}
                title={tripData.title}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:border-trailhead hover:text-trailhead"
              />
            </div>
          </div>
        </section>

        {/* Photo grid — full width, between hero and content */}
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-2">
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
              <h2 className="text-lg font-bold text-stone-900">About this trip</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-stone-600">{tripData.description}</p>
            </div>

            {tripData.meeting_points && tripData.meeting_points.length > 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-xs font-semibold text-stone-500">Meeting points</h2>
                <ul className="mt-2 space-y-1">
                  {tripData.meeting_points.map((mp, idx) => (
                    <li key={idx} className="text-stone-700">
                      <span className="font-medium">{mp.location}</span>
                      {mp.time && <span className="text-stone-400"> · {mp.time}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : tripData.meeting_point ? (
              <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-xs font-semibold text-stone-500">Meeting point</h2>
                <p className="mt-1.5 font-medium text-stone-900">{tripData.meeting_point}</p>
              </div>
            ) : null}

            {siblingRunsData && siblingRunsData.length > 0 && (
              <div className="rounded-2xl border border-trailhead/20 bg-trailhead-muted p-4 sm:p-5">
                <h2 className="text-xs font-semibold text-stone-500">Other available dates</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {siblingRunsData.map((run) => (
                    <Link
                      key={run.slug}
                      href={`/trips/${run.slug}`}
                      className="rounded-xl border border-trailhead/30 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-trailhead"
                    >
                      <span className="font-semibold text-stone-900">{formatDateRange(run.date_start, run.date_end)}</span>
                      {run.duration && <span className="ml-1.5 text-stone-400">· {run.duration}</span>}
                      <span className="ml-2 font-bold text-trailhead">{formatPrice(run.price)}</span>
                      {run.remaining_slots === 0 && <span className="ml-1.5 text-xs text-stone-400">· Full</span>}
                      {run.remaining_slots > 0 && run.remaining_slots < 5 && (
                        <span className="ml-1.5 text-xs text-red-600">· {run.remaining_slots} left</span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(includesList.length > 0 || whatToBringList.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {includesList.length > 0 && (
                  <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-bold text-stone-900">What&apos;s included</h2>
                    <ul className="mt-3 space-y-1.5">
                      {includesList.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-stone-600">
                          <span className="mt-0.5 shrink-0 text-trailhead">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {whatToBringList.length > 0 && (
                  <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-bold text-stone-900">What to bring</h2>
                    <ul className="mt-3 space-y-1.5">
                      {whatToBringList.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-stone-600">
                          <span className="mt-0.5 shrink-0 text-stone-400">•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

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
                {organizer.bio && (
                  <p className="mt-3 text-sm leading-relaxed text-stone-600">{organizer.bio}</p>
                )}
              </div>
            )}

            <CancellationPolicyCard
              policy={tripData.cancellation_policy}
              custom={tripData.cancellation_policy_custom}
            />

            {organizer && (
              <div id="reviews">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="text-xl font-bold tracking-tight text-stone-900">
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
                  <p className="mt-4 text-stone-500">No reviews yet for this organizer.</p>
                )}
                {reviews.length > 0 && (
                  <ul className="mt-4 space-y-4">
                    {reviews.map((review) => (
                      <li key={review.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                        <div>
                          <p className="font-semibold text-stone-900">{review.full_name ?? "Verified adventurer"}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Stars rating={review.rating} />
                            <span className="text-xs text-stone-400">{formatReviewDate(review.created_at)}</span>
                          </div>
                          {review.trips && (
                            <p className="mt-1 text-xs text-stone-400">
                              {review.trips.title} · {formatReviewDate(review.trips.date_start)}
                            </p>
                          )}
                        </div>
                        <p className="mt-3 leading-relaxed text-stone-600">{review.body}</p>
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
          </div>

          {/* Desktop sidebar */}
          <aside className="hidden lg:sticky lg:top-6 lg:block">
            <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
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
                  : `${tripData.remaining_slots} of ${tripData.total_slots} slots left`}
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
                  cancellationPolicy={tripData.cancellation_policy ?? null}
                  cancellationPolicyCustom={tripData.cancellation_policy_custom ?? null}
                  waiverText={tripData.waiver_text ?? null}
                  organizerName={organizerName}
                  autoOpen={book === "1"}
                />
              )}
            </div>
          </aside>
        </div>

        {/* Mobile fixed bottom bar */}
        {!isOwnTrip && (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-stone-200 bg-white/95 px-4 pt-3 backdrop-blur-sm lg:hidden" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-base font-bold text-trailhead">{formatPrice(tripData.price)}</p>
                <p className="text-xs text-stone-500">
                  {tripData.remaining_slots === 0 ? "Full" : `${tripData.remaining_slots} slots left`}
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
                    cancellationPolicy={tripData.cancellation_policy ?? null}
                    cancellationPolicyCustom={tripData.cancellation_policy_custom ?? null}
                    waiverText={tripData.waiver_text ?? null}
                    organizerName={organizerName}
                    autoOpen={book === "1"}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
        {" · "}
        <Link href="/organizer/apply" className="underline-offset-4 hover:text-trailhead hover:underline">
          Become an Organizer
        </Link>
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
