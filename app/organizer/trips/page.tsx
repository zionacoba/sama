import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type TripRow = {
  id: number;
  slug: string;
  title: string;
  date_start: string;
  price: number;
  total_slots: number;
  remaining_slots: number;
  status: string;
  is_template: boolean | null;
  template_id: string | null;
};

function formatDate(date: string) {
  if (date === "2099-12-31") return "Template";
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

function statusBadge(trip: TripRow) {
  if (trip.is_template) return { label: "Template", cls: "bg-violet-100 text-violet-700" };
  const now = new Date().toISOString().slice(0, 10);
  if (trip.date_start < now) return { label: "Past", cls: "bg-stone-100 text-stone-500" };
  if (trip.remaining_slots === 0) return { label: "Full", cls: "bg-amber-100 text-amber-700" };
  return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
}

export default async function OrganizerTripsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/trips");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/organizer/apply");

  const { data } = await supabase
    .from("trips")
    .select("id, slug, title, date_start, price, total_slots, remaining_slots, status, is_template, template_id")
    .eq("organizer_id", organizer.id)
    .order("is_template", { ascending: false })
    .order("date_start", { ascending: true });

  const trips = (data ?? []) as TripRow[];

  // A trip counts as a template if the column says so, or by the sentinel date
  // (handles rows saved before the is_template column was reliably written)
  const isTemplate = (t: TripRow) => t.is_template === true || t.date_start === "2099-12-31";

  // Group: templates with nested runs, then standalone trips
  type Group = { template: TripRow; runs: TripRow[] };
  const groups: Group[] = [];
  const groupedRunIds = new Set<number>();

  for (const template of trips.filter(isTemplate)) {
    const runs = trips.filter((t) => String(t.template_id) === String(template.id));
    runs.forEach((r) => groupedRunIds.add(r.id));
    groups.push({ template, runs });
  }

  const standalones = trips.filter((t) => !isTemplate(t) && !groupedRunIds.has(t.id));

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
          <Link
            href="/organizer/dashboard"
            className="text-sm font-medium text-trailhead-muted transition hover:text-white"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">My trips</h1>
          <Link
            href="/organizer/trips/new"
            className="rounded-xl bg-trailhead px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
          >
            + New trip
          </Link>
        </div>

        {trips.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center text-stone-500">
            <p className="text-sm">You haven&apos;t created any trips yet.</p>
            <Link
              href="/organizer/trips/new"
              className="mt-4 inline-block rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
            >
              Create your first trip
            </Link>
          </div>
        )}

        <div className="space-y-4">
          {/* Template groups */}
          {groups.map(({ template, runs }) => {
            const badge = statusBadge(template);
            return (
              <div key={template.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                {/* Template row */}
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <h2 className="truncate font-semibold text-stone-900">{template.title}</h2>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-400">{runs.length} scheduled run{runs.length !== 1 ? "s" : ""}</p>
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

                {/* Runs */}
                {runs.length > 0 && (
                  <div className="border-t border-stone-100">
                    {runs.map((run, idx) => {
                      const runBadge = statusBadge(run);
                      return (
                        <div
                          key={run.id}
                          className={`flex items-center justify-between gap-4 px-5 py-3 ${idx !== 0 ? "border-t border-stone-100" : ""} bg-stone-50`}
                        >
                          <div className="ml-4 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${runBadge.cls}`}>
                                {runBadge.label}
                              </span>
                              <span className="text-sm font-medium text-stone-700">{formatDate(run.date_start)}</span>
                              <span className="text-sm text-stone-400">{formatPrice(run.price)}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-stone-400">
                              {run.remaining_slots} / {run.total_slots} slots remaining
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Link
                              href={`/trips/${run.slug}`}
                              target="_blank"
                              className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
                            >
                              View
                            </Link>
                            <Link
                              href={`/organizer/trips/${run.slug}/edit`}
                              className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
                            >
                              Edit
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Standalone trips */}
          {standalones.map((trip) => {
            const badge = statusBadge(trip);
            const tmpl = isTemplate(trip);
            return (
              <div key={trip.id} className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <h2 className="truncate font-semibold text-stone-900">{trip.title}</h2>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {tmpl
                      ? "0 scheduled runs"
                      : `${formatDate(trip.date_start)} · ${formatPrice(trip.price)} · ${trip.remaining_slots}/${trip.total_slots} slots`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {tmpl ? (
                    <Link
                      href={`/organizer/trips/new?template_id=${trip.id}`}
                      className="rounded-lg border border-trailhead/30 px-3 py-1.5 text-xs font-semibold text-trailhead transition hover:bg-trailhead-muted"
                    >
                      + Add run
                    </Link>
                  ) : (
                    <Link
                      href={`/trips/${trip.slug}`}
                      target="_blank"
                      className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
                    >
                      View
                    </Link>
                  )}
                  <Link
                    href={`/organizer/trips/${trip.slug}/edit`}
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
