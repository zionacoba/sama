import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/app/components/navbar";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const ACTIVITIES = ["All", "Hiking", "Camping", "Freediving", "Island Hopping", "Surfing"] as const;
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

type PageProps = {
  searchParams: Promise<{ activity?: string; difficulty?: string; search?: string }>;
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
  base: { activity?: string; difficulty?: string; search?: string },
  key: "activity" | "difficulty",
  value: string,
) {
  const next = { ...base, [key]: value === "All" ? undefined : value };
  const sp = new URLSearchParams();
  if (next.search) sp.set("search", next.search);
  if (next.activity) sp.set("activity", next.activity);
  if (next.difficulty) sp.set("difficulty", next.difficulty);
  const qs = sp.toString();
  return `/trips${qs ? `?${qs}` : ""}`;
}

export default async function TripsPage({ searchParams }: PageProps) {
  const { activity, difficulty, search } = await searchParams;

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

  const { data } = await query.order("created_at", { ascending: false });
  const trips = (data ?? []) as Trip[];

  const currentActivity = activity ?? "All";
  const currentDifficulty = difficulty ?? "All";
  const current = { activity, difficulty, search };

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <Navbar />

      <main>
        <section className="border-b border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 py-10 sm:py-12">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Browse trips
            </h1>
            {search && (
              <p className="mt-1 text-sm font-medium text-trailhead">
                Searching for: &ldquo;{search}&rdquo;{" "}
                <Link href="/trips" className="ml-1 text-stone-400 underline-offset-4 hover:text-stone-600 hover:underline">
                  Clear
                </Link>
              </p>
            )}
            <p className="mt-1 text-stone-600">
              {trips.length} trip{trips.length !== 1 ? "s" : ""} found
            </p>

            <div className="mt-6 space-y-3">
              {/* Activity filter */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Activity
                </p>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITIES.map((a) => {
                    const active = a === currentActivity;
                    return (
                      <Link
                        key={a}
                        href={filterUrl(current, "activity", a)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
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
                <div className="flex flex-wrap gap-2">
                  {DIFFICULTIES.map((d) => {
                    const active = d === currentDifficulty;
                    return (
                      <Link
                        key={d}
                        href={filterUrl(current, "difficulty", d)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
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
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {trips.map((trip) => (
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
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
      </footer>
    </div>
  );
}
