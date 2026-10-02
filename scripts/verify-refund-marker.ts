// Live verification of the per-cancellation refund marker (CR-v121, CP-v120 step 3).
//
// Proves against the REAL production database, with the service-role client:
//   A. the live index refunds_one_settled, keyed on
//      (booking_id, source, payment_id, cancellation_marker) for
//      processing/done/owed, refuses a second settled row for the SAME
//      cancellation (23505), accepts one for a DIFFERENT cancellation, and gives
//      a row written without a marker the default 0;
//   B. issueAndRecordRefund (lib/refunds.ts) skips a refund whose cancellation
//      is already settled, and records a NEW cancellation's refund as its own row.
//
// Safety: every row hangs off demo booking 104 (cancelled, never paid, no
// refund rows - checked before any write) and carries a fake payment id with
// this run's marker. The two function calls pass payment method 'qrph', which
// processPayMongoRefund returns as manual BEFORE any network call
// (lib/paymongo-refund.ts:21), so PayMongo is never contacted. No email is
// sent; no booking, trip or slot is touched. The finally block deletes every
// refunds row carrying this run's payment id, and the run asserts zero leftovers.
//
// Designed to run TWICE:
//   * BEFORE lib/refunds.ts passes the marker: check B2 FAILS (the new
//     cancellation's refund is skipped as "already handled" - the bug).
//     OVERALL: FAIL, and cleanup still runs.
//   * AFTER: every check passes. OVERALL: PASS.
//
// Run:  npx tsx scripts/verify-refund-marker.ts

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";
import { issueAndRecordRefund } from "../lib/refunds";

const RUN_MARKER = `refund-marker-verify-${Date.now()}`;
const BOOKING_ID = 104;
const SOURCE = "downpayment" as const;
// Not a real PayMongo id; the handle every insert carries and cleanup sweeps by.
const PAYMENT_ID = `fake_pay_${RUN_MARKER}`;
const AMOUNT = 100;

// Untyped client on purpose: throwaway-row plumbing, as in verify-refund-idempotency.ts.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Check = { label: string; pass: boolean; detail: string };
const checks: Check[] = [];

function record(label: string, pass: boolean, detail: string) {
  checks.push({ label, pass, detail });
}

type Row = { id: number; cancellation_marker: number; status: string };

// This run's rows only (by the fake payment id), optionally for one marker.
async function rowsFor(marker?: number): Promise<Row[]> {
  let q = admin
    .from("refunds")
    .select("id, cancellation_marker, status")
    .eq("payment_id", PAYMENT_ID);
  if (marker !== undefined) q = q.eq("cancellation_marker", marker);
  const { data, error } = await q;
  if (error) throw new Error(`refunds read failed: ${error.message}`);
  return (data ?? []) as Row[];
}

// A bare settled ('done') row. With marker undefined the column is omitted, so
// the database default applies - the shape every writer had before CR-v121.
function insertDone(marker?: number) {
  const row: Record<string, unknown> = {
    booking_id: BOOKING_ID,
    source: SOURCE,
    payment_id: PAYMENT_ID,
    amount: AMOUNT,
    status: "done",
    reason: "others",
  };
  if (marker !== undefined) row.cancellation_marker = marker;
  return admin.from("refunds").insert(row);
}

