// FAITHFUL live verification of the transfer-refund fix (selection + payout
// eligibility layer ONLY).
//
// Verifies against REAL rows in the live database (service-role client, same as
// the app) that:
//   A. The cancel-path guarded update, using the REAL imported
//      TRIP_CANCELLATION_REFUND_STATUSES filter, selects and transitions a
//      "transferred" booking to "cancelled", returning the payment fields the
//      refund loop needs, and that amountJoinerPaid computes the full amount.
//   B. Re-running the same guarded update selects ZERO rows (structural
//      idempotency: a second cancelTrip run can never re-refund).
//   C. The now-cancelled booking is ABSENT from the getPendingPayouts
//      eligibility shape (.in status ATTENDED_STATUSES + payout_status unpaid,
//      then payoutTimingGate + isPayoutEligible).
//   D. Control: a genuinely-attended "transferred" booking on a NON-cancelled
//      past trip REMAINS payout eligible, so real transfer payouts still work.
//
// This harness NEVER runs cancelTrip/rejectOrganizer, NEVER contacts PayMongo,
// NEVER sends email, and NEVER writes a refunds row. It creates only its own
// throwaway trips/bookings (stamped with a per-run marker), deletes them in a
// finally block in FK-safe order (bookings before trips), and asserts zero
// leftovers at the end.
//
// Run:  npx tsx scripts/verify-transfer-refund.ts
//
// Plain `node` cannot run this harness (unlike verify-stage5e.ts): it imports
// lib/booking-finance.ts for the REAL payout predicates, and that file imports
// "./booking-status" without an extension, which Node's native type stripping
// does not resolve. tsx handles extensionless TS imports; do not rewrite the
// lib import to work around it.
//
// Do NOT commit. Do NOT modify source. Test harness only.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";
import { ATTENDED_STATUSES, TRIP_CANCELLATION_REFUND_STATUSES } from "../lib/booking-status.ts";
import { amountJoinerPaid, isPayoutEligible, payoutTimingGate, todayManilaDate } from "../lib/booking-finance.ts";

const RUN_MARKER = `transfer-refund-verify-${Date.now()}`;
const TOTAL = 1500; // full-payment basis: total_amount = amount_due = 1500

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

