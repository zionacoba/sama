import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { toggleFoundingPartner } from "@/app/actions/organizer";
import {
  approveOrganizer,
  rejectOrganizer,
  updateCommissionRate,
  getPendingPayouts,
  getPayoutHistory,
  createPayoutAction,
  markPayoutRemittedAction,
  type PendingPayoutOrganizer,
  type PendingPayout,
  type PayoutHistoryEntry,
} from "@/app/actions/admin";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const PAGE_SIZE = 20;

type PageProps = {
  searchParams: Promise<{ tab?: string; page?: string; commissionError?: string; payoutError?: string }>;
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
  years_experience: number | null;
  emergency_certified: boolean;
  status: string;
  is_founding_partner: boolean;
  commission_rate: number | null;
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
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function formatDateShort(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
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

function OrganizerPayoutCard({ org }: { org: PendingPayoutOrganizer }) {
  const payoutDetail = org.payoutMethod === "gcash" && org.gcashNumber
    ? `GCash: ${org.gcashNumber}${org.gcashName ? ` (${org.gcashName})` : ""}`
    : org.payoutMethod === "bank_transfer" && org.bankAccountNumber
      ? `${org.bankName ?? "Bank"} · ${org.bankAccountNumber}${org.bankAccountName ? ` (${org.bankAccountName})` : ""}`
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 bg-stone-50 px-5 py-3">
        <div>
          <span className="font-semibold text-stone-900">{org.displayName}</span>
          <span className="ml-2 text-sm text-stone-500">{org.email}</span>
        </div>
        <div className="text-sm">
          {payoutDetail
            ? <span className="text-stone-600">{payoutDetail}</span>
            : <span className="font-medium text-amber-600">No payout method set</span>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-xs font-semibold uppercase tracking-wide text-stone-400">
              <th className="px-5 py-2.5 text-left">Trip</th>
              <th className="px-5 py-2.5 text-left">Date</th>
              <th className="px-5 py-2.5 text-left">Participant</th>
              <th className="px-5 py-2.5 text-right">Total</th>
              <th className="px-5 py-2.5 text-right">Commission</th>
              <th className="px-5 py-2.5 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {org.bookings.map((b) => (
              <tr key={b.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-5 py-3 font-medium text-stone-900">{b.tripTitle}</td>
                <td className="whitespace-nowrap px-5 py-3 text-stone-600">{formatDateShort(b.tripDate)}</td>
                <td className="px-5 py-3 text-stone-700">{b.participantName}</td>
                <td className="px-5 py-3 text-right text-stone-700">{formatCurrency(b.totalAmount)}</td>
                <td className="px-5 py-3 text-right text-stone-400">−{formatCurrency(b.platformCommission)}</td>
                <td className="px-5 py-3 text-right font-semibold text-trailhead">{formatCurrency(b.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-stone-200 bg-stone-50 text-sm font-semibold">
              <td colSpan={3} className="px-5 py-3 text-stone-700">
                Total — {org.bookings.length} booking{org.bookings.length !== 1 ? "s" : ""}
              </td>
              <td className="px-5 py-3 text-right text-stone-700">{formatCurrency(org.totalAmount)}</td>
              <td className="px-5 py-3 text-right text-stone-400">−{formatCurrency(org.totalCommission)}</td>
              <td className="px-5 py-3 text-right font-bold text-trailhead">{formatCurrency(org.totalNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-end border-t border-stone-100 bg-stone-50 px-5 py-3">
        <form action={createPayoutAction}>
          <input type="hidden" name="organizerId" value={org.organizerId} />
          <input type="hidden" name="bookingIds" value={JSON.stringify(org.bookings.map((b) => b.id))} />
          <button
            type="submit"
            className="rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-trailhead-dark"
          >
            Create Payout — {formatCurrency(org.totalNet)} net
          </button>
        </form>
      </div>
    </div>
  );
}

function PendingPayoutCard({ payout }: { payout: PendingPayout }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-100 px-5 py-4">
        <div>
          <p className="font-semibold text-stone-900">{payout.organizerName}</p>
          <p className="text-sm text-stone-500">{payout.organizerEmail}</p>
          <p className="mt-1 text-xs text-stone-400">Created {formatCreatedAt(payout.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-trailhead">{formatCurrency(payout.netAmount)}</p>
          <p className="text-xs text-stone-500">
            {payout.bookingCount} booking{payout.bookingCount !== 1 ? "s" : ""} · {formatCurrency(payout.totalAmount)} gross · {formatCurrency(payout.platformCommission)} commission
          </p>
        </div>
      </div>
      <form action={markPayoutRemittedAction} className="flex flex-wrap items-end gap-3 px-5 py-4">
        <input type="hidden" name="payoutId" value={payout.id} />
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-stone-600">Reference number *</label>
          <input
            type="text"
            name="remittanceReference"
            required
            placeholder="GCash ref / bank transfer ref"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/20"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-stone-600">Notes (optional)</label>
          <input
            type="text"
            name="notes"
            placeholder="Any additional notes"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Mark as Remitted
        </button>
      </form>
    </div>
  );
}

function PayoutHistoryTable({ history }: { history: PayoutHistoryEntry[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-trailhead/20 bg-trailhead text-white">
              <th className="px-4 py-3 font-semibold">Organizer</th>
              <th className="px-4 py-3 text-right font-semibold">Net payout</th>
              <th className="px-4 py-3 text-right font-semibold">Commission</th>
              <th className="px-4 py-3 font-semibold">Reference</th>
              <th className="px-4 py-3 font-semibold">Date remitted</th>
              <th className="px-4 py-3 text-right font-semibold">Bookings</th>
              <th className="px-4 py-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-stone-500">
                  No payouts remitted yet.
                </td>
              </tr>
            ) : (
              history.map((p) => (
                <tr key={p.id} className="border-b border-stone-100 last:border-0 hover:bg-trailhead-muted/30">
                  <td className="px-4 py-3 font-medium text-stone-900">{p.organizerName}</td>
                  <td className="px-4 py-3 text-right font-semibold text-trailhead">{formatCurrency(p.netAmount)}</td>
                  <td className="px-4 py-3 text-right text-stone-500">{formatCurrency(p.platformCommission)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-700">{p.remittanceReference ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatCreatedAt(p.remittedAt)}</td>
                  <td className="px-4 py-3 text-right text-stone-700">{p.bookingCount}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-xs text-stone-500" title={p.notes ?? ""}>{p.notes ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AdminPage({ searchParams }: PageProps) {
  const { tab = "bookings", page: pageParam, commissionError, payoutError } = await searchParams;
  const activeTab = tab === "organizers" ? "organizers" : tab === "payouts" ? "payouts" : "bookings";
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

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const [
    { data: bookingData, error: bookingError, count: bookingCount },
    { data: orgData, error: orgError },
  ] = await Promise.all([
    adminClient
      .from("bookings")
      .select("id, full_name, email, phone, trips!bookings_trip_id_fkey(title), slots, total_amount, status, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to),
    adminClient
      .from("organizers")
      .select("id, full_name, email, bio, phone, facebook_url, past_trips_evidence, activity_types, years_experience, emergency_certified, status, is_founding_partner, commission_rate, created_at")
      .order("created_at", { ascending: false }),
  ]);

  // Payout data fetched only when on that tab.
  const [pendingPayouts, payoutHistory] = activeTab === "payouts"
    ? await Promise.all([getPendingPayouts(), getPayoutHistory()])
    : [null, null];

  const bookings = (bookingData ?? []) as unknown as Booking[];
  const totalBookings = bookingCount ?? 0;
  const totalPages = Math.ceil(totalBookings / PAGE_SIZE);

  const allApplications = (orgData ?? []) as OrganizerApplication[];
  const applications = [
    ...allApplications.filter((a) => a.status === "pending"),
    ...allApplications.filter((a) => a.status === "approved"),
    ...allApplications.filter((a) => a.status === "rejected"),
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
              <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
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
          <Link href="/admin?tab=payouts" className={tabClass("payouts")}>
            Payouts
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
                          <td className="px-4 py-3 font-mono text-xs text-stone-600">
                            {Number(booking.id).toString(16).toUpperCase().slice(-8).padStart(8, "0")}
                          </td>
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
            {commissionError && (
              <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Invalid commission rate. Must be between 1% and 20%.
              </p>
            )}
            {orgError && (
              <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Failed to load applications: {orgError.message}
              </p>
            )}

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-trailhead/20 bg-trailhead text-white">
                      <th className="w-36 px-3 py-3 font-semibold">Full name</th>
                      <th className="w-40 px-3 py-3 font-semibold">Email</th>
                      <th className="w-28 px-3 py-3 font-semibold">Phone</th>
                      <th className="w-14 px-3 py-3 font-semibold">FB</th>
                      <th className="w-32 px-3 py-3 font-semibold">Bio</th>
                      <th className="w-28 px-3 py-3 font-semibold">Activity</th>
                      <th className="w-10 px-3 py-3 font-semibold">Exp</th>
                      <th className="w-10 px-3 py-3 font-semibold">FA</th>
                      <th className="w-20 px-3 py-3 font-semibold">Status</th>
                      <th className="w-24 px-3 py-3 font-semibold">Applied</th>
                      <th className="w-28 px-3 py-3 font-semibold">Commission</th>
                      <th className="w-32 px-3 py-3 font-semibold">Actions</th>
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
                          <td className="w-36 max-w-[9rem] truncate px-3 py-3 font-medium text-stone-900" title={app.full_name}>
                            <a href={`/organizers/${app.id}`} target="_blank" rel="noopener noreferrer" className="hover:text-trailhead hover:underline underline-offset-2">{app.full_name}</a>
                          </td>
                          <td className="w-40 max-w-[10rem] truncate px-3 py-3 text-stone-600" title={app.email}>{app.email}</td>
                          <td className="w-28 px-3 py-3 text-stone-600">{app.phone}</td>
                          <td className="w-14 px-3 py-3">
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
                          <td className="w-32 max-w-[8rem] px-3 py-3 text-stone-600">
                            <p className="truncate text-xs" title={app.bio ?? ""}>{app.bio}</p>
                          </td>
                          <td className="w-28 max-w-[7rem] px-3 py-3 text-stone-600">
                            {app.activity_types?.length
                              ? <span className="block truncate text-xs" title={app.activity_types.join(", ")}>{app.activity_types.join(", ")}</span>
                              : <span className="text-stone-300">—</span>}
                          </td>
                          <td className="w-10 px-3 py-3 text-center text-stone-700">
                            {app.years_experience ?? <span className="text-stone-300">—</span>}
                          </td>
                          <td className="w-10 px-3 py-3 text-center">
                            {app.emergency_certified
                              ? <span className="text-emerald-600">✓</span>
                              : <span className="text-stone-300">—</span>}
                          </td>
                          <td className="w-20 px-3 py-3"><StatusBadge status={app.status} /></td>
                          <td className="w-24 whitespace-nowrap px-3 py-3 text-xs text-stone-500">
                            {new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(app.created_at))}
                          </td>
                          <td className="w-28 px-3 py-3">
                            <form action={updateCommissionRate} className="flex items-center gap-1">
                              <input type="hidden" name="organizerId" value={app.id} />
                              <input
                                type="number"
                                name="ratePercent"
                                defaultValue={Math.round((app.commission_rate ?? 0.05) * 100)}
                                min={1}
                                max={20}
                                step={1}
                                className="w-14 rounded border border-stone-200 px-1.5 py-1 text-xs text-stone-900 focus:border-trailhead focus:outline-none"
                              />
                              <span className="text-xs text-stone-400">%</span>
                              <button
                                type="submit"
                                className="rounded bg-trailhead/10 px-2 py-1 text-xs font-semibold text-trailhead hover:bg-trailhead/20"
                              >
                                Save
                              </button>
                            </form>
                          </td>
                          <td className="w-32 px-3 py-3">
                            <div className="flex flex-col gap-2">
                              {app.status === "pending" && (
                                <div className="flex items-center gap-2">
                                  <form action={approveOrganizer.bind(null, app.id)}>
                                    <button
                                      type="submit"
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                                    >
                                      Approve
                                    </button>
                                  </form>
                                  <form action={rejectOrganizer.bind(null, app.id)}>
                                    <button
                                      type="submit"
                                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                                    >
                                      Reject
                                    </button>
                                  </form>
                                </div>
                              )}
                              <form action={toggleFoundingPartner}>
                                <input type="hidden" name="id" value={app.id} />
                                <input type="hidden" name="is_founding_partner" value={(!app.is_founding_partner).toString()} />
                                <button
                                  type="submit"
                                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    app.is_founding_partner
                                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                      : "border border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-700"
                                  }`}
                                >
                                  {app.is_founding_partner ? "✦ Founding" : "Mark founding"}
                                </button>
                              </form>
                            </div>
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

        {/* ── Payouts tab ── */}
        {activeTab === "payouts" && (
          <section className="mt-8 space-y-10">
            {payoutError && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {payoutError === "missing"
                  ? "Missing required fields. Please try again."
                  : payoutError === "create"
                    ? "Failed to create payout record. Please try again."
                    : payoutError === "notfound"
                      ? "Payout not found or already remitted."
                      : "An error occurred. Please try again."}
              </p>
            )}

            {/* Unpaid bookings */}
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-stone-900">Unpaid Bookings</h2>
                <p className="mt-0.5 text-sm text-stone-500">Confirmed bookings from completed trips not yet included in a payout</p>
              </div>
              {pendingPayouts?.unpaid.length === 0 ? (
                <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
                  <p className="text-sm font-medium text-stone-500">All caught up — no unpaid bookings.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {pendingPayouts?.unpaid.map((org) => (
                    <OrganizerPayoutCard key={org.organizerId} org={org} />
                  ))}
                </div>
              )}
            </div>

            {/* Pending remittance */}
            {(pendingPayouts?.pending.length ?? 0) > 0 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-stone-900">Awaiting Remittance</h2>
                  <p className="mt-0.5 text-sm text-stone-500">Payout records created — enter a reference number once the transfer is sent</p>
                </div>
                <div className="space-y-4">
                  {pendingPayouts?.pending.map((payout) => (
                    <PendingPayoutCard key={payout.id} payout={payout} />
                  ))}
                </div>
              </div>
            )}

            {/* Payout history */}
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-bold text-stone-900">Payout History</h2>
              </div>
              <PayoutHistoryTable history={payoutHistory ?? []} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
