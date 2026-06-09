import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { OrganizerTripsSection } from "./trips-section";
import { BioExpander } from "./bio-expander";
import { RespondToReviewForm } from "./respond-to-review-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

type Trip = {
  id: number;
  slug: string;
  title: string;
  activity_type: string | null;
  difficulty: string;
  date_start: string;
  price: number;
  total_slots: number;
  remaining_slots: number;
  photos: string[] | null;
  status: string;
};

type Review = {
  id: number;
  full_name: string | null;
  rating: number;
  body: string;
  created_at: string;
  organizer_response: string | null;
  organizer_responded_at: string | null;
  trips: { title: string; slug: string; date_start: string } | null;
};

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      <span className="text-amber-400">{"★".repeat(full)}</span>
      <span className="text-stone-200">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}


export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: organizer } = await admin
    .from("organizers")
    .select("display_name, full_name, bio, photo_url, status")
    .eq("id", id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") {
    return { title: "Organizer not found" };
  }

  const publicName = organizer.display_name ?? organizer.full_name;
  const title = `${publicName} — Sama Organizer`;
  const description = organizer.bio
    ? organizer.bio.slice(0, 150).trimEnd() + (organizer.bio.length > 150 ? "…" : "")
    : `Join ${publicName}'s outdoor trips on Sama.`;

  return {
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      url: `/organizers/${id}`,
      type: "profile",
      ...(organizer.photo_url ? { images: [organizer.photo_url] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function OrganizerProfilePage({ params }: PageProps) {
  const { id } = await params;

  const admin = createSupabaseAdminClient();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [
    { data: organizer },
    { data: allTrips },
    { data: reviewsData },
    { data: currentUserOrg },
  ] = await Promise.all([
    admin
      .from("organizers")
      .select("id, display_name, full_name, bio, photo_url, cover_image_url, social_links, activity_types, is_founding_partner, status")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("trips")
      .select("id, slug, title, activity_type, difficulty, date_start, price, total_slots, remaining_slots, photos, status")
      .eq("organizer_id", id)
      .neq("status", "draft")
      .order("date_start", { ascending: true }),
    admin
      .from("reviews")
      .select("id, full_name, rating, body, created_at, organizer_response, organizer_responded_at, trips(title, slug, date_start)")
      .eq("organizer_id", id)
      .eq("approved", true)
      .order("created_at", { ascending: false }),
    user
      ? admin.from("organizers").select("id").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!organizer) notFound();
  if (organizer.status !== "approved") notFound();

  const isOwner = !!currentUserOrg && String(currentUserOrg.id) === String(id);

  const trips = (allTrips ?? []) as Trip[];
  const reviews = (reviewsData ?? []) as unknown as Review[];

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const publicName = organizer.display_name ?? organizer.full_name;
  const initials = organizer.full_name
    .split(" ")
    .map((w: string) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-trailhead">
            <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
          </Link>
          <Link
            href="/trips"
            className="text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            ← Browse trips
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-10 pt-6 sm:pb-12">
        {/* Banner + profile card as one contained block */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 shadow-sm">
          {/* Contained banner — rounded top corners come from the wrapper */}
          <div className="relative h-36 bg-trailhead sm:h-48">
            {organizer.cover_image_url && (
              <Image
                src={organizer.cover_image_url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 800px) 100vw, 768px"
                priority
              />
            )}
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
          </div>

          {/* Profile card — avatar fully inside, no banner overlap */}
          <div className="bg-white">
            <div className="px-5 pt-5 sm:px-6">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-trailhead-muted text-xl font-bold text-trailhead ring-4 ring-white">
                  {organizer.photo_url ? (
                    <Image
                      src={organizer.photo_url}
                      alt={publicName}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">{initials}</span>
                  )}
                </div>
                {/* Name + badge + rating */}
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
                      {publicName}
                    </h1>
                    {organizer.is_founding_partner && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.745 3.745 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.745 3.745 0 0 1 3.296-1.043A3.745 3.745 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.745 3.745 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                        </svg>
                        Founding Partner
                      </span>
                    )}
                  </div>
                  {avgRating !== null && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <Stars rating={avgRating} />
                      <span className="text-sm font-semibold text-stone-700">{avgRating.toFixed(1)}</span>
                      <span className="text-sm text-stone-400">({reviews.length} review{reviews.length !== 1 ? "s" : ""})</span>
                    </div>
                  )}
                </div>
                {isOwner && (
                  <div className="shrink-0">
                    <Link
                      href="/organizer/profile"
                      className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
                    >
                      Edit profile
                    </Link>
                  </div>
                )}
              </div>

              {organizer.bio && <BioExpander bio={organizer.bio} />}

              {/* Activity type chips — muted, between bio and stats */}
              {(() => {
                const types = organizer.activity_types as string[] | null;
                if (!types || types.length === 0) return null;
                return (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {types.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-500"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Divider + stats row with social links */}
            <div className="mx-5 mt-5 border-t border-stone-100 pb-5 pt-4 sm:mx-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex gap-6">
                  <div>
                    <p className="text-2xl font-bold text-stone-900">{trips.length}</p>
                    <p className="text-sm font-medium text-stone-500">trip{trips.length !== 1 ? "s" : ""} led</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-stone-900">{reviews.length}</p>
                    <p className="text-sm font-medium text-stone-500">review{reviews.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                {(() => {
                  const rawSl = organizer.social_links;
                  const sl = (typeof rawSl === "string"
                    ? (() => { try { return JSON.parse(rawSl); } catch { return null; } })()
                    : rawSl) as { facebook?: string | null; instagram?: string | null; tiktok?: string | null } | null;
                  const links = [
                    { key: "facebook", url: sl?.facebook, icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    ), label: "Facebook" },
                    { key: "instagram", url: sl?.instagram, icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    ), label: "Instagram" },
                    { key: "tiktok", url: sl?.tiktok, icon: (
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                      </svg>
                    ), label: "TikTok" },
                  ].filter((l) => l.url);
                  if (links.length === 0) return null;
                  return (
                    <div className="flex items-center gap-2">
                      {links.map(({ key, url, icon, label }) => (
                        <a
                          key={key}
                          href={url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={label}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition hover:border-trailhead hover:text-trailhead"
                        >
                          {icon}
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        <OrganizerTripsSection trips={trips} />

        {/* Reviews */}
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight text-stone-900">
            Reviews
            {reviews.length > 0 && (
              <span className="ml-2 text-base font-normal text-stone-500">
                ({reviews.length})
              </span>
            )}
          </h2>
          {reviews.length === 0 ? (
            <p className="mt-4 text-stone-500">No reviews yet.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {review.full_name ?? "Verified adventurer"}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <Stars rating={review.rating} />
                        <span className="text-xs text-stone-400">
                          {formatDate(review.created_at)}
                        </span>
                      </div>
                    </div>
                    {review.trips && (
                      <Link
                        href={`/trips/${review.trips.slug}`}
                        className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition hover:border-trailhead hover:text-trailhead"
                      >
                        {review.trips.title}
                      </Link>
                    )}
                  </div>
                  {review.trips && (
                    <p className="mt-1 text-xs text-stone-400">
                      Trip date: {formatDate(review.trips.date_start)}
                    </p>
                  )}
                  <p className="mt-3 leading-relaxed text-stone-600">{review.body}</p>
                  {review.organizer_response && (
                    <div className="mt-3 ml-4 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
                      <p className="text-xs font-semibold text-stone-500">Response from {publicName}</p>
                      <p className="mt-1 text-sm leading-relaxed text-stone-600">{review.organizer_response}</p>
                    </div>
                  )}
                  {isOwner && (
                    <RespondToReviewForm
                      reviewId={review.id}
                      currentResponse={review.organizer_response ?? ""}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama.
        {" · "}
        <Link href="/apply" className="underline-offset-4 hover:text-trailhead hover:underline">
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
