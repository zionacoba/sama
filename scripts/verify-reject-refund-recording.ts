// Fail-then-pass proof, on one live row, that the reject-path refund fix records
// a durable refunds row for the defect state the old gate silently skipped:
// status "pending", payment_gateway_status "paid", paymongo_payment_id NULL,
// amount_due > 0 (money collected, no gateway refund handle stored).
//
// OLD-LOGIC leg: the pre-fix predicate ((amountDue ?? 0) > 0 && !!paymongoPaymentId)
// is evaluated inline against the fetched row. It must return FALSE, and at that
// point zero refunds rows must exist for the booking: the gap, demonstrated.
// NEW-LOGIC leg: shouldRefundOnReject(row.amount_due, row.payment_gateway_status)
// imported from lib/booking-finance must return TRUE, and issueAndRecordRefund is
// then called exactly as the reject branch in updateBookingStatus calls it. The
// null paymentId short-circuits processPayMongoRefund at its !paymentId guard
// ("No payment transaction ID found") BEFORE the secret-key check and BEFORE any
// fetch, so this harness NEVER contacts PayMongo and never sends email. No real
// pay_ id appears anywhere in this file. The expected durable outcome is exactly
// ONE refunds row: status "failed", amount equal to the booking's amount_due,
// last_error containing the no-payment-id message, paymongo_refund_id NULL.
//
// CRITICAL CLEANUP: the refund retry cron retries owed/failed refunds rows every
// 30 minutes. The harness refunds row is a status "failed" row with a NULL
// payment_id, so it MUST be deleted in the finally block even when an assertion
// fails, or the cron will pick it up. Teardown is FK-safe (refunds, then
// booking_participants if any, then booking, then trip) and a zero-leftover
// assertion at the end covers all four tables.
//
// Run:  npx tsx scripts/verify-reject-refund-recording.ts
//
// Do NOT commit. Do NOT modify source. Test harness only.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";
import { shouldRefundOnReject } from "../lib/booking-finance";
import { issueAndRecordRefund } from "../lib/refunds";

const RUN_MARKER = `reject-refund-verify-${Date.now()}`;
const PRICE = 1000;

// Untyped client on purpose: throwaway-row plumbing, no generated-type friction.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Check = { label: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(label: string, pass: boolean, detail: string) {
  checks.push({ label, pass, detail });
}

