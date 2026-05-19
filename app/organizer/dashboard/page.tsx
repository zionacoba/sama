import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ShareButton } from "@/app/components/share-button";
import { DashboardFilters } from "./dashboard-filters";

const PAGE_SIZE = 12;

type OrganizerTrip = {
  id: string | number;
  slug: string;
  title: string;
  activity_type: string | null;
  difficulty: string;
  date_start: string;
  price: number;
  total_slots: number;
  remaining_slots: number;
  status: string;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(price);
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles}`}>
      {level}
    </span>
  );
}

type TripCounts = { pending: number; confirmed: number };

function TripCard({
  trip,
  counts,
}: {
  trip: OrganizerTrip;
  counts: TripCounts;
}) {
  const slotsBooked = trip.total_slots - trip.remaining_slots;
  const fillPct = trip.total_slots > 0 ? Math.min(100, (slotsBooked / trip.total_slots) * 100) : 0;
  const isPast = new Date(trip.date_start) < new Date();

  return (
    <div className={`flex flex-col rounded-2xl border bg-white shadow-sm transition hover:shadow-md ${isPast ? "border-stone-200 opacity-75" : "border-stone-200"}`}>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/trips/${trip.slug}`}
              className="font-bold text-stone-900 underline-offset-2 hover:text-trailhead hover:underline"
            >
              {trip.title}
            </Link>
            <p className="mt-0.5 text-sm text-stone-500">
              {formatDate(trip.date_start)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
              trip.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-600"
            }`}
          >
            {trip.status}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {trip.activity_type && (
            <span className="rounded-full bg-trailhead-muted px-2 py-0.5 text-xs font-semibold text-trailhead">
              {trip.activity_type}
            </span>
          )}
          <DifficultyBadge level={trip.difficulty} />
          <span className="text-xs text-stone-400">{formatPrice(trip.price)}</span>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
            <span>{slotsBooked} / {trip.total_slots} slots filled</span>
            <span>{Math.round(fillPct)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-2 rounded-full bg-trailhead transition-all"
              style={{ width: `${fillPct}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {counts.pending > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {counts.pending} pending
            </span>
          )}
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
            {counts.confirmed} confirmed
          </span>
          {counts.pending === 0 && counts.confirmed === 0 && (
            <span className="text-xs text-stone-400">No bookings yet</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-stone-100 px-5 py-3">
        <Link
          href={`/organizer/trips/${trip.slug}/bookings`}
          className="flex-1 rounded-lg bg-trailhead px-3 py-1.5 text-center text-xs font-semibold text-white transition hover:bg-trailhead-dark"
        >
          View bookings
        </Link>
        <Link
          href={`/organizer/trips/${trip.slug}/edit`}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
        >
          Edit
        </Link>
        <ShareButton
          url={`/trips/${trip.slug}`}
          title={trip.title}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
        />
      </div>
    </div>
  );
}

type PageProps = {
  searchParams: Promise<{
    tab?: string;
    search?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
  }>;
};

