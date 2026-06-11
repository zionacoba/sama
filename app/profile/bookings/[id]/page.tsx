import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CANCELLATION_POLICIES } from "@/lib/cancellation-policies";
import { CancelBookingButton } from "@/app/profile/cancel-booking-button";
import { PayBalanceButton } from "./pay-balance-button";
import { PartialCancelButton } from "./partial-cancel-button";
import { calculateRefundAmount } from "@/lib/cancellation-policies";
import { Footer } from "@/app/components/footer";

type PageProps = {
  params: Promise<{ id: string }>;
};

type BookingDetail = {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  slots: number;
  total_amount: number;
  amount_due: number | null;
  payment_option: string;
  balance_collected: boolean;
  balance_payment_gateway_status: string | null;
  status: string;
  created_at: string;
  waiver_agreed: boolean;
  waiver_agreed_at: string | null;
  notes: string | null;
  medical_notes: string | null;
  meeting_point: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  trip: {
    title: string;
    slug: string;
    date_start: string;
    date_end: string | null;
    destination: string;
    region: string | null;
    difficulty: string;
    activity_type: string | null;
    duration: string | null;
    cancellation_policy: string | null;
    cancellation_policy_custom: string | null;
    messenger_gc_link: string | null;
    organizer_id: string | null;
    what_to_bring: string | null;
  };
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
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-900",
    payment_pending: "bg-sky-100 text-sky-700",
    cancelled: "bg-red-100 text-red-700",
    rejected: "bg-red-100 text-red-700",
    transferred: "bg-stone-100 text-stone-600",
  };
  const labels: Record<string, string> = {
    payment_pending: "Awaiting payment",
    transferred: "Transferred",
  };
  const label = labels[status] ?? (status.charAt(0).toUpperCase() + status.slice(1));
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${styles[status] ?? "bg-stone-100 text-stone-600"}`}>
      {label}
    </span>
  );
}

function parseList(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-start sm:gap-4">
      <dt className="w-full shrink-0 text-sm font-medium text-stone-500 sm:w-44">{label}</dt>
      <dd className="text-sm text-stone-900">{children}</dd>
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Booking Details | Sama",
  };
}

export default async function BookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const bookingId = parseInt(id, 10);
  if (isNaN(bookingId)) redirect("/profile");

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/profile/bookings/${id}`);

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("bookings")
    .select(`
      id, user_id, full_name, email, phone, slots, total_amount, amount_due,
      payment_option, balance_collected, balance_payment_gateway_status, status, created_at, waiver_agreed,
      waiver_agreed_at, notes, medical_notes, meeting_point,
      emergency_contact_name, emergency_contact_phone,
      trip:trips!bookings_trip_id_fkey(
        title, slug, date_start, date_end, destination, region, difficulty,
        activity_type, duration, cancellation_policy, cancellation_policy_custom,
        messenger_gc_link, organizer_id, what_to_bring
      )
    `)
    .eq("id", bookingId)
    .maybeSingle();

  if (!data || data.user_id !== user.id) redirect("/profile");

  const booking = data as unknown as BookingDetail;
  const { trip } = booking;

  const bookingRef = booking.id.toString(16).toUpperCase().slice(-8).padStart(8, "0");
  const isActive = booking.status === "confirmed" || booking.status === "pending";
  const isFuture = trip.date_start >= new Date().toISOString().split("T")[0];

  const safeGcLink = trip.messenger_gc_link?.startsWith("http") ? trip.messenger_gc_link : null;

  let organizerFacebook: string | null = null;
  let organizerDisplayName: string | null = null;
  if (booking.status === "confirmed" && !safeGcLink && trip.organizer_id) {
    const { data: orgData } = await admin
      .from("organizers")
      .select("display_name, full_name, facebook_url, social_links")
      .eq("id", trip.organizer_id)
      .maybeSingle();
    if (orgData) {
      organizerDisplayName = (orgData.display_name ?? orgData.full_name) || null;
      const rawSl = orgData.social_links;
      const sl = typeof rawSl === "string"
        ? (() => { try { return JSON.parse(rawSl) as { organizer_facebook?: string; facebook?: string }; } catch { return null; } })()
        : (rawSl as { organizer_facebook?: string; facebook?: string } | null);
      organizerFacebook =
        sl?.organizer_facebook ||
        sl?.facebook ||
        orgData.facebook_url ||
        null;
    }
  }

  const policyKey = (trip.cancellation_policy ?? "flexible") as keyof typeof CANCELLATION_POLICIES;
  const policy = CANCELLATION_POLICIES[policyKey] ?? CANCELLATION_POLICIES.flexible;
  const policyText = policyKey === "custom"
    ? (trip.cancellation_policy_custom ?? "Contact your organizer for details.")
    : policy.text;

  const balance = booking.total_amount != null && booking.amount_due != null
    ? Math.max(0, booking.total_amount - booking.amount_due)
    : null;

  const amountPaid =
    booking.payment_option === "downpayment" && booking.amount_due != null
      ? booking.amount_due
      : booking.total_amount;
  const todayManilaStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const todayManila = new Date(todayManilaStr);
  const tripDay = new Date(trip.date_start);
  const daysUntilTrip = Math.round((tripDay.getTime() - todayManila.getTime()) / 86_400_000);
  const fullRefundable = amountPaid != null
    ? calculateRefundAmount(trip.cancellation_policy ?? "flexible", amountPaid, daysUntilTrip)
    : null;
  const refundRatio = (fullRefundable !== null && amountPaid != null && amountPaid > 0)
    ? fullRefundable / amountPaid
    : null;
  const pricePerSlot = booking.total_amount != null ? booking.total_amount / booking.slots : 0;

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-trailhead">
            <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
          </Link>
          <Link
            href="/profile"
            className="text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            ← My bookings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        {/* Title row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-stone-500">Booking details</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              {trip.title}
            </h1>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <p className="mt-1 font-mono text-sm text-stone-400">#{bookingRef}</p>

        {/* Trip details */}
        <section className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 bg-stone-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Trip</h2>
          </div>
          <dl className="divide-y divide-stone-100 px-5">
            <DetailRow label="Destination">{trip.destination}{trip.region && <span className="ml-2 text-stone-400">{trip.region}</span>}</DetailRow>
            <DetailRow label="Date">
              {formatDate(trip.date_start)}
              {trip.date_end && <> – {formatDate(trip.date_end)}</>}
              {trip.duration && <span className="ml-2 text-stone-400">({trip.duration})</span>}
            </DetailRow>
            <DetailRow label="Difficulty">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                trip.difficulty === "Beginner" ? "bg-emerald-100 text-emerald-800"
                : trip.difficulty === "Intermediate" ? "bg-amber-100 text-amber-900"
                : trip.difficulty === "Advanced" ? "bg-orange-100 text-orange-900"
                : "bg-red-100 text-red-800"
              }`}>{trip.difficulty}</span>
            </DetailRow>
            {trip.activity_type && (
              <DetailRow label="Activity">{trip.activity_type}</DetailRow>
            )}
            {booking.status === "confirmed" && (
              <DetailRow label="Contact organizer">
                {safeGcLink ? (
                  <a
                    href={safeGcLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-trailhead/30 bg-trailhead-muted px-3 py-1.5 text-sm font-semibold text-trailhead transition hover:bg-trailhead hover:text-white"
                  >
                    Join Messenger GC →
                  </a>
                ) : organizerFacebook ? (
                  <a
                    href={organizerFacebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-trailhead/30 bg-trailhead-muted px-3 py-1.5 text-sm font-semibold text-trailhead transition hover:bg-trailhead hover:text-white"
                  >
                    Contact organizer on Facebook →
                  </a>
                ) : (
                  <span className="text-stone-600">
                    Need help reaching your organizer? Email us at{" "}
                    <a href="mailto:hello@sama.com.ph" className="font-medium text-trailhead underline-offset-4 hover:underline">
                      hello@sama.com.ph
                    </a>{" "}
                    and we&apos;ll connect you.
                  </span>
                )}
              </DetailRow>
            )}
          </dl>
        </section>

        {/* Booking info */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 bg-stone-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Booking</h2>
          </div>
          <dl className="divide-y divide-stone-100 px-5">
            <DetailRow label="Slots booked">{booking.slots} slot{booking.slots !== 1 ? "s" : ""}</DetailRow>
            <DetailRow label="Total amount">{formatCurrency(booking.total_amount)}</DetailRow>
            {booking.payment_option === "downpayment" && booking.amount_due != null && (
              <>
                <DetailRow label="Amount paid">{formatCurrency(booking.amount_due)}</DetailRow>
                <DetailRow label="Balance">
                  {booking.balance_collected ? (
                    <span className="font-semibold text-emerald-600">
                      Fully paid ✓{booking.balance_payment_gateway_status === "paid" ? " (paid online)" : " (collected)"}
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold text-amber-700">{formatCurrency(balance ?? 0)} outstanding</span>
                      <span className="mt-1 block text-xs text-stone-500">
                        You can pay this online before the trip, or directly to your organizer on the day.
                      </span>
                    </span>
                  )}
                </DetailRow>
              </>
            )}
            <DetailRow label="Payment method">
              {booking.payment_option === "downpayment" ? "Downpayment" : "Full payment"}
            </DetailRow>
            {booking.meeting_point && (
              <DetailRow label="Pickup point">{booking.meeting_point}</DetailRow>
            )}
            <DetailRow label="Booked on">{formatDateTime(booking.created_at)}</DetailRow>
            {booking.waiver_agreed && booking.waiver_agreed_at && (
              <DetailRow label="Waiver signed">
                <span className="text-stone-500">{formatDateTime(booking.waiver_agreed_at)}</span>
              </DetailRow>
            )}
          </dl>
        </section>

        {/* Participant info */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 bg-stone-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Participant</h2>
          </div>
          <dl className="divide-y divide-stone-100 px-5">
            <DetailRow label="Name">{booking.full_name}</DetailRow>
            <DetailRow label="Email">{booking.email}</DetailRow>
            {booking.phone && <DetailRow label="Phone">{booking.phone}</DetailRow>}
            {booking.emergency_contact_name && (
              <DetailRow label="Emergency contact">
                {booking.emergency_contact_name}
                {booking.emergency_contact_phone && (
                  <span className="ml-2 text-stone-500">{booking.emergency_contact_phone}</span>
                )}
              </DetailRow>
            )}
            {booking.medical_notes && (
              <DetailRow label="Medical / dietary notes">
                <span className="text-stone-700">{booking.medical_notes}</span>
              </DetailRow>
            )}
            {booking.notes && (
              <DetailRow label="Additional notes">
                <span className="text-stone-700">{booking.notes}</span>
              </DetailRow>
            )}
          </dl>
        </section>

        {/* What to bring */}
        {parseList(trip.what_to_bring).length > 0 && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-100 bg-stone-50 px-5 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">What to bring</h2>
            </div>
            <ul className="divide-y divide-stone-100 px-5 py-1">
              {parseList(trip.what_to_bring).map((item) => (
                <li key={item} className="flex items-start gap-2 py-2.5 text-sm text-stone-700">
                  <span className="mt-0.5 shrink-0 text-stone-400">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Cancellation policy */}
        <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 bg-stone-50 px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Cancellation policy</h2>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm font-semibold text-stone-800">{policy.label}</p>
            <p className="mt-1 text-sm text-stone-600">{policyText}</p>
          </div>
        </section>

        {/* Actions */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/trips/${trip.slug}`}
            className="rounded-xl border border-stone-200 px-5 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-900"
          >
            View trip page
          </Link>
          {booking.status === "confirmed" &&
            booking.payment_option === "downpayment" &&
            !booking.balance_collected &&
            isFuture &&
            balance != null &&
            balance > 0 && (
              <PayBalanceButton bookingId={booking.id} balanceAmount={formatCurrency(balance)} />
            )}
          {isActive && isFuture && booking.slots > 1 && (
            <PartialCancelButton
              bookingId={booking.id}
              totalSlots={booking.slots}
              pricePerSlot={pricePerSlot}
              refundRatio={refundRatio}
            />
          )}
          {isActive && isFuture && (
            <CancelBookingButton
              bookingId={booking.id}
              tripTitle={trip.title}
              tripDate={formatDate(trip.date_start)}
              refundAmount={fullRefundable}
            />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
