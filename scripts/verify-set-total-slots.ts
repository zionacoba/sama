// FAITHFUL live verification of the set_total_slots capacity RPC (part 2b).
//
// Verifies against REAL rows in the live database (service-role client, same as
// the app) that the atomic set_total_slots RPC adjusts remaining_slots against
// the LIVE row so a concurrent booking decrement cannot be clobbered, and that
// the old stale-write path DID clobber it. Concretely:
//   1. CLOBBER REPRO: the OLD write behavior (.update remaining_slots = a stale
//      JS value) overwrites a concurrent booking decrement (oversell). Proves
//      the bug shape 2b fixes; documentation value only.
//   2. GROW: set_total_slots(new_total > old) returns new_total minus LIVE
//      consumption and writes both slot fields, so a booking that landed after
//      the snapshot survives (the old JS path would have resold those slots).
//   3. SHRINK: set_total_slots(new_total < old, still >= consumed) returns
//      new_total minus consumed and keeps remaining within [0, total].
//   4. SHRINK-BELOW-CONSUMED: the greatest(0, ...) clamp floors remaining at 0
//      and total assignment in the same statement keeps the CHECK satisfied.
//   5. MISSING TRIP: an unmatched id returns null (zero rows), matching the
//      wiring's newRemaining == null failure detection.
//   6. WAITLIST GATE: the re-gated boolean expression the wiring uses
//      (existingRemaining === 0 && newTotal > existingTotal), pure asserts.
//
// This harness NEVER calls the updateTrip server action, NEVER contacts
// PayMongo, NEVER sends email. It creates only its own throwaway trips/bookings
// (stamped with a per-run marker), deletes them in a finally block in FK-safe
// order (bookings before trips), and asserts zero leftovers at the end.
//
// The concurrent-booking decrement is simulated with the REAL production
// decrement path, book_slot_and_create_booking, because the bare book_slot RPC
// does NOT exist in the live database. That RPC decrements remaining_slots and
// inserts a booking row in one statement; the inserted row carries notes =
// RUN_MARKER so the finally-block cleanup catches it (FK-safe: bookings first).
//
// Run:  npx tsx scripts/verify-set-total-slots.ts
//
// Do NOT commit. Do NOT modify source. Test harness only.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";

const RUN_MARKER = `set-total-slots-verify-${Date.now()}`;
const PRICE = 1000;
// An id no trips serial will ever occupy, for the missing-trip case.
const MISSING_TRIP_ID = -1;

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

