import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/app/components/navbar";
import { createSupabaseServerClient } from "@/lib/supabase-server";

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
  destination: string;
  difficulty: string;
  activity_type: string | null;
  date_start: string;
  remaining_slots: number;
  photos: string[] | null;
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
  const colorClass =
    level === "Beginner"
      ? "bg-emerald-100 text-emerald-800"
      : level === "Intermediate"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-800";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {level}
    </span>
  );
}

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("trips")
    .select("id, slug, title, price, destination, difficulty, activity_type, date_start, remaining_slots, photos")
    .eq("status", "active")
    .gt("date_start", new Date().toISOString())
    .order("date_start", { ascending: true })
    .limit(4);

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
            <form
              action="/trips"
              method="GET"
              className="mt-8 flex flex-col gap-3 sm:mx-auto sm:max-w-xl sm:flex-row sm:items-stretch"
            >
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
                  name="search"
                  type="search"
                  placeholder="Search destination, activity, or organizer…"
                  className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-4 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                />
              </div>
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto"
              >
                Search
              </button>
            </form>
            <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0">
              {filterChips.map((chip) => (
                <Link
                  key={chip}
                  href={`/trips?activity=${encodeURIComponent(chip)}`}
                  className="shrink-0 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:bg-trailhead-muted hover:text-trailhead sm:text-sm"
                >
                  {chip}
                </Link>
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
            <Link
              href="/trips"
              className="text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
            >
              View all trips
            </Link>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
          <ul className="flex gap-4 snap-x snap-mandatory sm:grid sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {trips.map((trip) => (
              <li key={trip.id ?? trip.title} className="w-[75vw] shrink-0 snap-start sm:w-auto">
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
                        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
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
          </div>
        </section>

        <aside className="border-t border-trailhead-dark/20 bg-trailhead px-4 py-10 text-white sm:py-12">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-lg font-semibold sm:text-xl">
              Are you a trip organizer? List your trips free.
            </p>
            <Link
              href="/organizer/apply"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-trailhead shadow transition hover:bg-trailhead-muted"
            >
              Get started
            </Link>
          </div>
        </aside>
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
