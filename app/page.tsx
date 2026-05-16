import Link from "next/link";
import { Navbar } from "@/app/components/navbar";
import { supabase } from "@/lib/supabase";

const filterChips = [
  "Hiking",
  "Camping",
  "Freediving",
  "Island Hopping",
  "Surfing",
] as const;

type Trip = {
  id?: string | number;
  slug: string;
  title: string;
  price: string | number;
  location: string;
  difficulty: "Beginner" | "Intermediate";
  rating: number;
  reviews: number;
};

function StarRow({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <div
      className="flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`text-base leading-none ${
            i < filled ? "text-amber-500" : "text-stone-300"
          }`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function DifficultyBadge({ level }: { level: "Beginner" | "Intermediate" }) {
  const isBeginner = level === "Beginner";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isBeginner
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-900"
      }`}
    >
      {level}
    </span>
  );
}

export default async function Home() {
  const { data, error } = await supabase
  .from("trips")
  .select("*")
  .eq("status", "active");

console.log("trips data:", data);
console.log("trips error:", error);

const trips = (data ?? []) as Trip[];

  return (
    <div className="min-h-full bg-stone-50 text-stone-900 font-sans">
      <Navbar />

      <main>
        <section className="border-b border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl md:text-5xl">
              Find your next outdoor adventure
            </h1>
            <p className="mt-3 text-pretty text-stone-600 sm:text-lg">
              Guided hikes, camps, and coastal trips across Luzon, Visayas, and
              Mindanao — curated for every skill level.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:mx-auto sm:max-w-xl sm:flex-row sm:items-stretch">
              <label className="sr-only" htmlFor="search">
                Search trips
              </label>
              <div className="relative flex-1">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                  aria-hidden
                >
                  🔍
                </span>
                <input
                  id="search"
                  type="search"
                  placeholder="Search destination, activity, or organizer…"
                  className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-4 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                />
              </div>
              <button
                type="button"
                className="shrink-0 rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto"
              >
                Search
              </button>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:bg-trailhead-muted hover:text-trailhead sm:text-sm"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Popular trips
              </h2>
              <p className="mt-1 text-stone-600">
                Hand-picked experiences travelers love right now.
              </p>
            </div>
            <a
              href="#"
              className="text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
            >
              View all trips
            </a>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trips.map((trip) => (
              <li key={trip.id ?? trip.title}>
                <Link
                  href={`/trips/${trip.slug}`}
                  className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2"
                >
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
                  <div className="aspect-[4/3] bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80" />
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-bold text-stone-900">
                        {trip.title}
                      </h3>
                      <DifficultyBadge level={trip.difficulty} />
                    </div>
                    <p className="text-sm text-stone-500">{trip.location}</p>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-stone-100 pt-3">
                      <p className="text-lg font-bold text-trailhead">
                        {trip.price}
                      </p>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <StarRow rating={trip.rating} />
                          <span className="text-sm font-semibold text-stone-800">
                            {trip.rating}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500">
                          {trip.reviews} reviews
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <aside className="border-t border-trailhead-dark/20 bg-trailhead px-4 py-10 text-white sm:py-12">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-semibold sm:text-xl">
              Are you a trip organizer? List your trips free.
            </p>
            <a
              href="#"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-trailhead shadow transition hover:bg-trailhead-muted"
            >
              Get started
            </a>
          </div>
        </aside>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
      </footer>
    </div>
  );
}