async function main() {
  console.log(`Refund marker live verification - run marker ${RUN_MARKER}`);
  console.log(`Booking ${BOOKING_ID} only. No PayMongo (qrph), no email. Rows deleted in finally.\n`);

  try {
    // Preflight: nothing is written unless booking 104 is cancelled, never paid,
    // and carries no refund rows.
    const { data: b, error: bErr } = await admin
      .from("bookings")
      .select("id, status, payment_gateway_status")
      .eq("id", BOOKING_ID)
      .single();
    if (bErr || !b) throw new Error(`booking ${BOOKING_ID} read failed: ${bErr?.message}`);
    const { data: existing, error: eErr } = await admin
      .from("refunds")
      .select("id")
      .eq("booking_id", BOOKING_ID);
    if (eErr) throw new Error(`existing refunds read failed: ${eErr.message}`);
    const preflightOk =
      b.status === "cancelled" && b.payment_gateway_status === null && (existing?.length ?? -1) === 0;
    record(
      "preflight: booking 104 is cancelled, never paid, and has no refund rows",
      preflightOk,
      `status=${b.status}, gateway=${b.payment_gateway_status}, refund_rows=${existing?.length}`,
    );
    if (!preflightOk) throw new Error("preflight failed; nothing written");

    // A. The live index.
    const a1 = await insertDone(3);
    record("A1 a settled row for cancellation 3 is accepted", !a1.error, a1.error ? `code=${a1.error.code} ${a1.error.message}` : "inserted");

    const a2 = await insertDone(3);
    record(
      "A2 a second settled row for the SAME cancellation (3) is refused with 23505",
      a2.error?.code === "23505",
      a2.error ? `code=${a2.error.code}` : "accepted (should have been refused)",
    );

    // B. The refund function. qrph returns before any network call. Order
    // matters: B runs while cancellation 3 holds the ONLY settled row for this
    // payment, so a settled check that ignored the marker would find that row
    // and skip B2 - which is exactly the bug.
    const b1 = await issueAndRecordRefund({
      admin,
      bookingId: BOOKING_ID,
      source: SOURCE,
      paymentId: PAYMENT_ID,
      paymentMethod: "qrph",
      amountPesos: AMOUNT,
      cancellationMarker: 3,
      notes: RUN_MARKER,
    });
    const threes = await rowsFor(3);
    record(
      "B1 refunding an already-settled cancellation (3) is skipped and reported as success",
      b1?.success === true && threes.length === 1,
      `result=${JSON.stringify(b1)}, rows with marker 3=${threes.length}`,
    );

    const b2 = await issueAndRecordRefund({
      admin,
      bookingId: BOOKING_ID,
      source: SOURCE,
      paymentId: PAYMENT_ID,
      paymentMethod: "qrph",
      amountPesos: AMOUNT,
      cancellationMarker: 4,
      notes: RUN_MARKER,
    });
    const fours = await rowsFor(4);
    record(
      "B2 refunding a NEW cancellation (4) writes its own row, held as manual (no network)",
      b2?.success === false &&
        b2?.requiresManualProcessing === true &&
        fours.length === 1 &&
        fours[0].status === "manual",
      `result=${JSON.stringify(b2)}, rows with marker 4=${fours.length}${fours[0] ? ` status=${fours[0].status}` : ""}`,
    );

    // A, continued.
    const a3 = await insertDone(2);
    record("A3 a settled row for a DIFFERENT cancellation (2) is accepted", !a3.error, a3.error ? `code=${a3.error.code} ${a3.error.message}` : "inserted");

    const a4 = await insertDone();
    const zeros = await rowsFor(0);
    record(
      "A4 a row written without a marker is accepted and stored with marker 0",
      !a4.error && zeros.length === 1,
      a4.error ? `code=${a4.error.code} ${a4.error.message}` : `rows with marker 0=${zeros.length}`,
    );

    const all = await rowsFor();
    console.log(
      `This run's rows before cleanup: ${all.map((r) => `#${r.id} marker=${r.cancellation_marker} ${r.status}`).join(", ")}\n`,
    );
  } catch (e) {
    record("threw", false, String(e));
  } finally {
    // Deleting by this run's fake payment id cannot touch any other row.
    const r = await admin.from("refunds").delete().eq("payment_id", PAYMENT_ID);
    if (r.error) console.error(`  !! CLEANUP FAILED - REMOVE BY HAND: refunds where payment_id = ${PAYMENT_ID}: ${r.error.message}`);
  }

  const [{ data: leftRun, error: lrErr }, { data: leftBooking, error: lbErr }] = await Promise.all([
    admin.from("refunds").select("id").eq("payment_id", PAYMENT_ID),
    admin.from("refunds").select("id").eq("booking_id", BOOKING_ID),
  ]);
  record(
    "zero leftover rows (this run's payment id, and booking 104 overall)",
    !lrErr && !lbErr && (leftRun?.length ?? -1) === 0 && (leftBooking?.length ?? -1) === 0,
    lrErr?.message ?? lbErr?.message ?? `run=${leftRun?.length ?? 0} booking104=${leftBooking?.length ?? 0}`,
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
