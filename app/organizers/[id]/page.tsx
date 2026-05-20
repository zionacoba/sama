import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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
};

type Review = {
  id: number;
  full_name: string | null;
  rating: number;
  body: string;
  created_at: string;
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

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function DifficultyBadge({ level }: { level: string }) {
  const colorClass =
    level === "Beginner"
      ? "bg-emerald-100 text-emerald-800"
      : level === "Intermediate"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {level}
    </span>
  );
}

export default async function OrganizerProfilePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  // Use admin client to bypass RLS — organizer profiles are public pages
  // URL param is user_id (auth UUID), not the organizers table PK
  const { data: organizer } = await admin
    .from("organizers")
    .select("id, display_name, full_name, bio, photo_url, cover_image_url, social_links")
    .eq("user_id", id)
    .maybeSingle();

  if (!organizer) notFound();

  // trips and reviews use organizer.id (the PK), not the URL param
  const [{ data: allTrips }, { data: reviewsData }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, slug, title, activity_type, difficulty, date_start, price, total_slots, remaining_slots, photos")
      .eq("organizer_id", organizer.id)
      .eq("status", "active")
      .order("date_start", { ascending: true }),
    supabase
      .from("reviews")
      .select("id, full_name, rating, body, created_at, trips(title, slug, date_start)")
      .eq("organizer_id", organizer.id)
      .order("created_at", { ascending: false }),
  ]);

  const trips = (allTrips ?? []) as Trip[];
  const reviews = (reviewsData ?? []) as unknown as Review[];
  const now = new Date().toISOString();
  const upcomingTrips = trips.filter((t) => t.date_start > now);

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
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
          <Link
            href="/trips"
            className="text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            ← Browse trips
          </Link>
        </div>
      </header>

      <div className="relative h-32 w-full overflow-hidden bg-trailhead sm:h-44">
        {organizer.cover_image_url && (
          <Image
            src={organizer.cover_image_url}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      <main className="mx-auto max-w-3xl px-4 pb-8 sm:pb-10">
        {/* Organizer hero — card overlaps banner 20px, avatar peeks 20px above card top */}
        <div className="-mt-5">
          <div className="rounded-2xl border border-stone-200 bg-white shadow-lg">
            <div className="flex items-end gap-4 px-5 pt-5">
              <div className="-mt-10 relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-trailhead-muted text-lg font-bold text-trailhead ring-2 ring-white">
                {organizer.photo_url ? (
                  <Image
                    src={organizer.photo_url}
                    alt={publicName}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  initials
                )}
              </div>
              <div className="min-w-0 pb-1">
                <h1 className="text-xl font-bold tracking-tight text-stone-900">
                  {publicName}
                </h1>
                {avgRating !== null && (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Stars rating={avgRating} />
                    <span className="text-sm font-semibold text-stone-700">{avgRating.toFixed(1)}</span>
                    <span className="text-sm text-stone-400">({reviews.length} review{reviews.length !== 1 ? "s" : ""})</span>
                  </div>
                )}
              </div>
            </div>
            {organizer.bio && (
              <p className="mt-3 px-5 text-sm leading-relaxed text-stone-600">{organizer.bio}</p>
            )}
            {(() => {
              const sl = organizer.social_links as { facebook?: string | null; instagram?: string | null; tiktok?: string | null } | null;
              const links = [
                { key: "facebook", url: sl?.facebook, icon: (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                ), label: "Facebook" },
                { key: "instagram", url: sl?.instagram, icon: (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                ), label: "Instagram" },
                { key: "tiktok", url: sl?.tiktok, icon: (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                  </svg>
                ), label: "TikTok" },
              ].filter((l) => l.url);
              if (links.length === 0) return null;
              return (
                <div className="mt-3 flex items-center gap-2 px-5">
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
            <div className="mx-5 mt-4 flex flex-wrap gap-5 border-t border-stone-100 pb-5 pt-4 text-sm">
              <div>
                <p className="text-lg font-bold text-stone-900">{trips.length}</p>
                <p className="text-stone-500">trip{trips.length !== 1 ? "s" : ""} led</p>
              </div>
              <div>
                <p className="text-lg font-bold text-stone-900">{reviews.length}</p>
                <p className="text-stone-500">review{reviews.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming trips */}
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight text-stone-900">
            Upcoming trips
          </h2>
          {upcomingTrips.length === 0 ? (
            <p className="mt-4 text-stone-500">No upcoming trips at the moment.</p>
          ) : (
            <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
              <ul className="flex gap-4 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
                {upcomingTrips.map((trip) => (
                  <li key={trip.id} className="w-[75vw] shrink-0 snap-start sm:flex sm:w-auto sm:flex-col">
                    <Link
                      href={`/trips/${trip.slug}`}
                      className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2"
                    >
                      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
                        <div className="relative aspect-[2/1] overflow-hidden bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80 sm:aspect-[4/3]">
                          {trip.photos?.[0] && (
                            <Image
                              src={trip.photos[0]}
                              alt={trip.title}
                              fill
                              className="object-cover"
                              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 75vw"
                              quality={80}
                            />
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-2 p-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {trip.activity_type && (
                              <span className="inline-flex items-center rounded-full bg-trailhead-muted px-2 py-0.5 text-xs font-semibold text-trailhead">
                                {trip.activity_type}
                              </span>
                            )}
                            <DifficultyBadge level={trip.difficulty} />
                          </div>
                          <h3 className="font-bold text-stone-900">{trip.title}</h3>
                          <p className="text-xs text-stone-400">{formatDate(trip.date_start)}</p>
                          <div className="mt-auto border-t border-stone-100 pt-3">
                            <p className="text-lg font-bold text-trailhead">{formatPrice(trip.price)}</p>
                            <p className={`text-xs font-medium ${trip.remaining_slots < 5 ? "text-red-600" : "text-stone-400"}`}>
                              {trip.remaining_slots} slot{trip.remaining_slots !== 1 ? "s" : ""} left
                            </p>
                          </div>
                        </div>
                      </article>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

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
                </li>
              ))}
            </ul>
          )}
        </section>
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
