import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { BookingActions } from "@/app/organizer/dashboard/booking-actions";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
};

type Booking = {
  id: number;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  slots: number;
  total_amount: number;
  amount_due: number | null;
  payment_option: string;
  status: string;
  created_at: string;
  participants: string[] | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  waiver_agreed: boolean;
  medical_notes: string | null;
  notes: string | null;
  meeting_point: string | null;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    cancelled: "bg-red-100 text-red-700",
    rejected: "bg-red-100 text-red-700",
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-stone-100 text-stone-600"}`}>
      {label}
    </span>
  );
}

const NO_PICKUP = "No pickup point selected";

export default async function TripBookingsPage({ params, searchParams }: PageProps) {
  const [{ slug }, { view }] = await Promise.all([params, searchParams]);
  const isGrouped = view === "grouped";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/organizer/trips/${slug}/bookings`);

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/organizer/dashboard");

  const { data: trip } = await supabase
    .from("trips")
    .select("id, title, slug, difficulty, activity_type, date_start, total_slots, remaining_slots, price")
    .eq("slug", slug)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  if (!trip) redirect("/organizer/dashboard");

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(
      "id, user_id, full_name, email, phone, slots, total_amount, amount_due, payment_option, status, created_at, participants, emergency_contact_name, emergency_contact_phone, waiver_agreed, medical_notes, notes, meeting_point"
    )
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: false });

  const bookings = (bookingsData ?? []) as Booking[];

  const pending = bookings.filter((b) => b.status === "pending");
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const rejected = bookings.filter((b) => b.status === "rejected" || b.status === "cancelled");

  const needsManualApproval = trip.difficulty === "Advanced" || trip.difficulty === "Expert";
  const slotsBooked = trip.total_slots - trip.remaining_slots;

  // Grouped view: confirmed + pending only, grouped by meeting_point
  const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "pending");
  const groupMap = new Map<string, Booking[]>();
  for (const b of activeBookings) {
    const key = b.meeting_point?.trim() || NO_PICKUP;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(b);
  }
  const groups = Array.from(groupMap.entries()).sort(([a], [b]) => {
    if (a === NO_PICKUP) return 1;
    if (b === NO_PICKUP) return -1;
    return a.localeCompare(b);
  });

  const baseUrl = `/organizer/trips/${slug}/bookings`;

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

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Trip summary */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-stone-500">
                {trip.activity_type ?? "Trip"} · {trip.difficulty}
              </p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                {trip.title}
              </h1>
              <p className="mt-1 text-stone-500">{formatDate(trip.date_start)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold text-trailhead">
                {slotsBooked}
                <span className="text-base font-normal text-stone-400"> / {trip.total_slots}</span>
              </p>
              <p className="text-sm text-stone-500">slots filled</p>
            </div>
          </div>

          {/* Fill bar */}
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-2 rounded-full bg-trailhead transition-all"
                style={{ width: `${trip.total_slots > 0 ? Math.min(100, (slotsBooked / trip.total_slots) * 100) : 0}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {pending.length} pending
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {confirmed.length} confirmed
            </span>
            {rejected.length > 0 && (
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500">
                {rejected.length} rejected
              </span>
            )}
          </div>
        </div>

        {/* View toggle */}
        <div className="mt-6 flex items-center gap-2">
          <Link
            href={baseUrl}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              !isGrouped
                ? "bg-trailhead text-white shadow-sm"
                : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300 hover:text-stone-900"
            }`}
          >
            All bookings
          </Link>
          <Link
            href={`${baseUrl}?view=grouped`}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              isGrouped
                ? "bg-trailhead text-white shadow-sm"
                : "bg-white text-stone-600 border border-stone-200 hover:border-stone-300 hover:text-stone-900"
            }`}
          >
            By pickup point
          </Link>
        </div>

        {/* Flat table */}
        {!isGrouped && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            {bookings.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-stone-400">No bookings yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3 text-center">Slots</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Booked on</th>
                      {needsManualApproval && <th className="px-5 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {bookings.map((b) => (
                      <tr key={b.id} className="hover:bg-stone-50">
                        <td className="px-5 py-3.5 font-medium text-stone-900">{b.full_name}</td>
                        <td className="px-5 py-3.5 text-stone-500">{b.email}</td>
                        <td className="px-5 py-3.5 text-center text-stone-700">{b.slots}</td>
                        <td className="px-5 py-3.5 text-right font-semibold text-trailhead">
                          {formatCurrency(b.total_amount)}
                          {b.payment_option === "downpayment" && b.amount_due != null && (
                            <span className="ml-1 text-xs font-normal text-stone-400">
                              ({formatCurrency(b.amount_due)} due)
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-5 py-3.5 text-stone-500">{formatDateTime(b.created_at)}</td>
                        {needsManualApproval && (
                          <td className="px-5 py-3.5 text-right">
                            {b.status === "pending" && <BookingActions bookingId={b.id} />}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Grouped view */}
        {isGrouped && (
          <div className="mt-4 space-y-4">
            {activeBookings.length === 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center text-sm text-stone-400">
                No confirmed or pending bookings yet.
              </div>
            )}
            {groups.map(([label, group]) => {
              const totalSlots = group.reduce((sum, b) => sum + b.slots, 0);
              const isUnknown = label === NO_PICKUP;
              return (
                <div key={label} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                  <div className={`flex items-center gap-3 border-b border-stone-100 px-5 py-3.5 ${isUnknown ? "bg-stone-50" : "bg-white"}`}>
                    <h2 className={`font-semibold ${isUnknown ? "text-stone-400 italic" : "text-stone-900"}`}>
                      {label}
                    </h2>
                    <span className="rounded-full bg-trailhead-muted px-2.5 py-0.5 text-xs font-semibold text-trailhead">
                      {totalSlots} {totalSlots === 1 ? "joiner" : "joiners"}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                          <th className="px-5 py-3">Name</th>
                          <th className="px-5 py-3 text-center">Slots</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Booked on</th>
                          {needsManualApproval && <th className="px-5 py-3" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {group.map((b) => (
                          <tr key={b.id} className="hover:bg-stone-50">
                            <td className="px-5 py-3.5 font-medium text-stone-900">{b.full_name}</td>
                            <td className="px-5 py-3.5 text-center text-stone-700">{b.slots}</td>
                            <td className="px-5 py-3.5">
                              <StatusBadge status={b.status} />
                            </td>
                            <td className="px-5 py-3.5 text-stone-500">{formatDateTime(b.created_at)}</td>
                            {needsManualApproval && (
                              <td className="px-5 py-3.5 text-right">
                                {b.status === "pending" && <BookingActions bookingId={b.id} />}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
