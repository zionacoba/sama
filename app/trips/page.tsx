import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Navbar } from "@/app/components/navbar";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { TripFilters } from "./trip-filters";

export const metadata: Metadata = {
  title: "Browse trips",
  description:
    "Browse hikes, camps, dives, and island hops across the Philippines. Filter by activity and difficulty to find your next adventure.",
  openGraph: {
    title: "Browse trips | Sama",
    description:
      "Browse hikes, camps, dives, and island hops across the Philippines. Filter by activity and difficulty to find your next adventure.",
    url: "https://sama.ph/trips",
    type: "website",
  },
};

const ACTIVITIES = ["All", "Hiking", "Island Hopping"] as const;
const DIFFICULTIES = ["All", "Beginner", "Intermediate", "Advanced", "Expert"] as const;

type Trip = {
  id: string | number;
  slug: string;
  title: string;
  price: string | number;
  destination: string;
  difficulty: string;
  activity_type: string | null;
  date_start: string;
  remaining_slots: number;
  photos: string[] | null;
};

type FilterParams = {
  activity?: string;
  difficulty?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort?: string;
};

type PageProps = {
  searchParams: Promise<FilterParams>;
};

function formatPrice(price: string | number) {
  if (typeof price === "string") return price;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function DifficultyBadge({ level }: { level: string }) {
  const styles =
    level === "Beginner"
      ? "bg-emerald-100 text-emerald-800"
      : level === "Intermediate"
        ? "bg-amber-100 text-amber-900"
        : level === "Advanced"
          ? "bg-orange-100 text-orange-900"
          : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles}`}>
      {level}
    </span>
  );
}

function filterUrl(
  base: FilterParams,
  key: "activity" | "difficulty",
  value: string,
) {
  const next: FilterParams = { ...base, [key]: value === "All" ? undefined : value };
  const sp = new URLSearchParams();
  if (next.search) sp.set("search", next.search);
  if (next.activity) sp.set("activity", next.activity);
  if (next.difficulty) sp.set("difficulty", next.difficulty);
  if (next.date_from) sp.set("date_from", next.date_from);
  if (next.date_to) sp.set("date_to", next.date_to);
  if (next.sort && next.sort !== "soonest") sp.set("sort", next.sort);
  const qs = sp.toString();
  return `/trips${qs ? `?${qs}` : ""}`;
}

export default async function TripsPage({ searchParams }: PageProps) {
  const { activity, difficulty, search, date_from, date_to, sort = "soonest" } = await searchParams;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("trips")
    .select("*")
    .eq("status", "active")
    .gt("date_start", new Date().toISOString());

  if (search) {
    const term = `%${search}%`;
    query = query.or(`title.ilike.${term},destination.ilike.${term},activity_type.ilike.${term}`);
  }
  if (activity) query = query.eq("activity_type", activity);
  if (difficulty) query = query.eq("difficulty", difficulty);
  if (date_from) query = query.gte("date_start", `${date_from}T00:00:00`);
  if (date_to) query = query.lte("date_start", `${date_to}T23:59:59`);

  switch (sort) {
    case "latest":     query = query.order("date_start", { ascending: false }); break;
    case "price_asc":  query = query.order("price", { ascending: true });       break;
    case "price_desc": query = query.order("price", { ascending: false });      break;
    default:           query = query.order("date_start", { ascending: true });  break;
  }

  const { data } = await query;
  const trips = (data ?? []) as Trip[];

  const currentActivity = activity ?? "All";
  const currentDifficulty = difficulty ?? "All";
  const current = { activity, difficulty, search, date_from, date_to, sort };

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <Navbar />

      <main>
        <section className="border-b border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 py-10 sm:py-12">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Browse trips
            </h1>

            <form action="/trips" method="GET" className="mt-4 flex gap-2">
              {activity && <input type="hidden" name="activity" value={activity} />}
              {difficulty && <input type="hidden" name="difficulty" value={difficulty} />}
              {sort && sort !== "soonest" && <input type="hidden" name="sort" value={sort} />}
              {date_from && <input type="hidden" name="date_from" value={date_from} />}
              {date_to && <input type="hidden" name="date_to" value={date_to} />}
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden>
                  🔍
                </span>
                <input
                  name="search"
                  type="search"
                  defaultValue={search ?? ""}
                  placeholder="Search destination, activity…"
                  className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 shadow-sm outline-none placeholder:text-stone-400 focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                />
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-trailhead px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
              >
                Search
              </button>
            </form>

            <Suspense fallback={null}>
              <TripFilters sort={sort} dateFrom={date_from} dateTo={date_to} />
            </Suspense>

            <p className="mt-3 text-sm text-stone-600">
              {trips.length} trip{trips.length !== 1 ? "s" : ""} found
              {search && (
                <>
                  {" "}for &ldquo;{search}&rdquo;
                  {(() => {
                    const sp = new URLSearchParams();
                    if (activity) sp.set("activity", activity);
                    if (difficulty) sp.set("difficulty", difficulty);
                    if (date_from) sp.set("date_from", date_from);
                    if (date_to) sp.set("date_to", date_to);
                    if (sort && sort !== "soonest") sp.set("sort", sort);
                    const qs = sp.toString();
                    return (
                      <Link
                        href={`/trips${qs ? `?${qs}` : ""}`}
                        className="ml-2 text-stone-400 underline-offset-4 hover:text-stone-600 hover:underline"
                      >
                        Clear search
                      </Link>
                    );
                  })()}
                </>
              )}
            </p>

            <div className="mt-6 space-y-3">
              {/* Activity filter */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Activity
                </p>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                  {ACTIVITIES.map((a) => {
                    const active = a === currentActivity;
                    return (
                      <Link
                        key={a}
                        href={filterUrl(current, "activity", a)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                          active
                            ? "bg-trailhead text-white shadow-sm"
                            : "border border-stone-200 bg-white text-stone-700 hover:border-trailhead hover:text-trailhead"
                        }`}
                      >
                        {a}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Difficulty filter */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Difficulty
                </p>
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                  {DIFFICULTIES.map((d) => {
                    const active = d === currentDifficulty;
                    return (
                      <Link
                        key={d}
                        href={filterUrl(current, "difficulty", d)}
                        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                          active
                            ? "bg-trailhead text-white shadow-sm"
                            : "border border-stone-200 bg-white text-stone-700 hover:border-trailhead hover:text-trailhead"
                        }`}
                      >
                        {d}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
          {trips.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-stone-500">No trips match your filters.</p>
              <Link
                href="/trips"
                className="mt-4 inline-block text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {trips.map((trip) => (
                <li key={trip.id}>
                  <Link
                    href={`/trips/${trip.slug}`}
                    className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2"
                  >
                    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
                      <div className="relative aspect-[3/1] overflow-hidden bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80 sm:aspect-[4/3]">
                        {trip.photos?.[0] && (
                          <Image
                            src={trip.photos[0]}
                            alt={trip.title}
                            fill
                            className="object-cover"
                            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
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
                        <p className="text-sm text-stone-500">{trip.destination}</p>
                        <p className="text-xs text-stone-400">{formatDate(trip.date_start)}</p>
                        <div className="mt-auto flex items-center justify-between border-t border-stone-100 pt-3">
                          <p className="text-lg font-bold text-trailhead">
                            {formatPrice(trip.price)}
                          </p>
                          <span className={`text-xs font-medium ${trip.remaining_slots < 5 ? "text-red-600" : "text-stone-400"}`}>
                            {trip.remaining_slots} slot{trip.remaining_slots !== 1 ? "s" : ""} left
                          </span>
                        </div>
                      </div>
                    </article>
                  </Link>
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