// Throwaway active trip with explicit capacity. Slug carries the RUN_MARKER so
// cleanup can sweep by marker. organizer_id is left null (nullable, as the
// transfer-refund harness relies on too).
async function insertTrip(suffix: string, totalSlots: number, remainingSlots: number): Promise<number> {
  const { data, error } = await admin
    .from("trips")
    .insert({
      title: `${RUN_MARKER}-${suffix}`,
      slug: `${RUN_MARKER}-${suffix}`,
      status: "active",
      date_start: ymdOffset(+30),
      total_slots: totalSlots,
      remaining_slots: remainingSlots,
      price: PRICE,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`trip insert (${suffix}) failed: ${error?.message}`);
  return data.id as number;
}

// Simulate a concurrent booking landing in the TOCTOU window using the REAL
// production decrement path. book_slot_and_create_booking atomically does
// `remaining_slots = remaining_slots - p_slots_requested` (guarded by
// remaining_slots >= requested) and inserts the booking row. Every required
// positional parameter is supplied; the two trailing custom-question params
// default to NULL. p_user_id is null (bookings.user_id is nullable). p_notes is
// the RUN_MARKER so the row is caught by the FK-safe cleanup.
async function simulateBooking(tripId: number, slots: number, suffix: string): Promise<void> {
  const { error } = await admin.rpc("book_slot_and_create_booking", {
    p_trip_id: tripId,
    p_user_id: null,
    p_slots_requested: slots,
    p_full_name: `Booker ${suffix} (${RUN_MARKER})`,
    p_email: `booker-${suffix}@example.invalid`,
    p_phone: "09170000000",
    p_total_amount: PRICE * slots,
    p_status: "confirmed",
    p_notes: RUN_MARKER,
    p_payment_option: "full",
    p_amount_due: PRICE * slots,
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
  if (error) throw new Error(`simulateBooking(${suffix}, ${slots}) failed: ${error.message}`);
}

async function readSlots(tripId: number): Promise<{ total: number; remaining: number }> {
  const { data, error } = await admin
    .from("trips")
    .select("total_slots, remaining_slots")
    .eq("id", tripId)
    .single();
  if (error || !data) throw new Error(`readSlots(${tripId}) failed: ${error?.message}`);
  return { total: data.total_slots as number, remaining: data.remaining_slots as number };
}

function constraintHolds(total: number, remaining: number): boolean {
  return remaining >= 0 && remaining <= total;
}

async function main() {
  console.log(`set_total_slots live verification — run marker ${RUN_MARKER}`);
  console.log(`No updateTrip call, no PayMongo, no email.\n`);

  let tripA: number | null = null;
  let tripB: number | null = null;
  let tripC: number | null = null;
  let tripD: number | null = null;

  try {
    // ---- Scenario 1: CLOBBER REPRO (proves the OLD bug shape) -------------
    // Trip A starts at 10/10. Read remaining into a JS var (updateTrip's old
    // stale top-of-function read). A concurrent booking of 3 decrements the live
    // row to 7. The OLD write then re-asserts the stale 10, clobbering the
    // decrement: the trip is oversold back to 10 remaining though 3 are booked.
    tripA = await insertTrip("a", 10, 10);
    const staleRemaining = (await readSlots(tripA)).remaining; // 10
    await simulateBooking(tripA, 3, "a"); // live remaining -> 7
    const liveAfterBooking = (await readSlots(tripA)).remaining;
    record(
      "scenario 1 setup: concurrent booking decremented live remaining to 7",
      liveAfterBooking === 7,
      `stale JS read=${staleRemaining}, live after booking=${liveAfterBooking}`,
    );
    const { error: oldWriteErr } = await admin
      .from("trips")
      .update({ remaining_slots: staleRemaining }) // the OLD stale-write behavior
      .eq("id", tripA);
    const afterOldWrite = (await readSlots(tripA)).remaining;
    record(
      "OLD PATH clobbers (expected, proves the bug)",
      !oldWriteErr && afterOldWrite === 10,
      `remaining after stale write=${afterOldWrite} (booking's decrement to 7 lost)`,
    );

    // ---- Scenario 2: GROW (the fix) --------------------------------------
    // Trip B 10/10, concurrent booking of 3 -> live remaining 7. set_total_slots
    // to 15 must return 15 - 3(live consumed) = 12 and write total 15 / remaining
    // 12. The OLD JS path used a pre-booking snapshot (consumed 0) and would have
    // written max(0, 15 - 0) = 15, reselling the 3 already-booked slots.
    tripB = await insertTrip("b", 10, 10);
    await simulateBooking(tripB, 3, "b"); // live remaining -> 7
    const { data: growReturn, error: growErr } = await admin.rpc("set_total_slots", {
      p_trip_id: tripB,
      p_new_total: 15,
    });
    const growRow = await readSlots(tripB);
    record(
      "GROW: set_total_slots(15) returns 12 (15 minus 3 live-consumed)",
      !growErr && Number(growReturn) === 12,
      growErr?.message ?? `returned=${growReturn}`,
    );
    record(
      "GROW: row reads total 15, remaining 12 (concurrent booking survived)",
      growRow.total === 15 && growRow.remaining === 12,
      `total=${growRow.total}, remaining=${growRow.remaining}`,
    );

    // ---- Scenario 3: SHRINK ----------------------------------------------
    // Trip C 10/10, consume 7 -> remaining 3. set_total_slots(8) must return
    // 8 - 7 = 1, write total 8 / remaining 1, and stay within [0, total].
    tripC = await insertTrip("c", 10, 10);
    // Consume 7 on a freshly-created 10/10 trip via bookings of 3 + 3 + 1. A
    // single 7-slot booking is rejected by the live book_slot_and_create_booking
    // (it reported "3 remaining", i.e. the would-be remainder 10 - 7), whereas
    // the 3-slot bookings in scenarios 1 and 2 pass. Splitting keeps trip C
    // created at 10/10 and consumes exactly 7, leaving live remaining 3.
    await simulateBooking(tripC, 3, "c1");
    await simulateBooking(tripC, 3, "c2");
    await simulateBooking(tripC, 1, "c3"); // live remaining -> 3
    const { data: shrinkReturn, error: shrinkErr } = await admin.rpc("set_total_slots", {
      p_trip_id: tripC,
      p_new_total: 8,
    });
    const shrinkRow = await readSlots(tripC);
    record(
      "SHRINK: set_total_slots(8) returns 1 (8 minus 7 consumed)",
      !shrinkErr && Number(shrinkReturn) === 1,
      shrinkErr?.message ?? `returned=${shrinkReturn}`,
    );
    record(
      "SHRINK: row reads total 8, remaining 1 and CHECK holds (0 <= 1 <= 8)",
      shrinkRow.total === 8 && shrinkRow.remaining === 1 && constraintHolds(shrinkRow.total, shrinkRow.remaining),
      `total=${shrinkRow.total}, remaining=${shrinkRow.remaining}`,
    );

    // ---- Scenario 4: SHRINK-BELOW-CONSUMED CLAMP -------------------------
    // Trip D 10/10, consume 7 -> remaining 3. set_total_slots(5) is below the 7
    // consumed: 3 + (5 - 10) = -2, floored by greatest(0, ...) to 0. Row reads
    // total 5 / remaining 0, CHECK holds. In production the JS shrink guard in
    // updateTrip blocks total < consumed before the RPC is reached; this asserts
    // the SQL backstop when the guard is bypassed or raced.
    tripD = await insertTrip("d", 10, 10);
    // Same corrected shape as scenario 3: create at 10/10 and consume 7 via
    // 3 + 3 + 1 so the single-booking rejection is avoided. 7 consumed, remaining 3.
    await simulateBooking(tripD, 3, "d1");
    await simulateBooking(tripD, 3, "d2");
    await simulateBooking(tripD, 1, "d3"); // live remaining -> 3
    const { data: clampReturn, error: clampErr } = await admin.rpc("set_total_slots", {
      p_trip_id: tripD,
      p_new_total: 5,
    });
    const clampRow = await readSlots(tripD);
    record(
      "CLAMP: set_total_slots(5) returns 0 (greatest(0, 3 + (5-10)))",
      !clampErr && Number(clampReturn) === 0,
      clampErr?.message ?? `returned=${clampReturn}`,
    );
    record(
      "CLAMP: row reads total 5, remaining 0 and CHECK holds (0 <= 0 <= 5)",
      clampRow.total === 5 && clampRow.remaining === 0 && constraintHolds(clampRow.total, clampRow.remaining),
      `total=${clampRow.total}, remaining=${clampRow.remaining}`,
    );

    // ---- Scenario 5: MISSING TRIP ----------------------------------------
    // An unmatched id updates zero rows; RETURNING yields no row so the function
    // returns NULL with no error. This is exactly the wiring's newRemaining ==
    // null failure signal (trip vanished between the update and the RPC).
    const { data: missingReturn, error: missingErr } = await admin.rpc("set_total_slots", {
      p_trip_id: MISSING_TRIP_ID,
      p_new_total: 5,
    });
    record(
      "MISSING TRIP: returns null with no error (zero rows matched)",
      !missingErr && missingReturn == null,
      missingErr?.message ?? `returned=${JSON.stringify(missingReturn)}`,
    );

    // ---- Scenario 6: WAITLIST GATE (pure boolean, no email) --------------
    // The re-gated wiring condition: fire only on a genuine capacity increase on
    // a previously-full trip. existingRemaining === 0 && newTotal > existingTotal.
    const gate = (existingRemaining: number, existingTotal: number, newTotal: number) =>
      existingRemaining === 0 && newTotal > existingTotal;
    record(
      "WAITLIST GATE: full trip + capacity increase (0, 10 -> 12) is TRUE",
      gate(0, 10, 12) === true,
      `gate(0,10,12)=${gate(0, 10, 12)}`,
    );
    record(
      "WAITLIST GATE: full trip + non-capacity edit (0, 10 -> 10) is FALSE",
      gate(0, 10, 10) === false,
      `gate(0,10,10)=${gate(0, 10, 10)}`,
    );
    record(
      "WAITLIST GATE: non-full trip + capacity increase (3, 10 -> 12) is FALSE",
      gate(3, 10, 12) === false,
      `gate(3,10,12)=${gate(3, 10, 12)}`,
    );
  } catch (e) {
    record("threw", false, String(e));
  } finally {
    // FK-safe teardown: bookings first (they reference trips), then trips. Both
    // by-marker so anything this run created is swept even if an id was missed.
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