function ymdOffset(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

// Throwaway active trip with headroom. Slug carries the RUN_MARKER so cleanup
// can sweep by marker. organizer_id is left null (nullable, as the other verify
// harnesses rely on too).
async function insertTrip(): Promise<number> {
  const { data, error } = await admin
    .from("trips")
    .insert({
      title: `${RUN_MARKER}-trip`,
      slug: `${RUN_MARKER}-trip`,
      status: "active",
      date_start: ymdOffset(+30),
      total_slots: 5,
      remaining_slots: 5,
      price: PRICE,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`trip insert failed: ${error?.message}`);
  return data.id as number;
}

// Create the throwaway booking via the REAL production RPC (bare book_slot does
// not exist in live). Every required positional parameter is supplied; the two
// trailing custom-question jsonb params default to NULL and are omitted (26
// params total). p_user_id is null (bookings.user_id is nullable). p_notes is
// the RUN_MARKER so the row is caught by FK-safe cleanup. The booking id is
// read back by marker afterward.
async function createBooking(tripId: number): Promise<number> {
  const { error } = await admin.rpc("book_slot_and_create_booking", {
    p_trip_id: tripId,
    p_user_id: null,
    p_slots_requested: 1,
    p_full_name: `Booker (${RUN_MARKER})`,
    p_email: `booker-${RUN_MARKER}@example.invalid`,
    p_phone: "09170000000",
    p_total_amount: PRICE,
    p_status: "payment_pending",
    p_notes: RUN_MARKER,
    p_payment_option: "full",
    p_amount_due: PRICE,
    p_participants: [],
    p_emergency_contact_name: "Emergency Contact",
    p_emergency_contact_phone: "09170000001",
    p_waiver_agreed: true,
    p_waiver_agreed_at: new Date().toISOString(),
    p_platform_waiver_agreed: true,
    p_medical_notes: null,
    p_meeting_point: null,
    p_platform_commission: 0,
    p_commission_rate_used: 0,
    p_waiver_text_snapshot: null,
    p_waiver_ip: null,
    p_platform_waiver_snapshot: null,
  });
  if (error) throw new Error(`createBooking failed: ${error.message}`);

  const { data, error: readErr } = await admin
    .from("bookings")
    .select("id")
    .eq("notes", RUN_MARKER)
    .single();
  if (readErr || !data) throw new Error(`booking read-back failed: ${readErr?.message}`);
  return data.id as number;
}

async function main() {
  console.log(`Reject-path refund recording live verification - run marker ${RUN_MARKER}`);
  console.log(`No PayMongo call, no email: the NULL paymongo_payment_id short-circuits processPayMongoRefund. DB state + returned RefundResult only.\n`);

  let tripId: number | null = null;
  let bookingId: number | null = null;

  try {
    tripId = await insertTrip();
    bookingId = await createBooking(tripId);
    record("setup: throwaway trip + booking created via book_slot_and_create_booking", true, `trip=${tripId}, booking=${bookingId}`);

    // Drive the row into the defect state confirmPaidBooking can produce when
    // PayMongo reports paid but no payment transaction id is extracted: status
    // "pending", payment_gateway_status "paid", paymongo_payment_id NULL (the
    // RPC never sets it, so it is already NULL), amount_due kept at the
    // RPC-created positive amount, payment_method "gcash" (NOT "qrph", so the
    // refund processor reaches its !paymentId guard, not the manual branch).
    const { error: defectErr } = await admin
      .from("bookings")
      .update({
        status: "pending",
        payment_gateway_status: "paid",
        payment_method: "gcash",
      })
      .eq("id", bookingId);
    if (defectErr) throw new Error(`defect-state update failed: ${defectErr.message}`);

    const { data: row, error: rowErr } = await admin
      .from("bookings")
      .select("id, status, payment_gateway_status, paymongo_payment_id, payment_method, amount_due")
      .eq("id", bookingId)
      .single();
    if (rowErr || !row) throw new Error(`defect-state read-back failed: ${rowErr?.message}`);

    const inDefectState =
      row.status === "pending" &&
      row.payment_gateway_status === "paid" &&
      row.paymongo_payment_id === null &&
      Number(row.amount_due) > 0;
    record(
      "defect state on live row: pending + gateway paid + NULL paymongo_payment_id + amount_due > 0",
      inDefectState,
      `status=${row.status}, gateway=${row.payment_gateway_status}, paymongo_payment_id=${row.paymongo_payment_id === null ? "null" : JSON.stringify(row.paymongo_payment_id)}, amount_due=${row.amount_due}`,
    );
    if (!inDefectState) throw new Error("row is not in the defect state; aborting before the refund legs");

    // OLD-LOGIC leg: the pre-fix predicate, inline. It gates on the paymongo
    // payment id, which is NULL here, so it must be FALSE: the old reject path
    // would have skipped issueAndRecordRefund entirely and recorded nothing.
    const oldPredicate = (Number(row.amount_due ?? 0)) > 0 && !!row.paymongo_payment_id;
    record(
      "OLD LOGIC: pre-fix predicate ((amountDue ?? 0) > 0 && !!paymongoPaymentId) is FALSE on this row",
      oldPredicate === false,
      `oldPredicate=${oldPredicate}`,
    );

    const { data: preRefunds, error: preErr } = await admin
      .from("refunds")
      .select("id")
      .eq("booking_id", bookingId);
    record(
      "OLD LOGIC: zero refunds rows exist at this point (the gap: nothing would have been recorded)",
      !preErr && (preRefunds?.length ?? 0) === 0,
      preErr?.message ?? `refunds rows=${preRefunds?.length ?? 0}`,
    );

    // NEW-LOGIC leg: the shipped gate keys off the authoritative collected
    // signal, so it must be TRUE for this same row.
    const newPredicate = shouldRefundOnReject(row.amount_due, row.payment_gateway_status);
    record(
      "NEW LOGIC: shouldRefundOnReject(amount_due, payment_gateway_status) is TRUE on this row",
      newPredicate === true,
      `newPredicate=${newPredicate}`,
    );
    if (!newPredicate) throw new Error("new gate returned false; aborting before issueAndRecordRefund");

    // Call issueAndRecordRefund exactly as the reject branch in
    // updateBookingStatus does: source "downpayment", the row's (NULL)
    // paymongo_payment_id, the row's payment_method, the row's amount_due.
    const result = await issueAndRecordRefund({
      admin,
      bookingId,
      source: "downpayment",
      paymentId: row.paymongo_payment_id,
      paymentMethod: row.payment_method,
      amountPesos: Number(row.amount_due),
      notes: `Organizer rejected booking (${RUN_MARKER})`,
    });

    // No-network proof: the NULL payment id makes processPayMongoRefund return
    // its no-payment-id error before any fetch, so the RefundResult must be a
    // plain failure (not success, not requiresManualProcessing).
    record(
      "RefundResult: success is false (no PayMongo call was possible)",
      result !== null && result.success === false,
      `result=${JSON.stringify(result)}`,
    );
    record(
      "RefundResult: error contains 'No payment transaction ID found'",
      result !== null && (result.error ?? "").includes("No payment transaction ID found"),
      `error=${result?.error ?? "none"}`,
    );
    record(
      "RefundResult: requiresManualProcessing is not set",
      result !== null && !result.requiresManualProcessing,
      `requiresManualProcessing=${result?.requiresManualProcessing ?? "undefined"}`,
    );

    // Durable-record proof: exactly ONE refunds row, marked failed, for the full
    // collected amount, with the no-payment-id error and no gateway refund id.
    const { data: postRefunds, error: postErr } = await admin
      .from("refunds")
      .select("id, status, amount, last_error, paymongo_refund_id, payment_id, source")
      .eq("booking_id", bookingId);
    if (postErr) {
      record("exactly ONE refunds row recorded for the booking", false, postErr.message);
    } else {
      record(
        "exactly ONE refunds row recorded for the booking",
        (postRefunds?.length ?? 0) === 1,
        `refunds rows=${postRefunds?.length ?? 0}`,
      );
      const refundRow = postRefunds?.[0];
      if (refundRow) {
        record("refunds row status is 'failed'", refundRow.status === "failed", `status=${refundRow.status}`);
        record(
          "refunds row amount equals the booking's amount_due",
          Number(refundRow.amount) === Number(row.amount_due),
          `amount=${refundRow.amount}, amount_due=${row.amount_due}`,
        );
        record(
          "refunds row last_error contains 'No payment transaction ID found'",
          (refundRow.last_error ?? "").includes("No payment transaction ID found"),
          `last_error=${refundRow.last_error ?? "none"}`,
        );
        record(
          "refunds row paymongo_refund_id IS NULL",
          refundRow.paymongo_refund_id === null,
          `paymongo_refund_id=${refundRow.paymongo_refund_id === null ? "null" : JSON.stringify(refundRow.paymongo_refund_id)}`,
        );
      }
    }
  } catch (e) {
    record("threw", false, String(e));
  } finally {
    // FK-safe teardown: refunds first (they reference bookings), then
    // booking_participants if any, then booking, then trip.
    //
    // CRITICAL: the refunds delete below must run even when an assertion above
    // failed. The harness row is status "failed" with payment_id NULL, and the
    // refund retry cron retries owed/failed rows every 30 minutes; a leftover
    // row would be picked up by the cron. Refunds are swept by booking_id
    // linkage (payment_id is NULL by design, so no synthetic id to sweep by).
    const leftoverErrs: string[] = [];
    if (bookingId != null) {
      const r = await admin.from("refunds").delete().eq("booking_id", bookingId);
      if (r.error) leftoverErrs.push(`refunds(booking ${bookingId}): ${r.error.message}`);
      const p = await admin.from("booking_participants").delete().eq("booking_id", bookingId);
      if (p.error) leftoverErrs.push(`booking_participants(booking ${bookingId}): ${p.error.message}`);
    }
    const b = await admin.from("bookings").delete().eq("notes", RUN_MARKER);
    if (b.error) leftoverErrs.push(`bookings(${RUN_MARKER}): ${b.error.message}`);
    const t = await admin.from("trips").delete().like("slug", `${RUN_MARKER}-%`);
    if (t.error) leftoverErrs.push(`trips(${RUN_MARKER}): ${t.error.message}`);
    if (leftoverErrs.length) {
      console.error("  !! CLEANUP FAILED - REMOVE BY HAND (the refunds row especially: the retry cron retries owed/failed rows every 30 minutes):");
      for (const l of leftoverErrs) console.error("     " + l);
    }
  }

  // Final zero-leftover assertion for this run's marker across all four tables.
  // Refunds and booking_participants are checked by booking_id linkage (the
  // refunds row has payment_id NULL by design); if setup never produced a
  // booking id, no such rows can exist for this run.
  const [
    refundsLeft,
    participantsLeft,
    { data: leftB, error: leftBErr },
    { data: leftT, error: leftTErr },
  ] = await Promise.all([
    bookingId != null
      ? admin.from("refunds").select("id").eq("booking_id", bookingId)
      : Promise.resolve({ data: [] as { id: number }[], error: null }),
    bookingId != null
      ? admin.from("booking_participants").select("id").eq("booking_id", bookingId)
      : Promise.resolve({ data: [] as { id: number }[], error: null }),
    admin.from("bookings").select("id").eq("notes", RUN_MARKER),
    admin.from("trips").select("id").like("slug", `${RUN_MARKER}-%`),
  ]);
  const { data: leftR, error: leftRErr } = refundsLeft;
  const { data: leftP, error: leftPErr } = participantsLeft;
  const leftoverCount =
    leftRErr || leftPErr || leftBErr || leftTErr
      ? -1
      : (leftR?.length ?? 0) + (leftP?.length ?? 0) + (leftB?.length ?? 0) + (leftT?.length ?? 0);
  record(
    "zero leftover rows from this run",
    leftoverCount === 0,
    leftRErr?.message ??
      leftPErr?.message ??
      leftBErr?.message ??
      leftTErr?.message ??
      `refunds=${leftR?.length ?? 0} booking_participants=${leftP?.length ?? 0} bookings=${leftB?.length ?? 0} trips=${leftT?.length ?? 0}`,
  );

  console.log("=================== RESULTS ===================");
  for (const c of checks) console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.label} - ${c.detail}`);
  const allPass = checks.every((c) => c.pass);
  console.log(`  OVERALL: ${allPass ? "PASS" : "FAIL"}`);
  console.log("==============================================");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
