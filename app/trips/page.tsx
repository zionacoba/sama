import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Navbar } from "@/app/components/navbar";
import { Footer } from "@/app/components/footer";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { TripFilters } from "./trip-filters";
import { FilterDisclosure } from "./filter-disclosure";
import { FilterDropdown } from "./filter-dropdown";
import { formatPeso } from "@/lib/format";

export const metadata: Metadata = {
  title: "Browse trips",
  description:
    "Browse hikes, camps, dives, and island hops across the Philippines. Filter by activity and difficulty to find your next adventure.",
  openGraph: {
    title: "Browse trips | Sama",
    description:
      "Browse hikes, camps, dives, and island hops across the Philippines. Filter by activity and difficulty to find your next adventure.",
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/trips`,
    type: "website",
  },
};

const ACTIVITIES = ["All", "Hiking", "Freediving", "Beach & Island"] as const;
const DURATIONS  = ["All", "Day tour", "2D1N", "3D2N", "4D3N+"] as const;
const DIFFICULTIES = ["All", "Beginner", "Intermediate", "Advanced"] as const;
const REGIONS = ["All", "Luzon", "Visayas", "Mindanao"] as const;

type Trip = {
  id: string | number;
  slug: string;
  title: string;
  price: string | number;
  destination: string;
  region: string | null;
  difficulty: string;
  activity_type: string | null;
  duration: string | null;
  date_start: string;
  date_end: string | null;
  remaining_slots: number;
  photos: string[] | null;
  is_template: boolean | null;
  template_id: string | null;
};

const PAGE_SIZE = 12;

type FilterParams = {
  activity?: string;
  duration?: string;
  difficulty?: string;
  region?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort?: string;
  page?: string;
};

type PageProps = {
  searchParams: Promise<FilterParams>;
};

function formatPrice(price: string | number) {
  if (typeof price === "string") return price;
  return formatPeso(price);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function formatDateRange(start: string, end: string | null | undefined) {
  if (!end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function DifficultyBadge({ level, className = "" }: { level: string; className?: string }) {
  const styles =
    level === "Beginner"
        ? "bg-emerald-100 text-emerald-800"
        : level === "Intermediate"
          ? "bg-amber-100 text-amber-900"
          : level === "Advanced"
            ? "bg-orange-100 text-orange-900"
            : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles} ${className}`}>
      {level}
    </span>
  );
}

type TripGroup = { key: string; representative: Trip; runs: Trip[] };

function groupByTemplate(trips: Trip[]): TripGroup[] {
  const grouped = new Map<string, Trip[]>();
  const standalone: Trip[] = [];
  for (const trip of trips) {
    if (trip.template_id) {
      const arr = grouped.get(trip.template_id) ?? [];
      arr.push(trip);
      grouped.set(trip.template_id, arr);
    } else {
      standalone.push(trip);
    }
  }
  const result: TripGroup[] = [];
  for (const [templateId, runs] of grouped) {
    runs.sort((a, b) => a.date_start.localeCompare(b.date_start));
    result.push({ key: `tmpl-${templateId}`, representative: runs[0], runs });
  }
  for (const trip of standalone) {
    result.push({ key: String(trip.id), representative: trip, runs: [trip] });
  }
  result.sort((a, b) => a.representative.date_start.localeCompare(b.representative.date_start));
  return result;
}

function filterUrl(
  base: FilterParams,
  key: "activity" | "duration" | "difficulty" | "region",
  value: string,
) {
  const deselect = value === "All" || base[key] === value;
  const next: FilterParams = { ...base, [key]: deselect ? undefined : value };
  const sp = new URLSearchParams();
  if (next.search) sp.set("search", next.search);
  if (next.activity) sp.set("activity", next.activity);
  if (next.duration) sp.set("duration", next.duration);
  if (next.difficulty) sp.set("difficulty", next.difficulty);
  if (next.region) sp.set("region", next.region);
  if (next.date_from) sp.set("date_from", next.date_from);
  if (next.date_to) sp.set("date_to", next.date_to);
  if (next.sort && next.sort !== "soonest") sp.set("sort", next.sort);
  const qs = sp.toString();
  return `/trips${qs ? `?${qs}` : ""}`;
}

