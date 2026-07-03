import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const maxDuration = 60;

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { confirmPaidBooking, confirmPaidBalance, fetchPaymongoLinkPayment } from "@/lib/confirm-paid-booking";

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * Internal, CRON_SECRET-protected reconciliation endpoint.
 *
 * Given a booking id, asks PayMongo directly whether the booking's payment link
 * was paid. If paid, confirms the booking via the shared idempotent helper and
 * reports that it must NOT be cancelled. If genuinely unpaid, reports that it is
 * safe to cancel. On any uncertainty (booking not found, PayMongo API error) it
 * fails safe and reports canCancel=false, so the caller leaves the booking
 * pending for a future cycle rather than risk cancelling a paid booking.
 *
 * Response contract (HTTP 200 unless auth fails):
 *   { canCancel: true,  paid: false }  -> genuinely unpaid, safe to cancel
 *   { canCancel: false, paid: true  }  -> paid/confirmed, do NOT cancel
 *   { canCancel: false }               -> uncertain / fail-safe, do NOT cancel
 * On PayMongo API error the route returns HTTP 502 with canCancel=false so a
 * caller that only inspects res.ok also fails safe.
 *
 * When called with { bookingId, mode: "balance" } it instead reconciles the
 * BALANCE payment of a confirmed booking: if PayMongo reports the balance link
 * as paid it confirms via confirmPaidBalance. It never cancels in this mode.
 * Response contract for balance mode (HTTP 200 unless auth/lookup fails):
 *   { confirmed: true }                 -> balance now confirmed (or already)
 *   { confirmed: false, paid: false }   -> balance genuinely unpaid
 *   { confirmed: false }                -> nothing to do / uncertain (502 on API error)
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || !token || !constantTimeEqual(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { bookingId?: number | string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bookingId = body.bookingId;
  if (bookingId === undefined || bookingId === null || bookingId === "") {
    return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Balance reconciliation. For a confirmed booking with an unconfirmed balance
  // payment, ask PayMongo directly whether the balance link was paid and, if so,
  // confirm it via the shared idempotent helper. Fail-safe: on any uncertainty
  // (booking missing, PayMongo error) we never mark the balance paid; we leave
  // it for a future cycle. This branch never cancels anything.
  if (body.mode === "balance") {
    const { data: balBooking, error: balError } = await admin
      .from("bookings")
      .select("id, balance_payment_id, balance_payment_gateway_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (balError) {
      console.error("[reconcile-booking] balance booking lookup failed:", balError.message);
      return NextResponse.json({ confirmed: false }, { status: 502 });
    }
    if (!balBooking) {
      return NextResponse.json({ confirmed: false });
    }
    if (balBooking.balance_payment_gateway_status === "paid") {
      return NextResponse.json({ confirmed: true, alreadyPaid: true });
    }
    if (!balBooking.balance_payment_id) {
      // No balance link was ever created — nothing to reconcile.
      return NextResponse.json({ confirmed: false });
    }

    try {
      const linkPayment = await fetchPaymongoLinkPayment(balBooking.balance_payment_id);
      if (linkPayment.status === "paid") {
        const result = await confirmPaidBalance(
          balBooking.balance_payment_id,
          linkPayment.paymentTransactionId,
          admin,
        );
        return NextResponse.json({ confirmed: true, outcome: result.outcome });
      }
      // PayMongo reports a definitive non-paid status — balance genuinely unpaid.
      return NextResponse.json({ confirmed: false, paid: false });
    } catch (err) {
      console.error("[reconcile-booking] balance PayMongo check failed:", err);
      Sentry.captureException(err, {
        extra: { context: "reconcile-balance-failed", bookingId, linkId: balBooking.balance_payment_id },
      });
      // Fail safe: never mark a balance paid we could not verify.
      return NextResponse.json({ confirmed: false }, { status: 502 });
    }
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, payment_id, status, payment_gateway_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    console.error("[reconcile-booking] booking lookup failed:", error.message);
    // Uncertain — fail safe.
    return NextResponse.json({ canCancel: false }, { status: 502 });
  }

  if (!booking) {
    // Booking changed out from under us — let the caller's own guards handle it.
    return NextResponse.json({ canCancel: false });
  }

  // Already confirmed by another path (webhook or success page).
  if (booking.payment_gateway_status === "paid") {
    return NextResponse.json({ canCancel: false, paid: true });
  }

  // No payment link was ever created, so PayMongo has nothing — the user never
  // started paying. Safe to cancel, matching the original cleanup behavior.
  if (!booking.payment_id) {
    return NextResponse.json({ canCancel: true, paid: false });
  }

  try {
    const linkPayment = await fetchPaymongoLinkPayment(booking.payment_id);
    if (linkPayment.status === "paid") {
      const result = await confirmPaidBooking(
        booking.payment_id,
        linkPayment.paymentMethod,
        linkPayment.paymentTransactionId,
      );
      return NextResponse.json({ canCancel: false, paid: true, outcome: result.outcome });
    }
    // PayMongo reports a definitive non-paid status — genuinely abandoned.
    return NextResponse.json({ canCancel: true, paid: false });
  } catch (err) {
    console.error("[reconcile-booking] PayMongo check failed:", err);
    Sentry.captureException(err, {
      extra: { context: "reconcile-initial-failed", bookingId, linkId: booking.payment_id },
    });
    // Unreachable — start the strand-escalation clock. Stamp reconcile_first_failed_at
    // on the FIRST unreachable failure only (guard on it still being null so later
    // failures never push the clock forward). This is the ONLY place it is set: the
    // paid and definitively-unpaid branches above return before reaching here, so the
    // clock starts strictly on "could not verify". This write must never change the
    // fail-safe response, so any error is logged and swallowed. No status or payment
    // state is touched: the booking stays payment_pending, slot still held.
    try {
      const { error: stampError } = await admin
        .from("bookings")
        .update({ reconcile_first_failed_at: new Date().toISOString() })
        .eq("id", booking.id)
        .is("reconcile_first_failed_at", null);
      if (stampError) {
        console.error(`[reconcile-booking] failed to stamp reconcile_first_failed_at for booking ${booking.id}:`, stampError.message);
      }
    } catch (stampErr) {
      console.error(`[reconcile-booking] error stamping reconcile_first_failed_at for booking ${booking.id}:`, stampErr);
    }
    // Fail safe: do NOT cancel a booking we could not verify.
    return NextResponse.json({ canCancel: false }, { status: 502 });
  }
}
