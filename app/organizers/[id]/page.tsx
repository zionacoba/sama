import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, full_name, bio, photo_url")
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();

  if (!organizer) notFound();

  const [{ data: allTrips }, { data: reviewsData }] = await Promise.all([
    supabase
      .from("trips")
      .select("id, slug, title, activity_type, difficulty, date_start, price, total_slots, remaining_slots, photos")
      .eq("organizer_id", id)
      .eq("status", "active")
      .order("date_start", { ascending: true }),
    supabase
      .from("reviews")
      .select("id, full_name, rating, body, created_at, trips(title, slug, date_start)")
      .eq("organizer_id", id)
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

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        {/* Organizer hero */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-trailhead-muted text-xl font-bold text-trailhead">
              {organizer.photo_url ? (
                <Image
                  src={organizer.photo_url}
                  alt={organizer.full_name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              ) : (
                initials
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                {organizer.full_name}
              </h1>
              {avgRating !== null && (
                <div className="mt-1 flex items-center gap-1.5">
                  <Stars rating={avgRating} />
                  <span className="text-sm font-semibold text-stone-700">{avgRating.toFixed(1)}</span>
                  <span className="text-sm text-stone-400">({reviews.length} review{reviews.length !== 1 ? "s" : ""})</span>
                </div>
              )}
            </div>
          </div>
          {organizer.bio && (
            <p className="mt-5 leading-relaxed text-stone-600">{organizer.bio}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-6 border-t border-stone-100 pt-5 text-sm">
            <div>
              <p className="text-xl font-bold text-stone-900">{trips.length}</p>
              <p className="text-stone-500">trip{trips.length !== 1 ? "s" : ""} led</p>
            </div>
            <div>
              <p className="text-xl font-bold text-stone-900">{reviews.length}</p>
              <p className="text-stone-500">review{reviews.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>

        {/* Upcoming trips */}
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight text-stone-900">
            Upcoming trips
          </h2>
          {upcomingTrips.length === 0 ? (
            <p className="mt-4 text-stone-500">No upcoming trips at the moment.</p>
          ) : (
            <ul className="mt-4 grid gap-5 sm:grid-cols-2">
              {upcomingTrips.map((trip) => (
                <li key={trip.id}>
                  <Link
                    href={`/trips/${trip.slug}`}
                    className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2"
                  >
                    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
                      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80">
                        {trip.photos?.[0] && (
                          <Image
                            src={trip.photos[0]}
                            alt={trip.title}
                            fill
                            className="object-cover"
                            sizes="(min-width: 768px) 356px, (min-width: 640px) 50vw, 100vw"
                            quality={80}
                          />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-stone-900">{trip.title}</h3>
                          <DifficultyBadge level={trip.difficulty} />
                        </div>
                        <p className="text-sm text-stone-500">{formatDate(trip.date_start)}</p>
                        <div className="mt-auto flex items-center justify-between border-t border-stone-100 pt-3">
                          <p className="font-bold text-trailhead">{formatPrice(trip.price)}</p>
                          <p className="text-xs text-stone-400">
                            {trip.remaining_slots} slot{trip.remaining_slots !== 1 ? "s" : ""} left
                          </p>
                        </div>
                      </div>
                    </article>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Reviews */}
        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight text-stone-900">
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
      </footer>
    </div>
  );
}