export default async function TripsPage({ searchParams }: PageProps) {
  const { activity, duration, difficulty, region, search, date_from, date_to, sort = "soonest", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("trips")
    .select("id, slug, title, activity_type, difficulty, price, date_start, date_end, remaining_slots, total_slots, photos, destination, region, duration, is_template, template_id", { count: "exact" })
    .eq("status", "active")
    .gt("date_start", (() => {
      // Cutoff: tomorrow (PHT date) at 12:00 noon PHT = 04:00 UTC. PHT = UTC+8, no DST.
      const phtOffsetMs = 8 * 60 * 60 * 1000;
      const tomorrowPHT = new Date(Date.now() + phtOffsetMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return `${tomorrowPHT}T04:00:00.000Z`;
    })())
    .gt("remaining_slots", 0)
    .or("is_template.is.null,is_template.eq.false");

  if (search) {
    const escapedSearch = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const term = `%${escapedSearch}%`;
    const { data: matchingOrgs } = await supabase
      .from("organizers")
      .select("id")
      .or(`display_name.ilike.${term},full_name.ilike.${term}`);
    const orgIds = (matchingOrgs ?? []).map((o: { id: string }) => o.id);
    if (orgIds.length > 0) {
      const orgFilters = orgIds.map((id: string) => `organizer_id.eq.${id}`).join(",");
      query = query.or(`title.ilike.${term},destination.ilike.${term},description.ilike.${term},region.ilike.${term},activity_type.ilike.${term},${orgFilters}`);
    } else {
      query = query.or(`title.ilike.${term},destination.ilike.${term},description.ilike.${term},region.ilike.${term},activity_type.ilike.${term}`);
    }
  }
  if (activity) query = query.eq("activity_type", activity);
  if (duration) query = query.eq("duration", duration);
  if (difficulty) query = query.eq("difficulty", difficulty);
  if (region) query = query.eq("region", region);
  if (date_from) query = query.gte("date_start", `${date_from}T00:00:00`);
  if (date_to) query = query.lte("date_start", `${date_to}T23:59:59`);

  switch (sort) {
    case "latest":     query = query.order("date_start", { ascending: false }); break;
    case "price_asc":  query = query.order("price", { ascending: true });       break;
    case "price_desc": query = query.order("price", { ascending: false });      break;
    default:           query = query.order("date_start", { ascending: true });  break;
  }

  const { data, count } = await query.range(from, to);
  const trips = (data ?? []) as Trip[];
  const totalTrips = count ?? 0;
  const totalPages = Math.ceil(totalTrips / PAGE_SIZE);

  const currentActivity = activity ?? "All";
  const currentDuration = duration ?? "All";
  const currentDifficulty = difficulty ?? "All";
  const currentRegion = region ?? "All";
  const current = { activity, duration, difficulty, region, search, date_from, date_to, sort };
  const groups = groupByTemplate(trips);

  // Readable summary of non-default filters for the collapsed Filters button.
  const sortLabels: Record<string, string> = {
    latest: "Latest first",
    price_asc: "Price: low to high",
    price_desc: "Price: high to low",
  };
  const activeFilterLabels: string[] = [];
  if (activity) activeFilterLabels.push(activity);
  if (difficulty) activeFilterLabels.push(difficulty);
  if (duration) activeFilterLabels.push(duration);
  if (region) activeFilterLabels.push(region);
  if (date_from || date_to) activeFilterLabels.push("Dates");
  if (sort && sort !== "soonest" && sortLabels[sort]) activeFilterLabels.push(sortLabels[sort]);
  const activeFilterCount = activeFilterLabels.length;
  const SUMMARY_CAP = 3;
  const filterSummary =
    activeFilterCount <= SUMMARY_CAP
      ? activeFilterLabels.join(", ")
      : `${activeFilterLabels.slice(0, SUMMARY_CAP).join(", ")}, +${activeFilterCount - SUMMARY_CAP} more`;

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    if (search) sp.set("search", search);
    if (activity) sp.set("activity", activity);
    if (duration) sp.set("duration", duration);
    if (difficulty) sp.set("difficulty", difficulty);
    if (region) sp.set("region", region);
    if (date_from) sp.set("date_from", date_from);
    if (date_to) sp.set("date_to", date_to);
    if (sort && sort !== "soonest") sp.set("sort", sort);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/trips${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <Navbar />

      <main>
        <section className="border-b border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 py-4 sm:py-5">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
              Browse trips
            </h1>

            {/* Search bar stays visible; everything else collapses behind the Filters toggle */}
            <FilterDisclosure
              summary={filterSummary}
              activeCount={activeFilterCount}
              searchSlot={
                <form action="/trips" method="GET" className="flex min-w-0 flex-1 gap-2">
                {activity && <input type="hidden" name="activity" value={activity} />}
                {duration && <input type="hidden" name="duration" value={duration} />}
                {difficulty && <input type="hidden" name="difficulty" value={difficulty} />}
                {region && <input type="hidden" name="region" value={region} />}
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
                    className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 shadow-sm outline-none placeholder:text-stone-400 focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                  />
                </div>
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-trailhead px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
                >
                  Search
                </button>
              </form>
              }
            >
              <Suspense fallback={null}>
                <TripFilters sort={sort} dateFrom={date_from} dateTo={date_to} />
              </Suspense>

              {/* Filter dropdowns: 2-per-row on phones, one compact toolbar row on wider screens */}
              <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
                <FilterDropdown
                  label="Activity"
                  selectedValue={currentActivity}
                  options={ACTIVITIES.map((a) => ({
                    value: a,
                    label: a,
                    href: filterUrl(current, "activity", a),
                  }))}
                />
                <FilterDropdown
                  label="Level"
                  selectedValue={currentDifficulty}
                  options={DIFFICULTIES.map((d) => ({
                    value: d,
                    label: d,
                    href: filterUrl(current, "difficulty", d),
                  }))}
                />
                <FilterDropdown
                  label="Duration"
                  selectedValue={currentDuration}
                  options={DURATIONS.map((d) => ({
                    value: d,
                    label: d,
                    href: filterUrl(current, "duration", d),
                  }))}
                />
                <FilterDropdown
                  label="Region"
                  selectedValue={currentRegion}
                  options={REGIONS.map((r) => ({
                    value: r,
                    label: r,
                    href: filterUrl(current, "region", r),
                  }))}
                />
              </div>

              {/* Clear all: resets every filter, search, date, and sort back to defaults */}
              {(activeFilterCount > 0 || search) && (
                <div className="flex items-center justify-between rounded-xl border border-trailhead/20 bg-trailhead/5 px-3 py-1.5">
                  <span className="text-xs font-medium text-trailhead">
                    {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""} active
                  </span>
                  <Link
                    href="/trips"
                    className="inline-flex min-h-[40px] items-center text-xs font-semibold text-trailhead underline-offset-2 hover:underline"
                  >
                    Clear all
                  </Link>
                </div>
              )}
            </FilterDisclosure>

            <p className="mt-2 text-xs text-stone-500">
              {totalTrips} trip{totalTrips !== 1 ? "s" : ""} found
              {search && (
                <>
                  {" "}for &ldquo;{search}&rdquo;
                  {(() => {
                    const sp = new URLSearchParams();
                    if (activity) sp.set("activity", activity);
                    if (duration) sp.set("duration", duration);
                    if (difficulty) sp.set("difficulty", difficulty);
                    if (region) sp.set("region", region);
                    if (date_from) sp.set("date_from", date_from);
                    if (date_to) sp.set("date_to", date_to);
                    if (sort && sort !== "soonest") sp.set("sort", sort);
                    const qs = sp.toString();
                    return (
                      <Link
                        href={`/trips${qs ? `?${qs}` : ""}`}
                        className="ml-2 text-stone-500 underline-offset-4 hover:text-stone-600 hover:underline"
                      >
                        Clear search
                      </Link>
                    );
                  })()}
                </>
              )}
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          {groups.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-4xl" aria-hidden>🏔️</p>
              <p className="mt-4 text-lg font-semibold text-stone-800">No trips found</p>
              <p className="mt-1 text-sm text-stone-500">Try adjusting your filters or check back soon for new adventures.</p>
              <Link
                href="/trips"
                className="mt-6 inline-flex items-center rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-trailhead/90"
              >
                Clear all filters
              </Link>
            </div>
          ) : (
            <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              {groups.map(({ key, representative: trip, runs }, index) => {
                const isGrouped = runs.length > 1;
                const minPrice = isGrouped
                  ? Math.min(...runs.map((r) => Number(r.price)))
                  : Number(trip.price);
                const photoEl = (
                  <div className="relative aspect-[3/1] overflow-hidden bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80 sm:aspect-[4/3]">
                    {trip.photos?.[0] && (
                      <Image
                        src={trip.photos[0]}
                        alt={trip.title}
                        fill
                        className="object-cover"
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        quality={80}
                        priority={index < 4}
                      />
                    )}
                    {/* Mobile only: chips overlaid top-left on the photo with a subtle backdrop for legibility. Desktop keeps the chips below the image. */}
                    <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1.5 md:hidden">
                      {trip.activity_type && (
                        <span className="inline-flex items-center rounded-full bg-trailhead-muted/95 px-2 py-0.5 text-xs font-semibold text-trailhead shadow-sm ring-1 ring-black/5 backdrop-blur-sm">
                          {trip.activity_type}
                        </span>
                      )}
                      <DifficultyBadge level={trip.difficulty} className="shadow-sm ring-1 ring-black/5 backdrop-blur-sm" />
                    </div>
                  </div>
                );
                const cardContent = (
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
                    {isGrouped ? (
                      <Link href={`/trips/${trip.slug}`} className="block overflow-hidden">
                        {photoEl}
                      </Link>
                    ) : photoEl}
                    <div className="flex flex-1 flex-col gap-1.5 p-3 md:gap-2 md:p-4">
                      <div className="hidden flex-wrap items-center gap-1.5 md:flex">
                        {trip.activity_type && (
                          <span className="inline-flex items-center rounded-full bg-trailhead-muted px-2 py-0.5 text-xs font-semibold text-trailhead">
                            {trip.activity_type}
                          </span>
                        )}
                        <DifficultyBadge level={trip.difficulty} />
                      </div>
                      {isGrouped ? (
                        <h3>
                          <Link
                            href={`/trips/${trip.slug}`}
                            className="font-bold text-stone-900 underline-offset-2 hover:text-trailhead hover:underline"
                          >
                            {trip.title}
                          </Link>
                        </h3>
                      ) : (
                        <h3 className="font-bold text-stone-900">{trip.title}</h3>
                      )}
                      <p className="text-sm text-stone-500">{trip.destination}</p>
                      {isGrouped ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-stone-500">Pick a date:</span>
                          {runs.slice(0, 3).map((run) => (
                            <Link
                              key={run.id}
                              href={`/trips/${run.slug}`}
                              className="inline-flex min-h-[40px] items-center rounded-full border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                            >
                              {formatDate(run.date_start)}
                            </Link>
                          ))}
                          {runs.length > 3 && (
                            <span className="inline-flex min-h-[40px] items-center rounded-full border border-stone-100 px-3 py-2 text-xs text-stone-500">
                              +{runs.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-stone-500">
                          {formatDateRange(trip.date_start, trip.date_end)}{trip.duration && ` · ${trip.duration}`}
                        </p>
                      )}
                      <div className="mt-auto flex items-center justify-between border-t border-stone-100 pt-2.5 md:pt-3">
                        <p className="text-base font-bold text-trailhead md:text-lg">
                          {isGrouped ? `From ${formatPrice(minPrice)}` : formatPrice(trip.price)}
                        </p>
                        <span className={`text-xs font-medium ${trip.remaining_slots < 5 ? "text-red-600" : "text-stone-500"}`}>
                          {trip.remaining_slots} slot{trip.remaining_slots !== 1 ? "s" : ""} left
                        </span>
                      </div>
                    </div>
                  </article>
                );
                return (
                  <li key={key}>
                    {isGrouped ? cardContent : (
                      <Link
                        href={`/trips/${trip.slug}`}
                        className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2"
                      >
                        {cardContent}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-stone-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={pageUrl(page - 1)}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-300">
                    ← Previous
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={pageUrl(page + 1)}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="rounded-xl border border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-300">
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
            </>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
