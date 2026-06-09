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
  getPendingReviews,
  approveReview,
  type PendingPayoutOrganizer,
  type PayoutHistoryEntry,
  type PendingReview,
} from "@/app/actions/admin";
import { PendingPayoutCard } from "./pending-payout-card";
import { OrganizerApproveButton } from "./organizer-approve-button";
import { EditRemittanceReferenceButton } from "./edit-remittance-reference-button";
import { ExportPayoutCsvButton } from "./export-payout-csv-button";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const PAGE_SIZE = 20;

type PageProps = {
  searchParams: Promise<{ tab?: string; page?: string; commissionError?: string; payoutError?: string; orgFilter?: string; reviewError?: string }>;
};

type OrganizerApplication = {
  id: string;
  full_name: string;
  display_name: string | null;
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
  trips_per_month: number | null;
  operating_locations: string | null;
  social_links: { facebook?: string | null; organizer_facebook?: string | null; instagram?: string | null; tiktok?: string | null } | null;
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
                <td className="px-5 py-3 text-stone-700">
                  {b.participantName}
                  {b.downpaymentOnly && (
                    <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Downpayment only — balance not yet collected
                    </span>
                  )}
                </td>
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
                <>
                  <tr key={p.id} className="border-b border-stone-100 last:border-0 hover:bg-trailhead-muted/30">
                    <td className="px-4 py-3 font-medium text-stone-900">{p.organizerName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-trailhead">{formatCurrency(p.netAmount)}</td>
                    <td className="px-4 py-3 text-right text-stone-500">{formatCurrency(p.platformCommission)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-stone-700">
                      {p.remittanceReference ?? "—"}
                      <EditRemittanceReferenceButton payoutId={p.id} currentReference={p.remittanceReference} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-stone-600">{formatCreatedAt(p.remittedAt)}</td>
                    <td className="px-4 py-3 text-right text-stone-700">{p.bookingCount}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-stone-500" title={p.notes ?? ""}>{p.notes ?? "—"}</td>
                  </tr>
                  {p.needsReconciliation && (
                    <tr key={`${p.id}-reconciliation`} className="border-b border-amber-100 bg-amber-50">
                      <td colSpan={7} className="px-4 py-2 text-xs font-medium text-amber-800">
                        ⚠ One or more bookings in this payout have been cancelled after remittance. Manual reconciliation may be needed.
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AdminPage({ searchParams }: PageProps) {
  const { tab = "summary", page: pageParam, commissionError, payoutError, orgFilter = "pending", reviewError } = await searchParams;
  const activeTab = tab === "bookings" ? "bookings" : tab === "organizers" ? "organizers" : tab === "payouts" ? "payouts" : tab === "reviews" ? "reviews" : "summary";
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

  const todayISO = new Date().toISOString().split("T")[0];

  // Summary stats — fetched only when on summary tab (or always for header counts).
  const [
    summaryConfirmedBookings,
    summaryGmvRows,
    summaryActiveOrganizers,
    summaryPendingOrganizers,
    summaryActiveTrips,
    summaryPendingReviews,
  ] = activeTab === "summary"
    ? await Promise.all([
        adminClient.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        adminClient.from("bookings").select("total_amount, platform_commission").eq("status", "confirmed"),
        adminClient.from("organizers").select("id", { count: "exact", head: true }).eq("status", "approved"),
        adminClient.from("organizers").select("id", { count: "exact", head: true }).eq("status", "pending"),
        adminClient.from("trips").select("id", { count: "exact", head: true }).eq("status", "active").gt("date_start", todayISO),
        adminClient.from("reviews").select("id", { count: "exact", head: true }).eq("approved", false),
      ])
    : [null, null, null, null, null, null];

  const summaryHasError = !!(
    summaryConfirmedBookings?.error ||
    summaryGmvRows?.error ||
    summaryActiveOrganizers?.error ||
    summaryPendingOrganizers?.error ||
    summaryActiveTrips?.error ||
    summaryPendingReviews?.error
  );
  const summaryGmv = (summaryGmvRows?.data ?? []).reduce((sum: number, b: { total_amount: number }) => sum + (b.total_amount ?? 0), 0);
  const summarySamaRevenue = (summaryGmvRows?.data ?? []).reduce((sum: number, b: { platform_commission: number }) => sum + (b.platform_commission ?? 0), 0);

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
      .select("id, full_name, display_name, email, bio, phone, facebook_url, past_trips_evidence, activity_types, years_experience, emergency_certified, status, is_founding_partner, commission_rate, created_at, trips_per_month, operating_locations, social_links")
      .order("created_at", { ascending: false }),
  ]);

  // Payout data fetched only when on that tab.
  const [pendingPayouts, payoutHistory] = activeTab === "payouts"
    ? await Promise.all([getPendingPayouts(), getPayoutHistory()])
    : [null, null];

  // Reviews data fetched only when on that tab.
  const pendingReviews: PendingReview[] = activeTab === "reviews" ? await getPendingReviews() : [];

  const bookings = (bookingData ?? []) as unknown as Booking[];
  const totalBookings = bookingCount ?? 0;
  const totalPages = Math.ceil(totalBookings / PAGE_SIZE);

  const allApplications = (orgData ?? []) as OrganizerApplication[];
  const allSorted = [
    ...allApplications.filter((a) => a.status === "pending"),
    ...allApplications.filter((a) => a.status === "approved"),
    ...allApplications.filter((a) => a.status === "rejected"),
  ];

  const validOrgFilters = ["all", "pending", "approved", "rejected"] as const;
  type OrgFilter = typeof validOrgFilters[number];
  const activeOrgFilter: OrgFilter = (validOrgFilters as readonly string[]).includes(orgFilter) ? orgFilter as OrgFilter : "pending";

  const orgCounts = {
    all: allSorted.length,
    pending: allSorted.filter((a) => a.status === "pending").length,
    approved: allSorted.filter((a) => a.status === "approved").length,
    rejected: allSorted.filter((a) => a.status === "rejected").length,
  };

  const applications = activeOrgFilter === "all" ? allSorted : allSorted.filter((a) => a.status === activeOrgFilter);

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition ${
      activeTab === t
        ? "bg-trailhead text-white shadow-sm"
        : "text-stone-600 hover:bg-stone-100"
    }`;

  function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-stone-500">{label}</p>
        <p className="mt-2 text-3xl font-bold tracking-tight text-stone-900">{value}</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight hover:opacity-90">
            <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto brightness-0 invert" />
            Sama
            <span className="mx-1 font-normal text-trailhead-muted">·</span>
            <span className="text-base font-normal text-trailhead-muted">Admin</span>
          </Link>
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
          <Link href="/admin?tab=summary" className={tabClass("summary")}>
            Summary
          </Link>
          <Link href="/admin?tab=bookings" className={tabClass("bookings")}>
            Bookings
            <span className="ml-1.5 text-xs font-normal opacity-75">({totalBookings})</span>
          </Link>
          <Link href="/admin?tab=organizers" className={tabClass("organizers")}>
            Organizers
            <span className="ml-1.5 text-xs font-normal opacity-75">({allSorted.length})</span>
          </Link>
          <Link href="/admin?tab=payouts" className={tabClass("payouts")}>
            Payouts
          </Link>
          <Link href="/admin?tab=reviews" className={tabClass("reviews")}>
            Reviews
          </Link>
        </div>

        {/* ── Summary tab ── */}
        {activeTab === "summary" && (
          <section className="mt-8">
            {summaryHasError && (
              <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Some statistics could not be loaded. Refresh to try again.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <StatCard
                label="Confirmed bookings"
                value={summaryConfirmedBookings?.error ? "—" : (summaryConfirmedBookings?.count ?? 0).toLocaleString("en-PH")}
              />
              <StatCard
                label="Total GMV"
                value={summaryGmvRows?.error ? "—" : formatCurrency(summaryGmv)}
              />
              <StatCard
                label="Sama revenue"
                value={summaryGmvRows?.error ? "—" : formatCurrency(summarySamaRevenue)}
              />
              <StatCard
                label="Active organizers"
                value={summaryActiveOrganizers?.error ? "—" : (summaryActiveOrganizers?.count ?? 0).toLocaleString("en-PH")}
              />
              <StatCard
                label="Pending applications"
                value={summaryPendingOrganizers?.error ? "—" : (summaryPendingOrganizers?.count ?? 0).toLocaleString("en-PH")}
              />
              <StatCard
                label="Active trips"
                value={summaryActiveTrips?.error ? "—" : (summaryActiveTrips?.count ?? 0).toLocaleString("en-PH")}
              />
              <StatCard
                label="Pending reviews"
                value={summaryPendingReviews?.error ? "—" : (summaryPendingReviews?.count ?? 0).toLocaleString("en-PH")}
              />
            </div>
          </section>
        )}

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

            <div className="mb-4 flex gap-2">
              {(["all", "pending", "approved", "rejected"] as const).map((f) => (
                <Link
                  key={f}
                  href={`/admin?tab=organizers&orgFilter=${f}`}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition capitalize ${
                    activeOrgFilter === f
                      ? "bg-trailhead text-white shadow-sm"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
                  <span className={`text-xs font-normal ${activeOrgFilter === f ? "opacity-75" : "text-stone-400"}`}>
                    ({orgCounts[f]})
                  </span>
                </Link>
              ))}
            </div>

            <div className="space-y-3">
              {applications.length === 0 ? (
                <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
                  <p className="text-stone-500">No applications yet.</p>
                </div>
              ) : (
                applications.map((app) => {
                  const rawSl = app.social_links;
                  const sl = typeof rawSl === "string"
                    ? (() => { try { return JSON.parse(rawSl); } catch { return null; } })()
                    : rawSl;
                  const organizerFbUrl = sl?.organizer_facebook ?? sl?.facebook ?? null;
                  return (
                    <details key={app.id} className="group overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 hover:bg-stone-50">
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold text-stone-900">{app.full_name}</span>
                          {app.display_name && app.display_name !== app.full_name && (
                            <span className="ml-2 text-sm text-stone-400">&ldquo;{app.display_name}&rdquo;</span>
                          )}
                        </span>
                        <StatusBadge status={app.status} />
                        <span className="whitespace-nowrap text-xs text-stone-400">{formatDateShort(app.created_at)}</span>
                        <svg className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>

                      <div className="border-t border-stone-100 px-5 py-5">
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Full name</dt>
                            <dd className="mt-0.5 text-stone-900">{app.full_name}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Display name</dt>
                            <dd className="mt-0.5 text-stone-900">{app.display_name || <span className="text-stone-300">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Email</dt>
                            <dd className="mt-0.5 text-stone-900">{app.email}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Phone</dt>
                            <dd className="mt-0.5 text-stone-900">{app.phone || <span className="text-stone-300">—</span>}</dd>
                          </div>
                          <div className="sm:col-span-2 lg:col-span-3">
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Bio</dt>
                            <dd className="mt-0.5 leading-relaxed text-stone-900">{app.bio || <span className="text-stone-300">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Activity types</dt>
                            <dd className="mt-0.5 text-stone-900">{app.activity_types?.length ? app.activity_types.join(", ") : <span className="text-stone-300">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Years of experience</dt>
                            <dd className="mt-0.5 text-stone-900">{app.years_experience ?? <span className="text-stone-300">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Trips per month</dt>
                            <dd className="mt-0.5 text-stone-900">{app.trips_per_month ?? <span className="text-stone-300">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Operating locations</dt>
                            <dd className="mt-0.5 text-stone-900">{app.operating_locations || <span className="text-stone-300">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Personal Facebook</dt>
                            <dd className="mt-0.5">
                              {app.facebook_url
                                ? <a href={app.facebook_url} target="_blank" rel="noopener noreferrer" className="text-trailhead underline-offset-2 hover:underline">View ↗</a>
                                : <span className="text-stone-300">—</span>}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Organizer Facebook Page</dt>
                            <dd className="mt-0.5">
                              {organizerFbUrl
                                ? <a href={organizerFbUrl} target="_blank" rel="noopener noreferrer" className="text-trailhead underline-offset-2 hover:underline">View ↗</a>
                                : <span className="text-stone-300">—</span>}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Instagram</dt>
                            <dd className="mt-0.5">
                              {sl?.instagram
                                ? <a href={sl.instagram} target="_blank" rel="noopener noreferrer" className="text-trailhead underline-offset-2 hover:underline">View ↗</a>
                                : <span className="text-stone-300">—</span>}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Emergency certified</dt>
                            <dd className="mt-0.5 text-stone-900">{app.emergency_certified ? "Yes" : "No"}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Applied</dt>
                            <dd className="mt-0.5 text-stone-900">{formatCreatedAt(app.created_at)}</dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase tracking-wide text-stone-400">Status</dt>
                            <dd className="mt-0.5"><StatusBadge status={app.status} /></dd>
                          </div>
                        </dl>

                        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
                          {app.status === "pending" && (
                            <>
                              <OrganizerApproveButton id={app.id} />
                              <form action={rejectOrganizer.bind(null, app.id)}>
                                <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700">
                                  Reject
                                </button>
                              </form>
                            </>
                          )}
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
                            <button type="submit" className="rounded bg-trailhead/10 px-2 py-1 text-xs font-semibold text-trailhead hover:bg-trailhead/20">
                              Save commission
                            </button>
                          </form>
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
                      </div>
                    </details>
                  );
                })
              )}
            </div>

            {allSorted.length > 0 && (
              <p className="mt-4 text-sm text-stone-500">
                {orgCounts.pending} pending · {orgCounts.all} total
              </p>
            )}
          </section>
        )}

        {/* ── Reviews tab ── */}
        {activeTab === "reviews" && (
          <section className="mt-8">
            {reviewError && (
              <p role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                Failed to approve review. Please try again.
              </p>
            )}
            <div className="mb-4">
              <h2 className="text-xl font-bold text-stone-900">Pending Reviews</h2>
              <p className="mt-0.5 text-sm text-stone-500">Reviews submitted but not yet approved — they won't appear publicly until approved.</p>
            </div>
            {pendingReviews.length === 0 ? (
              <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
                <p className="text-stone-500">No reviews pending approval.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingReviews.map((review) => (
                  <div key={review.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-stone-900">{review.fullName ?? "Anonymous"}</span>
                          <span className="text-amber-500">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                          <span className="text-xs text-stone-400">on {review.tripTitle}</span>
                        </div>
                        <p className="mt-2 text-sm leading-relaxed text-stone-700">{review.body}</p>
                        <p className="mt-1 text-xs text-stone-400">{formatCreatedAt(review.createdAt)}</p>
                      </div>
                      <form action={approveReview}>
                        <input type="hidden" name="reviewId" value={review.id} />
                        <button
                          type="submit"
                          className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-stone-900">Payout History</h2>
                <ExportPayoutCsvButton />
              </div>
              <PayoutHistoryTable history={payoutHistory ?? []} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