export default async function OrganizerDashboardPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, full_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer) redirect("/organizer/apply");

  if (organizer.status !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">{organizer.status === "rejected" ? "❌" : "⏳"}</p>
          <h1 className="mt-4 text-xl font-bold text-stone-900">
            {organizer.status === "rejected" ? "Application not approved" : "Application under review"}
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {organizer.status === "rejected"
              ? "Your application wasn't approved. Reach out to us if you have questions."
              : "Your application is being reviewed. We'll notify you once it's approved."}
          </p>
          <Link href="/" className="mt-6 inline-block text-sm font-semibold text-trailhead underline-offset-4 hover:underline">
            ← Back to site
          </Link>
        </div>
      </div>
    );
  }

  const { data: tripsData } = await supabase
    .from("trips")
    .select("id, slug, title, activity_type, difficulty, date_start, price, total_slots, remaining_slots, status")
    .eq("organizer_id", organizer.id)
    .order("date_start", { ascending: true });

  const trips = (tripsData ?? []) as OrganizerTrip[];
  const tripIds = trips.map((t) => t.id);

  const { data: bookingSummaries } =
    tripIds.length > 0
      ? await supabase.from("bookings").select("trip_id, status").in("trip_id", tripIds)
      : { data: [] };

  const countsByTrip = new Map<string | number, TripCounts>();
  for (const b of bookingSummaries ?? []) {
    const c = countsByTrip.get(b.trip_id) ?? { pending: 0, confirmed: 0 };
    if (b.status === "pending") c.pending++;
    if (b.status === "confirmed") c.confirmed++;
    countsByTrip.set(b.trip_id, c);
  }

  const {
    tab,
    search = "",
    status = "all",
    date_from = "",
    date_to = "",
    page: pageParam,
  } = await searchParams;

  const activeTab = tab === "past" ? "past" : "upcoming";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const now = new Date().toISOString();

  const upcoming = trips.filter((t) => t.date_start > now);
  const past = trips.filter((t) => t.date_start <= now);

  // Start from the tab-filtered set
  let filtered = activeTab === "upcoming" ? [...upcoming] : [...past];

  // Status filter
  if (status === "active") {
    filtered = filtered.filter((t) => t.status === "active" && t.remaining_slots > 0);
  } else if (status === "full") {
    filtered = filtered.filter((t) => t.remaining_slots === 0);
  } else if (status === "past") {
    filtered = filtered.filter((t) => t.date_start <= now);
  }

  // Search filter
  if (search) {
    const term = search.toLowerCase();
    filtered = filtered.filter((t) => t.title.toLowerCase().includes(term));
  }

  // Date range filter
  if (date_from) {
    filtered = filtered.filter((t) => t.date_start >= `${date_from}T00:00:00`);
  }
  if (date_to) {
    filtered = filtered.filter((t) => t.date_start <= `${date_to}T23:59:59`);
  }

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageTrips = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const isFiltered = !!(search || (status && status !== "all") || date_from || date_to);

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    if (activeTab === "past") sp.set("tab", "past");
    if (search) sp.set("search", search);
    if (status && status !== "all") sp.set("status", status);
    if (date_from) sp.set("date_from", date_from);
    if (date_to) sp.set("date_to", date_to);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/organizer/dashboard${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-90">
              ⛰ Sama
            </Link>
            <p className="mt-0.5 text-sm text-trailhead-muted">Organizer Dashboard</p>
          </div>
          <Link href="/" className="text-sm font-medium text-trailhead-muted transition hover:text-white">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {/* Welcome */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Welcome back, {organizer.full_name}! 👋
              </h1>
              <p className="mt-1 text-stone-600">
                {trips.length} trip{trips.length !== 1 ? "s" : ""} total ·{" "}
                {(bookingSummaries ?? []).filter((b) => b.status === "pending").length} pending bookings
              </p>
            </div>
            <Link
              href="/organizer/trips/new"
              className="shrink-0 rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
            >
              + Create new trip
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8">
          <div className="flex w-fit gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
            {(["upcoming", "past"] as const).map((t) => {
              const label = t === "upcoming" ? "Upcoming" : "Past";
              const count = t === "upcoming" ? upcoming.length : past.length;
              const isActive = activeTab === t;
              // Tab links preserve filters but reset page
              const tabUrl = (() => {
                const sp = new URLSearchParams();
                if (t === "past") sp.set("tab", "past");
                if (search) sp.set("search", search);
                if (status && status !== "all") sp.set("status", status);
                if (date_from) sp.set("date_from", date_from);
                if (date_to) sp.set("date_to", date_to);
                const qs = sp.toString();
                return `/organizer/dashboard${qs ? `?${qs}` : ""}`;
              })();
              return (
                <Link
                  key={t}
                  href={tabUrl}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-trailhead text-white shadow-sm"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  {label}
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                    isActive ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                  }`}>
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Filters */}
          <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
            <Suspense fallback={null}>
              <DashboardFilters
                search={search}
                status={status}
                dateFrom={date_from}
                dateTo={date_to}
              />
            </Suspense>
          </div>

          {/* Results summary */}
          {isFiltered && (
            <p className="mt-3 text-sm text-stone-500">
              {totalFiltered} trip{totalFiltered !== 1 ? "s" : ""} found
              {" · "}
              <Link
                href={`/organizer/dashboard${activeTab === "past" ? "?tab=past" : ""}`}
                className="text-stone-400 underline-offset-4 hover:text-stone-600 hover:underline"
              >
                Clear filters
              </Link>
            </p>
          )}

          {/* Trip grid */}
          <div className="mt-6">
            {pageTrips.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <p className="text-stone-500">
                  {isFiltered
                    ? "No trips match your filters."
                    : activeTab === "upcoming"
                      ? "No upcoming trips. Create one to get started."
                      : "No past trips yet."}
                </p>
                {!isFiltered && activeTab === "upcoming" && (
                  <Link
                    href="/organizer/trips/new"
                    className="rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
                  >
                    Create your first trip
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pageTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    counts={countsByTrip.get(trip.id) ?? { pending: 0, confirmed: 0 }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-between">
              <p className="text-sm text-stone-500">
                Page {safePage} of {totalPages} · {totalFiltered} trip{totalFiltered !== 1 ? "s" : ""}
              </p>
              <div className="flex gap-2">
                {safePage > 1 ? (
                  <Link
                    href={pageUrl(safePage - 1)}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="rounded-xl border border-stone-100 bg-white px-4 py-2 text-sm font-medium text-stone-300 shadow-sm">
                    ← Previous
                  </span>
                )}
                {safePage < totalPages ? (
                  <Link
                    href={pageUrl(safePage + 1)}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="rounded-xl border border-stone-100 bg-white px-4 py-2 text-sm font-medium text-stone-300 shadow-sm">
                    Next →
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
