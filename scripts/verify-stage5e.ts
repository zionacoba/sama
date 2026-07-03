// FAITHFUL live verification of reverseBookingCredit (Stage 5e ledger reversal).
//
// Runs the ACTUAL lib/organizer-credits.ts reverseBookingCredit against REAL rows
// in the live database (service-role client, same as the app), so every trigger and
// foreign key fires as in production. Each scenario rolls back everything it creates
// in a finally block, in FK-safe order, even if an assertion throws. At the end it
// asserts zero leftover rows for this run.
//
// This harness issues NO PayMongo refunds: it calls reverseBookingCredit directly,
// never the full cancel action. It writes/deletes only its own throwaway rows.
//
// Run:  node scripts/verify-stage5e.ts
//
// Do NOT commit. Do NOT modify source. Test harness only.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reverseBookingCredit } from "../lib/organizer-credits.ts";

const ORG = "170435a9-dd67-46d7-b744-6448d8e422e8";
const TRIP_ID = 26;
// Booking basis D=2000 B=3000 T=5000.
const TOTAL = 5000;
const REVERSAL_REASON = "Reversal of refunded balance after cancellation";
// Unique per-run marker stamped into booking.notes so the final leftover check can
// identify rows created by THIS run precisely (trip 26 may hold unrelated bookings).
const RUN_MARKER = `stage5e-verify-${Date.now()}`;

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
) as unknown as SupabaseClient;

const num = (x: unknown): number => Number(x);
const createdBookingIds: number[] = [];

type Check = { label: string; pass: boolean; detail: string };

function record(checks: Check[], label: string, pass: boolean, detail: string) {
  checks.push({ label, pass, detail });
}

// Inserts a real booking via the normal service-role insert (fires any live triggers)
// and returns its id. Stamped with RUN_MARKER for leftover detection.
async function insertBooking(payoutStatus: string): Promise<number> {
  const { data, error } = await admin
    .from("bookings" as "trips")
    .insert({
      trip_id: TRIP_ID,
      total_amount: TOTAL,
      amount_due: TOTAL,
      platform_commission: 0,
      status: "cancelled",
      payout_status: payoutStatus,
      notes: RUN_MARKER,
    } as never)
    .select("id")
    .single() as unknown as { data: { id: number } | null; error: { message: string } | null };
  if (error || !data) throw new Error(`booking insert failed: ${error?.message}`);
  createdBookingIds.push(data.id);
  return data.id;
}

async function insertPayout(
  bookingId: number,
  status: string,
  total: number,
  commission: number,
  net: number,
): Promise<string> {
  const { data, error } = await admin
    .from("payouts" as "trips")
    .insert({
      organizer_id: ORG,
      booking_ids: [bookingId],
      total_amount: total,
      platform_commission: commission,
      net_amount: net,
      status,
    } as never)
    .select("id")
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null };
  if (error || !data) throw new Error(`payout insert failed: ${error?.message}`);
  return data.id;
}

async function insertCredit(
  bookingId: number,
  amount: number,
  status: string,
  appliedPayoutId: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("organizer_credits" as "trips")
    .insert({
      organizer_id: ORG,
      booking_id: bookingId,
      amount,
      reason: "Balance paid after payout (Stage 5e verify)",
      status,
      applied_payout_id: appliedPayoutId,
    } as never)
    .select("id, amount, status, applied_payout_id")
    .single() as unknown as {
      data: { id: string; amount: number; status: string; applied_payout_id: string | null } | null;
      error: { message: string } | null;
    };
  if (error || !data) throw new Error(`credit insert failed: ${error?.message}`);
  return data.id;
}

async function readCredit(id: string) {
  const { data } = await admin
    .from("organizer_credits" as "trips")
    .select("id, amount, status, applied_payout_id")
    .eq("id", id)
    .maybeSingle() as unknown as {
      data: { id: string; amount: number; status: string; applied_payout_id: string | null } | null;
    };
  return data;
}

async function readPayout(id: string) {
  const { data } = await admin
    .from("payouts" as "trips")
    .select("id, status, needs_reconciliation")
    .eq("id", id)
    .maybeSingle() as unknown as {
      data: { id: string; status: string; needs_reconciliation: boolean | null } | null;
    };
  return data;
}

async function readReversalDeductions(bookingId: number) {
  const { data } = await admin
    .from("organizer_deductions" as "trips")
    .select("id, amount, reason, status")
    .eq("booking_id", bookingId)
    .eq("reason", REVERSAL_REASON) as unknown as {
      data: Array<{ id: string; amount: number; reason: string; status: string }> | null;
    };
  return data ?? [];
}

