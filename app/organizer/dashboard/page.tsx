import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { DashboardFilters } from "./dashboard-filters";
import { TripRow, TripRunRow, type OrganizerTrip, type TripCounts } from "./trip-row";

const PAGE_SIZE = 20;

const isTemplateLike = (t: OrganizerTrip) =>
  t.is_template === true || t.date_start === "2099-12-31";

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

  if (!organizer) redirect("/apply");

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

  const [{ data: allTripsData }, resolvedParams] = await Promise.all([
    supabase
      .from("trips")
      .select("id, slug, title, activity_type, difficulty, date_start, price, total_slots, remaining_slots, status, is_template, template_id")
      .eq("organizer_id", organizer.id)
      .order("date_start", { ascending: true })
      .limit(500),
    searchParams,
  ]);

  const allTrips = (allTripsData ?? []) as OrganizerTrip[];
  const regularTrips = allTrips.filter((t) => !isTemplateLike(t));
  const templateTrips = allTrips.filter(isTemplateLike);

  const regularTripIds = regularTrips.map((t) => t.id);
  const { data: bookingSummaries } =
    regularTripIds.length > 0
      ? await supabase.from("bookings").select("trip_id, status").in("trip_id", regularTripIds)
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
  } = resolvedParams;

  const activeView = tab === "templates" ? "templates" : "trips";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10));
  const now = new Date().toISOString();

  // --- Trips tab filtering ---
  let filtered = [...regularTrips];

  if (status === "active") {
    filtered = filtered.filter((t) => t.status === "active" && t.remaining_slots > 0 && t.date_start > now);
  } else if (status === "full") {
    filtered = filtered.filter((t) => t.remaining_slots === 0);
  } else if (status === "past") {
    filtered = filtered.filter((t) => t.date_start <= now);
  }

  if (search) {
    const term = search.toLowerCase();
    filtered = filtered.filter((t) => t.title.toLowerCase().includes(term));
  }
  if (date_from) filtered = filtered.filter((t) => t.date_start >= `${date_from}T00:00:00`);
  if (date_to)   filtered = filtered.filter((t) => t.date_start <= `${date_to}T23:59:59`);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageTrips = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const isFiltered = !!(search || (status && status !== "all") || date_from || date_to);

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    if (search) sp.set("search", search);
    if (status && status !== "all") sp.set("status", status);
    if (date_from) sp.set("date_from", date_from);
    if (date_to) sp.set("date_to", date_to);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/organizer/dashboard${qs ? `?${qs}` : ""}`;
  }

  // --- Templates tab grouping ---
  type TemplateGroup = { template: OrganizerTrip; runs: OrganizerTrip[] };
  const templateGroups: TemplateGroup[] = [];
  for (const tmpl of templateTrips) {
    const runs = regularTrips.filter((t) => String(t.template_id) === String(tmpl.id));
    templateGroups.push({ template: tmpl, runs });
  }

  const pendingCount = (bookingSummaries ?? []).filter((b) => b.status === "pending").length;

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight hover:opacity-90">
              <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
            </Link>
            <p className="mt-0.5 text-sm text-trailhead-muted">Organizer Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href={`/organizers/${organizer.id}`}
              target="_blank"
              className="text-sm font-medium text-trailhead-muted transition hover:text-white"
            >
              View public profile
            </Link>
            <Link
              href="/organizer/profile"
              className="text-sm font-medium text-trailhead-muted transition hover:text-white"
            >
              Edit profile
            </Link>
            <Link href="/" className="text-sm font-medium text-trailhead-muted transition hover:text-white">
              ← Back to site
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Welcome */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Welcome back, {organizer.full_name}! 👋
              </h1>
              <p className="mt-1 text-stone-600">
                {regularTrips.length} trip{regularTrips.length !== 1 ? "s" : ""} · {templateTrips.length} template{templateTrips.length !== 1 ? "s" : ""} · {pendingCount} pending booking{pendingCount !== 1 ? "s" : ""}
              </p>
            </div>
            <Link
              href="/organizer/trips/new"
              className="shrink-0 rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
            >
              + New trip
            </Link>
          </div>
        </div>

        {/* Tabs: Trips | Templates */}
        <div className="mt-8">
          <div className="flex w-fit gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
            {([
              { key: "trips", label: "Trips", count: regularTrips.length, href: "/organizer/dashboard" },
              { key: "templates", label: "Templates", count: templateTrips.length, href: "/organizer/dashboard?tab=templates" },
            ] as const).map(({ key, label, count, href }) => {
              const isActive = activeView === key;
              return (
                <Link
                  key={key}
                  href={href}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    isActive ? "bg-trailhead text-white shadow-sm" : "text-stone-600 hover:text-stone-900"
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

          {/* ── Trips tab ── */}
          {activeView === "trips" && (
            <>
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

              {isFiltered && (
                <p className="mt-3 text-sm text-stone-500">
                  {totalFiltered} trip{totalFiltered !== 1 ? "s" : ""} found
                  {" · "}
                  <Link
                    href="/organizer/dashboard"
                    className="text-stone-400 underline-offset-4 hover:text-stone-600 hover:underline"
                  >
                    Clear filters
                  </Link>
                </p>
              )}

              <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                {pageTrips.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-16 text-center">
                    <p className="text-stone-500">
                      {isFiltered
                        ? "No trips match your filters."
                        : "No trips yet. Create one to get started."}
                    </p>
                    {!isFiltered && (
                      <Link
                        href="/organizer/trips/new"
                        className="rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
                      >
                        Create your first trip
                      </Link>
                    )}
                  </div>
                ) : (
                  pageTrips.map((trip) => (
                    <TripRow
                      key={trip.id}
                      trip={trip}
                      counts={countsByTrip.get(trip.id) ?? { pending: 0, confirmed: 0 }}
                    />
                  ))
                )}
              </div>

              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm text-stone-500">
                    Page {safePage} of {totalPages} · {totalFiltered} trip{totalFiltered !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-2">
                    {safePage > 1 ? (
                      <Link href={pageUrl(safePage - 1)} className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead">
                        ← Previous
                      </Link>
                    ) : (
                      <span className="rounded-xl border border-stone-100 bg-white px-4 py-2 text-sm font-medium text-stone-300">← Previous</span>
                    )}
                    {safePage < totalPages ? (
                      <Link href={pageUrl(safePage + 1)} className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead">
                        Next →
                      </Link>
                    ) : (
                      <span className="rounded-xl border border-stone-100 bg-white px-4 py-2 text-sm font-medium text-stone-300">Next →</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Templates tab ── */}
          {activeView === "templates" && (
            <div className="mt-4 space-y-3">
              {templateGroups.length === 0 ? (
                <div className="rounded-2xl border border-stone-200 bg-white px-6 py-14 text-center">
                  <p className="text-base font-semibold text-stone-800">No templates yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">
                    Templates are reusable trip blueprints. If you run the same trip regularly — like a monthly Pulag climb or a weekly freediving session — save it as a template once, then create a new run each time you want to list a specific date.
                  </p>
                  <Link
                    href="/organizer/trips/new?template=true"
                    className="mt-6 inline-block rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
                  >
                    Create a template
                  </Link>
                </div>
              ) : (
                templateGroups.map(({ template, runs }) => (
                  <div key={template.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                    {/* Template row */}
                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                            Template
                          </span>
                          <span className="truncate font-semibold text-stone-900">{template.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {runs.length} scheduled run{runs.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          href={`/organizer/trips/new?template_id=${template.id}`}
                          className="rounded-lg border border-trailhead/30 px-3 py-1.5 text-xs font-semibold text-trailhead transition hover:bg-trailhead-muted"
                        >
                          + Add run
                        </Link>
                        <Link
                          href={`/organizer/trips/${template.slug}/edit`}
                          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>

                    {/* Nested runs */}
                    {runs.length > 0 && (
                      <div className="border-t border-stone-100">
                        {runs.map((run, idx) => (
                          <TripRunRow key={run.id} run={run} idx={idx} />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
