import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BookingActions } from "@/app/organizer/dashboard/booking-actions";

type PageProps = {
  params: Promise<{ slug: string }>;
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

function calculateAge(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function BookingCard({
  booking,
  age,
  showActions,
}: {
  booking: Booking;
  age: number | null;
  showActions: boolean;
}) {
  const isGroup = (booking.participants?.length ?? 0) > 1;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="font-semibold text-stone-900">{booking.full_name}</p>
          <p className="mt-0.5 truncate text-sm text-stone-500">
            {booking.email} · {booking.phone}
          </p>
          <p className="mt-1 text-sm text-stone-600">
            {booking.slots} slot{booking.slots !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-trailhead">{formatCurrency(booking.total_amount)}</p>
          <p className="mt-0.5 text-xs text-stone-400">
            {booking.payment_option === "downpayment" && booking.amount_due != null
              ? `${formatCurrency(booking.amount_due)} due now`
              : "Full payment"}
          </p>
        </div>
      </div>

      {/* Safety details */}
      <dl className="space-y-2 border-t border-stone-100 px-5 py-4 text-sm">
        {isGroup && (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-xs font-medium text-stone-400">Participants</dt>
            <dd className="text-stone-700">{booking.participants!.join(", ")}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-xs font-medium text-stone-400">Emergency</dt>
          <dd className="text-stone-700">
            {booking.emergency_contact_name || "—"}
            {booking.emergency_contact_phone ? ` · ${booking.emergency_contact_phone}` : ""}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-xs font-medium text-stone-400">Age</dt>
          <dd className="text-stone-700">
            {age != null ? `${age} yrs` : <span className="text-stone-400">not provided</span>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-xs font-medium text-stone-400">Medical</dt>
          <dd className="text-stone-700">
            {booking.medical_notes || <span className="text-stone-400">none</span>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-28 shrink-0 text-xs font-medium text-stone-400">Waiver</dt>
          <dd className={`font-medium ${booking.waiver_agreed ? "text-emerald-700" : "text-red-600"}`}>
            {booking.waiver_agreed ? "Agreed ✓" : "Not agreed ✗"}
          </dd>
        </div>
        {booking.notes && (
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-xs font-medium text-stone-400">Notes</dt>
            <dd className="text-stone-700">{booking.notes}</dd>
          </div>
        )}
      </dl>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-5 py-3">
        <p className="text-xs text-stone-400">Booked {formatDateTime(booking.created_at)}</p>
        {showActions && <BookingActions bookingId={booking.id} />}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
  emptyText,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-stone-900">
        {title}
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm font-semibold text-stone-600">
          {count}
        </span>
      </h2>
      {count === 0 ? (
        <p className="rounded-xl border border-stone-100 bg-white px-4 py-8 text-center text-sm text-stone-400">
          {emptyText}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
      )}
    </section>
  );
}

export default async function TripBookingsPage({ params }: PageProps) {
  const { slug } = await params;

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
      "id, user_id, full_name, email, phone, slots, total_amount, amount_due, payment_option, status, created_at, participants, emergency_contact_name, emergency_contact_phone, waiver_agreed, medical_notes, notes"
    )
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: false });

  const bookings = (bookingsData ?? []) as Booking[];

  // Fetch profiles for age calculation via admin (bypasses RLS)
  const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean) as string[])];
  const profilesByUserId: Record<string, { birthdate: string | null }> = {};
  if (userIds.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, birthdate")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profilesByUserId[p.id] = { birthdate: p.birthdate };
    }
  }

  const pending = bookings.filter((b) => b.status === "pending");
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const rejected = bookings.filter((b) => b.status === "rejected" || b.status === "cancelled");

  const needsManualApproval = trip.difficulty === "Advanced" || trip.difficulty === "Expert";
  const slotsBooked = trip.total_slots - trip.remaining_slots;

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

        {/* Sections */}
        <div className="mt-10 space-y-10">
          <Section title="Pending" count={pending.length} emptyText="No pending bookings.">
            {pending.map((b) => {
              const age = calculateAge(profilesByUserId[b.user_id ?? ""]?.birthdate);
              return (
                <BookingCard
                  key={b.id}
                  booking={b}
                  age={age}
                  showActions={needsManualApproval}
                />
              );
            })}
          </Section>

          <Section title="Confirmed" count={confirmed.length} emptyText="No confirmed bookings yet.">
            {confirmed.map((b) => {
              const age = calculateAge(profilesByUserId[b.user_id ?? ""]?.birthdate);
              return (
                <BookingCard
                  key={b.id}
                  booking={b}
                  age={age}
                  showActions={false}
                />
              );
            })}
          </Section>

          {rejected.length > 0 && (
            <Section title="Rejected / Cancelled" count={rejected.length} emptyText="">
              {rejected.map((b) => {
                const age = calculateAge(profilesByUserId[b.user_id ?? ""]?.birthdate);
                return (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    age={age}
                    showActions={false}
                  />
                );
              })}
            </Section>
          )}
        </div>
      </main>
    </div>
  );
}