// FK-safe teardown: deductions -> credits -> payouts -> booking. Deductions and
// credits are removed by booking_id (catches anything the function created); the
// payout and booking by captured id. Loud on any failure so stragglers are visible.
async function cleanup(bookingId: number | null, payoutId: string | null) {
  const leftover: string[] = [];
  if (bookingId != null) {
    const d = await admin.from("organizer_deductions" as "trips").delete().eq("booking_id", bookingId) as unknown as { error: { message: string } | null };
    if (d.error) leftover.push(`deductions(booking ${bookingId}): ${d.error.message}`);
    const c = await admin.from("organizer_credits" as "trips").delete().eq("booking_id", bookingId) as unknown as { error: { message: string } | null };
    if (c.error) leftover.push(`credits(booking ${bookingId}): ${c.error.message}`);
  }
  if (payoutId != null) {
    const p = await admin.from("payouts" as "trips").delete().eq("id", payoutId) as unknown as { error: { message: string } | null };
    if (p.error) leftover.push(`payout ${payoutId}: ${p.error.message}`);
  }
  if (bookingId != null) {
    const b = await admin.from("bookings" as "trips").delete().eq("id", bookingId) as unknown as { error: { message: string } | null };
    if (b.error) leftover.push(`booking ${bookingId}: ${b.error.message}`);
  }
  if (leftover.length) {
    console.error("  !! CLEANUP FAILED — REMOVE BY HAND:");
    for (const l of leftover) console.error("     " + l);
  }
}

