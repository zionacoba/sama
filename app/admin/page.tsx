import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateOrganizerStatus } from "@/app/actions/organizer";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ADMIN_EMAIL = "acobapaulzion@gmail.com";
const PAGE_SIZE = 20;

type PageProps = {
  searchParams: Promise<{ tab?: string; page?: string }>;
};

type OrganizerApplication = {
  id: string;
  full_name: string;
  email: string;
  bio: string;
  phone: string;
  facebook_url: string | null;
  past_trips_evidence: string | null;
  activity_types: string[] | null;
  years_of_experience: number | null;
  emergency_certified: boolean;
  status: string;
  created_at: string;
};

type Booking = {
  id: string | number;
  full_name: string;
  email: string;
  phone: string;
  trips: { title: string } | null;
  slots: number;
  total_amount: number;
  status: string;
  created_at: string;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCreatedAt(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const styles =
    normalized === "confirmed" || normalized === "approved"
      ? "bg-emerald-100 text-emerald-800"
      : normalized === "cancelled" || normalized === "rejected"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-900";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles}`}>
      {status}
    </span>
  );
}

export default async function AdminPage({ searchParams }: PageProps) {
  const { tab = "bookings", page: pageParam } = await searchParams;
  const activeTab = tab === "organizers" ? "organizers" : "bookings";
  const page = Math.max(1, Number(pageParam) || 1);

  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (!user) redirect("/login?redirectTo=/admin");

  if (user.email !== ADMIN_EMAIL) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">🚫</p>
          <h1 className="mt-4 text-xl font-bold text-stone-900">Access denied</h1>
          <p className="mt-2 text-sm text-stone-600">You don&apos;t have permission to view this page.</p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white hover:bg-trailhead-dark">
            Back to site
          </Link>
        </div>
      </div>
    );
  }

  const adminClient = createSupabaseAdminClient();

  // Bookings — paginated
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: bookingData, error: bookingError, count: bookingCount } = await adminClient
    .from("bookings")
    .select("*, trips(title)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const bookings = (bookingData ?? []) as Booking[];
  const totalBookings = bookingCount ?? 0;
  const totalPages = Math.ceil(totalBookings / PAGE_SIZE);

  // Organizers — all, sorted pending first
  const { data: orgData, error: orgError } = await authClient
    .from("organizers")
    .select("id, full_name, email, bio, phone, facebook_url, past_trips_evidence, activity_types, years_of_experience, emergency_certified, status, created_at")
    .order("created_at", { ascending: false });

  const allApplications = (orgData ?? []) as OrganizerApplication[];
  const applications = [
    ...allApplications.filter((a) => a.status === "pending"),
    ...allApplications.filter((a) => a.status !== "pending"),
  ];

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition ${
      activeTab === t
        ? "bg-trailhead text-white shadow-sm"
        : "text-stone-600 hover:bg-stone-100"
    }`;

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-90">
              ⛰ Sama
            </Link>
            <p className="mt-0.5 text-sm text-trailhead-muted">Admin</p>
          </div>
          <Link href="/" className="text-sm font-medium text-trailhead-muted transition hover:text-white">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Admin
        </h1>

        <div className="mt-4 flex gap-2">
          <Link href="/admin?tab=bookings" className={tabClass("bookings")}>
            Bookings
            <span className="ml-1.5 text-xs font-normal opacity-75">({totalBookings})</span>
          </Link>
          <Link href="/admin?tab=organizers" className={tabClass("organizers")}>
            Organizers
            <span className="ml-1.5 text-xs font-normal opacity-75">({applications.length})</span>
          </Link>
        </div>

        {/* ── Bookings tab ── */}
        {activeTab === "bookings" && (
          <section className="mt-8">
            {bookingError && (
              <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Failed to load bookings: {bookingError.message}
              </p>
            )}

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-trailhead/20 bg-trailhead text-white">
                      <th className="px-4 py-3 font-semibold">Booking ID</th>
                      <th className="px-4 py-3 font-semibold">Full name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Trip</th>
                      <th className="px-4 py-3 font-semibold">Slots</th>
                      <th className="px-4 py-3 font-semibold">Total amount</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Date created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-stone-500">
                          No bookings yet.
                        </td>
                      </tr>
                    ) : (
                      bookings.map((booking) => (
                        <tr key={booking.id} className="border-b border-stone-100 last:border-0 hover:bg-trailhead-muted/30">
                          <td className="px-4 py-3 font-mono text-xs text-stone-600">{booking.id}</td>
                          <td className="px-4 py-3 font-medium text-stone-900">{booking.full_name}</td>
                          <td className="px-4 py-3 text-stone-600">{booking.email}</td>
                          <td className="px-4 py-3 text-stone-600">{booking.phone}</td>
                          <td className="px-4 py-3 text-stone-900">{booking.trips?.title ?? "—"}</td>
                          <td className="px-4 py-3 text-stone-900">{booking.slots}</td>
                          <td className="px-4 py-3 font-medium text-trailhead">{formatCurrency(booking.total_amount)}</td>
                          <td className="px-4 py-3"><StatusBadge status={booking.status} /></td>
                          <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatCreatedAt(booking.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-stone-500">
                  Page {page} of {totalPages} · {totalBookings} bookings total
                </p>
                <div className="flex gap-2">
                  {page > 1 ? (
                    <Link
                      href={`/admin?tab=bookings&page=${page - 1}`}
                      className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span className="rounded-lg border border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-300">
                      ← Previous
                    </span>
                  )}
                  {page < totalPages ? (
                    <Link
                      href={`/admin?tab=bookings&page=${page + 1}`}
                      className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                    >
                      Next →
                    </Link>
                  ) : (
                    <span className="rounded-lg border border-stone-100 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-300">
                      Next →
                    </span>
                  )}
                </div>
              </div>
            )}

            {totalPages <= 1 && totalBookings > 0 && (
              <p className="mt-4 text-sm text-stone-500">{totalBookings} booking{totalBookings !== 1 ? "s" : ""} total</p>
            )}
          </section>
        )}

        {/* ── Organizers tab ── */}
        {activeTab === "organizers" && (
          <section className="mt-8">
            {orgError && (
              <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Failed to load applications: {orgError.message}
              </p>
            )}

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-trailhead/20 bg-trailhead text-white">
                      <th className="px-4 py-3 font-semibold">Full name</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Facebook</th>
                      <th className="px-4 py-3 font-semibold">Bio</th>
                      <th className="px-4 py-3 font-semibold">Past trips</th>
                      <th className="px-4 py-3 font-semibold">Activity types</th>
                      <th className="px-4 py-3 font-semibold">Yrs exp</th>
                      <th className="px-4 py-3 font-semibold">First aid</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Date applied</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-12 text-center text-stone-500">
                          No applications yet.
                        </td>
                      </tr>
                    ) : (
                      applications.map((app) => (
                        <tr key={app.id} className="border-b border-stone-100 last:border-0 hover:bg-trailhead-muted/30">
                          <td className="px-4 py-3 font-medium text-stone-900">{app.full_name}</td>
                          <td className="px-4 py-3 text-stone-600">{app.email}</td>
                          <td className="px-4 py-3 text-stone-600">{app.phone}</td>
                          <td className="px-4 py-3">
                            {app.facebook_url ? (
                              <a
                                href={app.facebook_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-trailhead underline-offset-2 hover:underline"
                              >
                                View
                              </a>
                            ) : <span className="text-stone-300">—</span>}
                          </td>
                          <td className="max-w-xs px-4 py-3 text-stone-600">
                            <p className="line-clamp-2">{app.bio}</p>
                          </td>
                          <td className="max-w-xs px-4 py-3 text-stone-600">
                            {app.past_trips_evidence ? (
                              <p className="line-clamp-3 whitespace-pre-line text-xs">{app.past_trips_evidence}</p>
                            ) : <span className="text-stone-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-stone-600">
                            {app.activity_types?.length
                              ? <span className="text-xs">{app.activity_types.join(", ")}</span>
                              : <span className="text-stone-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-stone-700">
                            {app.years_of_experience ?? <span className="text-stone-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {app.emergency_certified
                              ? <span className="text-emerald-600">✓</span>
                              : <span className="text-stone-300">—</span>}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                          <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatCreatedAt(app.created_at)}</td>
                          <td className="px-4 py-3">
                            {app.status === "pending" && (
                              <div className="flex items-center gap-2">
                                <form action={updateOrganizerStatus}>
                                  <input type="hidden" name="id" value={app.id} />
                                  <input type="hidden" name="status" value="approved" />
                                  <button
                                    type="submit"
                                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                                  >
                                    Approve
                                  </button>
                                </form>
                                <form action={updateOrganizerStatus}>
                                  <input type="hidden" name="id" value={app.id} />
                                  <input type="hidden" name="status" value="rejected" />
                                  <button
                                    type="submit"
                                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                                  >
                                    Reject
                                  </button>
                                </form>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {applications.length > 0 && (
              <p className="mt-4 text-sm text-stone-500">
                {applications.filter((a) => a.status === "pending").length} pending · {applications.length} total
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