async function insertTrip(suffix: string, status: string, dateStart: string): Promise<number> {
  // Slots must have headroom: a DB-side guard rejects booking inserts against a
  // trip with 0 remaining slots even via direct admin insert. Slot mechanics are
  // not under test here, so give the throwaway trip plenty of room.
  const { data, error } = await admin
    .from("trips")
    .insert({
      title: `${RUN_MARKER}-${suffix}`,
      slug: `${RUN_MARKER}-${suffix}`,
      status,
      date_start: dateStart,
      total_slots: 5,
      remaining_slots: 5,
      price: TOTAL,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`trip insert (${suffix}) failed: ${error?.message}`);
  return data.id as number;
}

// A transferred booking as markAsTransferred leaves it: payment fields intact
// (fake PayMongo ids, no real payment exists), transfer metadata set, original
// payer's email on the row. payment_gateway_status "paid" + payout_status
// "unpaid" so it sits exactly where the payout pipeline would pick it up.
async function insertTransferredBooking(tripId: number, suffix: string): Promise<number> {
  const { data, error } = await admin
    .from("bookings")
    .insert({
      trip_id: tripId,
      status: "transferred",
      full_name: `Original Payer (${RUN_MARKER})`,
      email: `original-payer-${suffix}@example.invalid`,
      slots: 1,
      payment_option: "full",
      total_amount: TOTAL,
      amount_due: TOTAL,
      platform_commission: 0,
      payment_gateway_status: "paid",
      balance_payment_gateway_status: null,
      paymongo_payment_id: `fake_pay_${RUN_MARKER}_${suffix}`,
      balance_paymongo_payment_id: null,
      payment_method: "card",
      payout_status: "unpaid",
      transferred_at: new Date().toISOString(),
      transferred_to_email: `replacement-${suffix}@example.invalid`,
      notes: RUN_MARKER,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`booking insert (${suffix}) failed: ${error?.message}`);
  return data.id as number;
}

// The getPendingPayouts eligibility pipeline (admin.ts getPendingPayouts):
// DB shape .in(status, ATTENDED_STATUSES).eq(payout_status, "unpaid") with the
// trip join, then payoutTimingGate + isPayoutEligible. Scoped to our two
// throwaway booking ids only (a pure narrowing; never touches real rows).
async function payoutEligibleIds(bookingIds: number[]): Promise<number[]> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, status, total_amount, amount_due, platform_commission, payment_option, balance_collected, payment_gateway_status, balance_payment_gateway_status, created_at, trip:trips!bookings_trip_id_fkey(title, date_start, organizer_id)")
    .in("status", [...ATTENDED_STATUSES])
    .eq("payout_status", "unpaid")
    .in("id", bookingIds);
  if (error) throw new Error(`payout eligibility query failed: ${error.message}`);
  const today = todayManilaDate();
  // Same unknown-cast convention the app uses for this join: the to-one FK
  // embed returns an object at runtime, but the client's parser types it as an
  // array.
  const rows = (data ?? []) as unknown as Array<{
    id: number;
    status: string;
    payment_gateway_status: string | null;
    total_amount: number | null;
    balance_payment_gateway_status: string | null;
    payment_option: string | null;
    created_at: string;
    trip: { date_start: string } | null;
  }>;
  // trips.date_start is a timestamptz: PostgREST returns "2026-07-05T00:00:00+00:00",
  // but payoutTimingGate's documented contract is "YYYY-MM-DD" Manila strings and its
  // addCalendarDays call throws RangeError (Invalid time value) on the full ISO form.
  // Normalize to the date-only prefix so the predicates evaluate. NOTE: production
  // call sites (getPendingPayouts, createPayoutAction, organizer dashboard) pass the
  // full ISO value straight through, so the same throw is latent there on any unpaid
  // booking that reaches the late-booking lane. Flagged separately; out of scope here.
  return rows
    .map((b) => ({
      ...b,
      trip: b.trip ? { ...b.trip, date_start: b.trip.date_start.slice(0, 10) } : null,
    }))
    .filter((b) => {
      if (!payoutTimingGate(b, today).payable) return false;
      if (!isPayoutEligible(b)) return false;
      return b.payment_option === "full" || b.payment_option === "downpayment";
    })
    .map((b) => b.id);
}

async function main() {
  console.log(`Transfer-refund live verification (selection layer) — run marker ${RUN_MARKER}`);
  console.log(`No cancelTrip/rejectOrganizer call, no PayMongo, no email, no refunds rows.\n`);

  let cancelledTripId: number | null = null;
  let controlTripId: number | null = null;
  let cancelledBookingId: number | null = null;
  let controlBookingId: number | null = null;

  try {
    // Trip A: will be "cancelled" (future date, as a real cancellable trip is).
    // Trip B: control, stays active, date in the past so payoutTimingGate's
    // post-trip lane is open and the control booking is genuinely payable.
    cancelledTripId = await insertTrip("cancelled-trip", "active", ymdOffset(+7));
    controlTripId = await insertTrip("control-trip", "active", ymdOffset(-1));
    cancelledBookingId = await insertTransferredBooking(cancelledTripId, "a");
    controlBookingId = await insertTransferredBooking(controlTripId, "b");

    // Mirror cancelTrip's order: trip flips to cancelled first, then the
    // status-guarded booking update.
    const { error: tripCancelErr } = await admin
      .from("trips")
      .update({ status: "cancelled" })
      .eq("id", cancelledTripId);
    record("trip A transitioned to cancelled", !tripCancelErr, tripCancelErr?.message ?? "ok");

    // A. The EXACT guarded update cancelTrip runs (same filter constant, same
    // select list), scoped to trip A.
    const { data: swept, error: sweepErr } = await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("trip_id", cancelledTripId)
      .in("status", [...TRIP_CANCELLATION_REFUND_STATUSES])
      .select("id, full_name, email, total_amount, amount_due, payment_option, paymongo_payment_id, balance_paymongo_payment_id, payment_method, balance_payment_gateway_status, payout_status, payout_id");

    record("guarded update ran without error", !sweepErr, sweepErr?.message ?? "ok");
    const sweptRow = (swept ?? []).find((b: { id: number }) => b.id === cancelledBookingId);
    record(
      "transferred booking IS selected by the cancel sweep",
      !!sweptRow,
      `returned ids: [${(swept ?? []).map((b: { id: number }) => b.id).join(", ")}]`,
    );
    record(
      "swept row carries the original payer's refund data",
      !!sweptRow &&
        sweptRow.email === "original-payer-a@example.invalid" &&
        sweptRow.paymongo_payment_id === `fake_pay_${RUN_MARKER}_a` &&
        Number(sweptRow.total_amount) === TOTAL,
      JSON.stringify(sweptRow ?? null),
    );
    record(
      "amountJoinerPaid(swept row) === full amount paid",
      !!sweptRow && amountJoinerPaid(sweptRow) === TOTAL,
      sweptRow ? `amountJoinerPaid=${amountJoinerPaid(sweptRow)}` : "no row",
    );

    const { data: after } = await admin
      .from("bookings")
      .select("status, transferred_at")
      .eq("id", cancelledBookingId)
      .maybeSingle();
    record("booking status is now 'cancelled'", after?.status === "cancelled", `status=${after?.status}`);
    record(
      "transfer record (transferred_at) preserved through the transition",
      !!after?.transferred_at,
      `transferred_at=${after?.transferred_at}`,
    );

    // B. Idempotency: a second identical sweep must select zero rows.
    const { data: secondSweep, error: secondErr } = await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("trip_id", cancelledTripId)
      .in("status", [...TRIP_CANCELLATION_REFUND_STATUSES])
      .select("id");
    record(
      "re-running the sweep selects ZERO rows (no double refund path)",
      !secondErr && (secondSweep ?? []).length === 0,
      secondErr?.message ?? `count=${(secondSweep ?? []).length}`,
    );

    // C + D. Payout eligibility per the getPendingPayouts pipeline.
    const eligible = await payoutEligibleIds([cancelledBookingId, controlBookingId]);
    record(
      "cancelled-trip booking is ABSENT from payout eligibility",
      !eligible.includes(cancelledBookingId),
      `eligible ids: [${eligible.join(", ")}]`,
    );
    record(
      "control transferred booking on live past trip REMAINS payout eligible",
      eligible.includes(controlBookingId),
      `eligible ids: [${eligible.join(", ")}]`,
    );
  } catch (e) {
    record("threw", false, String(e));
  } finally {
    // FK-safe teardown: bookings first, then trips. By-marker deletes catch
    // anything this run created even if an id capture was missed.
    const leftoverErrs: string[] = [];
    const b = await admin.from("bookings").delete().eq("notes", RUN_MARKER);
    if (b.error) leftoverErrs.push(`bookings(${RUN_MARKER}): ${b.error.message}`);
    const t = await admin.from("trips").delete().like("slug", `${RUN_MARKER}-%`);
    if (t.error) leftoverErrs.push(`trips(${RUN_MARKER}): ${t.error.message}`);
    if (leftoverErrs.length) {
      console.error("  !! CLEANUP FAILED — REMOVE BY HAND:");
      for (const l of leftoverErrs) console.error("     " + l);
    }
  }

  // Final zero-leftover assertion for this run's marker.
  const [{ data: leftB, error: leftBErr }, { data: leftT, error: leftTErr }] = await Promise.all([
    admin.from("bookings").select("id").eq("notes", RUN_MARKER),
    admin.from("trips").select("id").like("slug", `${RUN_MARKER}-%`),
  ]);
  const leftoverCount =
    leftBErr || leftTErr ? -1 : (leftB?.length ?? 0) + (leftT?.length ?? 0);
  record(
    "zero leftover rows from this run",
    leftoverCount === 0,
    leftBErr?.message ?? leftTErr?.message ?? `bookings=${leftB?.length ?? 0} trips=${leftT?.length ?? 0}`,
  );

  console.log("=================== RESULTS ===================");
  for (const c of checks) console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.label} — ${c.detail}`);
  const allPass = checks.every((c) => c.pass);
  console.log(`  OVERALL: ${allPass ? "PASS" : "FAIL"}`);
  console.log("==============================================");
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
