import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import * as Sentry from "@sentry/nextjs";
import { Navbar } from "@/app/components/navbar";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { amountJoinerPaid } from "@/lib/booking-finance";
import { safeExternalUrl } from "@/lib/safe-url";
import { confirmPaidBooking, confirmPaidBalance, fetchPaymongoCheckoutPayment } from "@/lib/confirm-paid-booking";
import { EmergencyContactPrompt } from "./emergency-contact-prompt";
import { formatPeso, formatBookingRef } from "@/lib/format";

export const metadata: Metadata = {
  title: "Payment received | Sama",
  robots: { index: false },
};

type PageProps = {
  searchParams: Promise<{ bookingId?: string }>;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const { bookingId: rawBookingId } = await searchParams;
  const bookingId = rawBookingId ? parseInt(rawBookingId, 10) : null;
  if (rawBookingId && Number.isNaN(bookingId)) redirect("/profile");

  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();

  const admin = createSupabaseAdminClient();

  let hasEmergencyContact = true;
  if (user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("emergency_contact_name, emergency_contact_phone")
      .eq("id", user.id)
      .maybeSingle();
    hasEmergencyContact = !!(profile?.emergency_contact_name && profile?.emergency_contact_phone);
  }

  type BookingSummary = {
    id: number;
    user_id: string;
    total_amount: number;
    amount_due: number | null;
    payment_option: string | null;
    status: string | null;
    payment_id: string | null;
    payment_gateway_status: string | null;
    balance_payment_id: string | null;
    balance_payment_gateway_status: string | null;
    meeting_point: string | null;
    trip: {
      title: string;
      date_start: string;
      messenger_gc_link: string | null;
      organizer: {
        display_name: string | null;
        full_name: string;
        facebook_url: string | null;
        social_links: unknown;
      } | null;
    } | null;
  };

  let booking: BookingSummary | null = null;
  if (bookingId) {
    const { data, error } = await admin
      .from("bookings")
      .select("id, user_id, total_amount, amount_due, payment_option, status, payment_id, payment_gateway_status, balance_payment_id, balance_payment_gateway_status, meeting_point, trip:trips!bookings_trip_id_fkey(title, date_start, messenger_gc_link, organizer:organizers(display_name, full_name, facebook_url, social_links))")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) {
      // booking stays null and the ownership gate's redirect remains the
      // fail-safe, but a fetch failure here silently bounces a legitimate
      // owner to /profile — it must be loud.
      console.error("[payment-success] booking fetch failed:", error);
      Sentry.captureException(error, {
        extra: { context: "payment-success-booking-fetch-failed", bookingId },
      });
    }
    booking = data as BookingSummary | null;
  }

  // Webhook-independent reconciliation. If a PayMongo webhook was missed, the
  // booking will still be sitting in payment_pending with no gateway status.
  // Ask PayMongo directly whether the link was paid and, if so, confirm via the
  // shared idempotent helper. We trust ONLY PayMongo's reported paid status on
  // the server-held link id (payment_id), never the guessable bookingId URL
  // param. Any error falls back to the existing informational UI — we never
  // surface a failure or suggest the payment did not go through.
  let paymentConfirmed = booking?.payment_gateway_status === "paid";
  if (
    booking &&
    booking.status === "payment_pending" &&
    booking.payment_gateway_status === null &&
    booking.payment_id
  ) {
    try {
      const linkPayment = await fetchPaymongoCheckoutPayment(booking.payment_id);
      if (linkPayment.status === "paid") {
        const result = await confirmPaidBooking(
          booking.payment_id,
          linkPayment.paymentMethod,
          linkPayment.paymentTransactionId,
        );
        if (result.outcome === "confirmed" || result.outcome === "already_paid") {
          paymentConfirmed = true;
        }
      }
    } catch (err) {
      console.error("[payment-success] reconciliation failed:", err);
    }
  }

  // Webhook-independent reconciliation for the BALANCE payment. A balance
  // payment redirects to this same success page, so if its webhook was missed
  // the booking is confirmed but still has balance_payment_gateway_status NULL.
  // Same trust model as above: we act ONLY on the server-held balance_payment_id
  // and only when PayMongo reports the balance link as paid. This does not touch
  // the initial-payment reconciliation; it runs alongside it. Any error falls
  // back gracefully and never blocks the page.
  if (
    booking &&
    booking.balance_payment_id &&
    booking.balance_payment_gateway_status === null
  ) {
    try {
      const linkPayment = await fetchPaymongoCheckoutPayment(booking.balance_payment_id);
      if (linkPayment.status === "paid") {
        await confirmPaidBalance(
          booking.balance_payment_id,
          linkPayment.paymentTransactionId,
        );
      }
    } catch (err) {
      console.error("[payment-success] balance reconciliation failed:", err);
    }
  }

  // After reconciliation the in-memory booking.status can be stale: the reconcile
  // path above writes the new status (confirmed for auto-approved trips, pending
  // for Advanced trips awaiting organizer review) straight to the DB without
  // mutating this object. Re-read the authoritative status, read-only, so the
  // success copy can tell a confirmed booking apart from one that is paid but
  // still awaiting organizer approval. Any miss falls back to the in-memory value.
  let bookingStatus = booking?.status ?? null;
  if (booking && paymentConfirmed) {
    const { data: freshStatus } = await admin
      .from("bookings")
      .select("status")
      .eq("id", booking.id)
      .maybeSingle();
    if (freshStatus?.status) {
      bookingStatus = freshStatus.status;
    }
  }
  const awaitingApproval = paymentConfirmed && bookingStatus === "pending";

  // Ownership gate. The reconciliation above runs ungated on the server-held
  // payment_id so a paid booking is always confirmed, but the sensitive details
  // below (Messenger GC link, amounts, meeting point, organizer contact) may
  // only be shown to the booking's owner. Booking IDs are sequential, so without
  // this gate anyone could iterate ?bookingId=N to harvest private data. The
  // legitimate post-payment flow is unaffected: PayMongo redirects the paying
  // user back with their session intact, so they are the owner.
  if (bookingId) {
    if (!user) {
      redirect(`/login?redirectTo=${encodeURIComponent(`/payment/success?bookingId=${bookingId}`)}`);
    }
    if (!booking || booking.user_id !== user.id) {
      redirect("/profile");
    }
  }

  const bookingRef = bookingId ? formatBookingRef(bookingId) : null;

  const hasRemainingBalance =
    booking?.payment_option === "downpayment" &&
    booking.amount_due != null &&
    booking.amount_due < booking.total_amount;

  const messengerLink = safeExternalUrl(booking?.trip?.messenger_gc_link ?? null);

  const organizerContactUrl = (() => {
    const org = booking?.trip?.organizer;
    if (!org) return null;
    const rawLinks = org.social_links;
    const sl =
      typeof rawLinks === "string"
        ? (() => {
            try { return JSON.parse(rawLinks) as { organizer_facebook?: string; facebook?: string }; }
            catch { return null; }
          })()
        : (rawLinks as { organizer_facebook?: string; facebook?: string } | null);
    return safeExternalUrl(
      (sl?.organizer_facebook?.trim() || sl?.facebook?.trim() || org.facebook_url?.trim()) ?? null,
    );
  })();

  return (
    <>
      <Navbar />
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-trailhead-muted">
            <svg
              className="h-8 w-8 text-trailhead"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-stone-900">Payment received!</h1>

          <p className="mt-3 text-sm text-stone-600">
            {awaitingApproval
              ? "We've received your payment and sent your request to the organizer for review. This usually takes 24 to 48 hours, and we'll email you as soon as they respond."
              : paymentConfirmed
                ? "We've received your payment. Check your email for your booking details and next steps."
                : "We're confirming your booking. You'll receive an email shortly with your booking details."}
          </p>

          {booking?.trip ? (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5 text-left">
              <p className="text-base font-semibold text-stone-900">{booking.trip.title}</p>
              <p className="mt-1 text-sm text-stone-500">{formatDate(booking.trip.date_start)}</p>
              {booking.trip.organizer && (
                <p className="mt-0.5 text-sm text-stone-500">
                  Organized by {booking.trip.organizer.display_name ?? booking.trip.organizer.full_name}
                </p>
              )}
              <p className="mt-3 text-sm font-medium text-stone-700">
                Amount paid: <span className="text-trailhead">{formatPeso(amountJoinerPaid(booking))}</span>
              </p>
              {bookingRef && (
                <p className="mt-1 text-xs text-stone-500">
                  Ref:{" "}
                  <span className="font-mono font-medium text-stone-500">{bookingRef}</span>
                </p>
              )}
            </div>
          ) : (
            bookingRef && (
              <p className="mt-2 text-xs text-stone-500">
                Booking reference:{" "}
                <span className="font-mono font-medium text-stone-600">{bookingRef}</span>
              </p>
            )
          )}

          {booking && (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 text-left">
              <h2 className="mb-3 text-sm font-bold text-stone-900">What&apos;s next</h2>
              <ul className="space-y-2.5 text-sm text-stone-600">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-trailhead">✓</span>
                  <span>
                    {awaitingApproval
                      ? "The organizer will review your request, usually within 24 to 48 hours. We'll email you as soon as they respond."
                      : "Check your email for your booking confirmation and full trip details."}
                  </span>
                </li>
                {booking.meeting_point && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">📍</span>
                    <span><strong className="text-stone-700">Meeting point:</strong> {booking.meeting_point}</span>
                  </li>
                )}
                {hasRemainingBalance && (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">💳</span>
                    <span>
                      Your remaining balance of{" "}
                      <strong className="text-stone-700">{formatPeso(booking.total_amount - (booking.amount_due ?? 0))}</strong>{" "}
                      can be paid online before the trip or in cash directly to the organizer on the day.
                    </span>
                  </li>
                )}
                {messengerLink ? (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">💬</span>
                    <span>
                      <a href={messengerLink} target="_blank" rel="noopener noreferrer" className="text-trailhead underline-offset-4 hover:underline">
                        Join the trip group chat
                      </a>{" "}
                      for updates and coordination.
                    </span>
                  </li>
                ) : organizerContactUrl ? (
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">💬</span>
                    <span>
                      Questions?{" "}
                      <a href={organizerContactUrl} target="_blank" rel="noopener noreferrer" className="text-trailhead underline-offset-4 hover:underline">
                        Message the organizer on Facebook
                      </a>.
                    </span>
                  </li>
                ) : null}
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">📋</span>
                  <span>
                    <Link href={`/profile/bookings/${booking.id}`} className="text-trailhead underline-offset-4 hover:underline">
                      View your booking anytime
                    </Link>{" "}
                    from your profile.
                  </span>
                </li>
              </ul>
            </div>
          )}

          {user && !hasEmergencyContact && <EmergencyContactPrompt />}

          <div className="mt-8 flex flex-col items-center gap-3">
            {booking ? (
              <Link
                href={`/profile/bookings/${booking.id}`}
                className="w-full rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto sm:min-w-[220px]"
              >
                View booking details
              </Link>
            ) : (
              <Link
                href="/profile"
                className="w-full rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto sm:min-w-[220px]"
              >
                View my bookings
              </Link>
            )}
            <Link
              href="/trips"
              className="text-sm text-stone-500 underline-offset-4 hover:text-trailhead hover:underline"
            >
              Browse more trips
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama.
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
          Privacy Policy
        </Link>
        {" · "}
        <a href="mailto:hello@sama.com.ph" className="underline-offset-4 hover:text-trailhead hover:underline">
          Contact
        </a>
      </footer>
    </>
  );
}