function report(name: string, checks: Check[]): boolean {
  const ok = checks.every((c) => c.pass);
  console.log(`\nScenario ${name}: ${ok ? "PASS" : "FAIL"}`);
  for (const c of checks) {
    console.log(`  [${c.pass ? "PASS" : "FAIL"}] ${c.label} — ${c.detail}`);
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Scenario A (over-claw fix): pending credit, booking already remitted, full
// balance refunded. Expect a plain void, NO offsetting deduction.
// ---------------------------------------------------------------------------
async function scenarioA(): Promise<boolean> {
  const checks: Check[] = [];
  let bookingId: number | null = null;
  try {
    bookingId = await insertBooking("remitted");
    const creditId = await insertCredit(bookingId, 3000, "pending", null);

    const { action, error } = await reverseBookingCredit(admin, bookingId, ORG, 3000);
    record(checks, "no DB error", !error, error ?? "none");
    record(checks, "action.kind === 'void'", action.kind === "void", JSON.stringify(action));

    const credit = await readCredit(creditId);
    record(checks, "credit status now 'void'", credit?.status === "void", `status=${credit?.status}`);

    const deds = await readReversalDeductions(bookingId);
    record(checks, "NO reversal deduction exists", deds.length === 0, `count=${deds.length}`);

    return report("A", checks);
  } catch (e) {
    record(checks, "threw", false, String(e));
    return report("A", checks);
  } finally {
    await cleanup(bookingId, null);
  }
}

// ---------------------------------------------------------------------------
// Scenario B (applied + remitted, 50%): applied credit netted into a remitted
// payout, half the balance refunded. Expect void-and-offset 1500 with exactly
// one offsetting deduction of 1500.
// ---------------------------------------------------------------------------
async function scenarioB(): Promise<boolean> {
  const checks: Check[] = [];
  let bookingId: number | null = null;
  let payoutId: string | null = null;
  try {
    bookingId = await insertBooking("remitted");
    payoutId = await insertPayout(bookingId, "remitted", 3000, 0, 1500);
    const creditId = await insertCredit(bookingId, 3000, "applied", payoutId);

    const { action, error } = await reverseBookingCredit(admin, bookingId, ORG, 1500);
    record(checks, "no DB error", !error, error ?? "none");
    record(
      checks,
      "action === void-and-offset 1500",
      action.kind === "void-and-offset" && num((action as { amount: number }).amount) === 1500,
      JSON.stringify(action),
    );

    const credit = await readCredit(creditId);
    record(checks, "credit status now 'void'", credit?.status === "void", `status=${credit?.status}`);

    const deds = await readReversalDeductions(bookingId);
    const one = deds.length === 1 && num(deds[0].amount) === 1500;
    record(checks, "exactly one reversal deduction of 1500", one, `count=${deds.length} amounts=${deds.map((d) => d.amount).join(",")}`);

    return report("B", checks);
  } catch (e) {
    record(checks, "threw", false, String(e));
    return report("B", checks);
  } finally {
    await cleanup(bookingId, payoutId);
  }
}

// ---------------------------------------------------------------------------
// Scenario C (pending, 50%): pending credit, half refunded. Expect shrink to
// retained 1500 — credit stays 'pending' with amount 1500, NO deduction.
// ---------------------------------------------------------------------------
async function scenarioC(): Promise<boolean> {
  const checks: Check[] = [];
  let bookingId: number | null = null;
  try {
    bookingId = await insertBooking("unpaid");
    const creditId = await insertCredit(bookingId, 3000, "pending", null);

    const { action, error } = await reverseBookingCredit(admin, bookingId, ORG, 1500);
    record(checks, "no DB error", !error, error ?? "none");
    record(
      checks,
      "action === shrink retained 1500",
      action.kind === "shrink" && num((action as { retained: number }).retained) === 1500,
      JSON.stringify(action),
    );

    const credit = await readCredit(creditId);
    record(checks, "credit still 'pending'", credit?.status === "pending", `status=${credit?.status}`);
    record(checks, "credit amount now 1500", num(credit?.amount) === 1500, `amount=${credit?.amount}`);

    const deds = await readReversalDeductions(bookingId);
    record(checks, "NO reversal deduction exists", deds.length === 0, `count=${deds.length}`);

    return report("C", checks);
  } catch (e) {
    record(checks, "threw", false, String(e));
    return report("C", checks);
  } finally {
    await cleanup(bookingId, null);
  }
}

// ---------------------------------------------------------------------------
// Scenario D (applied into a still-pending payout): applied credit, payout not
// yet remitted. Expect document — payout flagged needs_reconciliation, credit
// UNCHANGED, NO deduction.
// ---------------------------------------------------------------------------
async function scenarioD(): Promise<boolean> {
  const checks: Check[] = [];
  let bookingId: number | null = null;
  let payoutId: string | null = null;
  try {
    bookingId = await insertBooking("included");
    payoutId = await insertPayout(bookingId, "pending", 3000, 0, 1500);
    const creditId = await insertCredit(bookingId, 3000, "applied", payoutId);

    const { action, error } = await reverseBookingCredit(admin, bookingId, ORG, 2000);
    record(checks, "no DB error", !error, error ?? "none");
    record(checks, "action.kind === 'document'", action.kind === "document", JSON.stringify(action));

    const payout = await readPayout(payoutId);
    record(checks, "payout needs_reconciliation now true", payout?.needs_reconciliation === true, `needs_reconciliation=${payout?.needs_reconciliation}`);

    const credit = await readCredit(creditId);
    record(checks, "credit UNCHANGED status 'applied'", credit?.status === "applied", `status=${credit?.status}`);
    record(checks, "credit UNCHANGED amount 3000", num(credit?.amount) === 3000, `amount=${credit?.amount}`);

    const deds = await readReversalDeductions(bookingId);
    record(checks, "NO reversal deduction exists", deds.length === 0, `count=${deds.length}`);

    return report("D", checks);
  } catch (e) {
    record(checks, "threw", false, String(e));
    return report("D", checks);
  } finally {
    await cleanup(bookingId, payoutId);
  }
}

async function main() {
  console.log(`Stage 5e live verification — run marker ${RUN_MARKER}`);
  console.log(`trip_id=${TRIP_ID} organizer_id=${ORG} basis D=2000 B=3000 T=5000\n`);

  const results = [
    ["A", await scenarioA()],
    ["B", await scenarioB()],
    ["C", await scenarioC()],
    ["D", await scenarioD()],
  ] as const;

  // Final leftover check: any booking from THIS run (trip 26 + our marker) still present?
  const { data: leftover, error: leftErr } = await admin
    .from("bookings" as "trips")
    .select("id")
    .eq("trip_id", TRIP_ID)
    .eq("notes", RUN_MARKER) as unknown as { data: Array<{ id: number }> | null; error: { message: string } | null };

  const leftoverCount = leftover?.length ?? -1;

  console.log("\n=================== SUMMARY ===================");
  for (const [name, ok] of results) console.log(`  Scenario ${name}: ${ok ? "PASS" : "FAIL"}`);
  if (leftErr) {
    console.log(`  Leftover check ERROR: ${leftErr.message}`);
  } else {
    console.log(`  Leftover rows created by this run: ${leftoverCount}`);
  }
  if (leftoverCount > 0) {
    console.error("  !! LEFTOVER BOOKINGS NOT CLEANED — ids:", (leftover ?? []).map((b) => b.id).join(", "));
  }
  const allPass = results.every(([, ok]) => ok) && leftoverCount === 0;
  console.log(`  OVERALL: ${allPass ? "PASS" : "FAIL"}`);
  console.log("==============================================");

  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
