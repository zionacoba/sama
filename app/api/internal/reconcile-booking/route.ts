import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { confirmPaidBooking, fetchPaymongoLinkPayment } from "@/lib/confirm-paid-booking";

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
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || !token || !constantTimeEqual(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { bookingId?: number | string };
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
    // Fail safe: do NOT cancel a booking we could not verify.
    return NextResponse.json({ canCancel: false }, { status: 502 });
  }
}
