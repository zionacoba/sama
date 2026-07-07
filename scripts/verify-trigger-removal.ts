// FAITHFUL live verification that dropping the check_slot_availability trigger
// fixed group bookings without weakening the RPC's own capacity guard.
//
// CONTEXT: live had a BEFORE INSERT trigger before_booking_inserted on bookings
// running check_slot_availability(), which raised "Not enough slots available
// (N remaining)" when remaining_slots < NEW.slots. Because
// book_slot_and_create_booking decrements remaining_slots FIRST (under an atomic
// guarded UPDATE) and THEN inserts, the trigger read the already-decremented
// value and double-counted the booking against itself, wrongly rejecting any
// booking larger than half the remaining slots. The trigger was dropped from
// live. This harness proves:
//   1. THE FIX: a 7-of-10 booking (the exact case that failed) now SUCCEEDS and
//      leaves remaining 3.
//   2. GUARD INTACT: genuine over-capacity is still rejected, now by the RPC's
//      own guarded UPDATE (error contains "not_enough_slots"), and a rejected
//      booking does not decrement.
//   3. EXACT-CAPACITY BOUNDARY: a full 10-of-10 booking succeeds to remaining 0;
//      one more slot is rejected and remaining stays 0.
//   4. LARGE-GROUP SANITY: a 6-of-10 booking (more than half) succeeds to
//      remaining 4.
//
// This harness NEVER calls the updateTrip or createBooking server actions, NEVER
// contacts PayMongo, NEVER sends email. It creates only its own throwaway
// trips/bookings (stamped with a per-run marker), deletes them in a finally block
// in FK-safe order (bookings before trips), and asserts zero leftovers at the end.
//
// All bookings use the REAL production insert path, book_slot_and_create_booking
// (the bare book_slot RPC does NOT exist in the live database). Each inserted row
// carries notes = RUN_MARKER and status "confirmed" so the finally-block cleanup
// catches every row.
//
// Run:  npx tsx scripts/verify-trigger-removal.ts
//
// Do NOT commit. Do NOT modify source. Test harness only.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";

const RUN_MARKER = `trigger-removal-verify-${Date.now()}`;
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

// Throwaway active trip with explicit capacity. Slug carries the RUN_MARKER so
// cleanup can sweep by marker. organizer_id is left null (nullable, as the
// set-total-slots and transfer-refund harnesses rely on too).
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

// Book via the REAL production insert path. book_slot_and_create_booking
// atomically does `remaining_slots = remaining_slots - p_slots_requested`
// (guarded by remaining_slots >= requested, raising not_enough_slots otherwise)
// and inserts the booking row. Every required positional parameter is supplied;
// the two trailing custom-question params default to NULL. p_user_id is null
// (bookings.user_id is nullable). p_notes is the RUN_MARKER and p_status is
// "confirmed" so the row is caught by the FK-safe cleanup.
//
// Unlike the model harness's simulateBooking, this does NOT throw on RPC error:
// scenarios 2 and 3b expect a rejection, so the caller inspects the result.
async function book(
  tripId: number,
  slots: number,
  suffix: string,
): Promise<{ id: number | null; error: string | null }> {
  const { data, error } = await admin.rpc("book_slot_and_create_booking", {
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
  return { id: error ? null : (data as number), error: error?.message ?? null };
}

async function readRemaining(tripId: number): Promise<number> {
  const { data, error } = await admin
    .from("trips")
    .select("remaining_slots")
    .eq("id", tripId)
    .single();
  if (error || !data) throw new Error(`readRemaining(${tripId}) failed: ${error?.message}`);
  return data.remaining_slots as number;
}

async function main() {
  console.log(`check_slot_availability trigger-removal live verification — run marker ${RUN_MARKER}`);
  console.log(`No updateTrip/createBooking call, no PayMongo, no email.\n`);

  let tripA: number | null = null;
  let tripB: number | null = null;
  let tripC: number | null = null;

  try {
    // ---- Scenario 1: THE FIX (7 of 10 must now succeed) -------------------
    // Trip A 10/10. Book 7 slots. Under the old trigger the RPC decremented to 3
    // and the trigger then saw 3 < 7 and raised "Not enough slots available (3
    // remaining)". With the trigger gone the RPC's guarded UPDATE (10 >= 7)
    // succeeds and leaves remaining 3.
    tripA = await insertTrip("a", 10, 10);
    const a7 = await book(tripA, 7, "a7");
    const aAfter = await readRemaining(tripA);
    record(
      "THE FIX: 7-of-10 booking SUCCEEDS (was the exact case that failed)",
      a7.error === null && a7.id != null,
      a7.error ? `error=${a7.error}` : `booking id=${a7.id}`,
    );
    record(
      "THE FIX: trip A remaining_slots is now 3",
      aAfter === 3,
      `remaining=${aAfter}`,
    );

    // ---- Scenario 2: GENUINE OVER-CAPACITY STILL REJECTED -----------------
    // Trip A now has 3 remaining. Book 5. The RPC's guarded UPDATE (3 >= 5 is
    // false) matches no row, raises not_enough_slots, and rolls back, so nothing
    // is decremented. The error must be the RPC guard, NOT the old trigger string.
    const a5 = await book(tripA, 5, "a5");
    const aAfterReject = await readRemaining(tripA);
    record(
      "GUARD: 5-of-3 booking FAILS via the RPC guard (not_enough_slots)",
      a5.id === null && a5.error != null && a5.error.includes("not_enough_slots"),
      a5.error ? `error=${a5.error}` : `unexpected id=${a5.id}`,
    );
    record(
      "GUARD: error is NOT the old trigger string",
      a5.error != null && !a5.error.includes("Not enough slots available"),
      `error=${a5.error ?? "(none)"}`,
    );
    record(
      "GUARD: rejected booking did not decrement (remaining still 3)",
      aAfterReject === 3,
      `remaining=${aAfterReject}`,
    );

    // ---- Scenario 3: EXACT-CAPACITY BOUNDARY ------------------------------
    // Fresh trip B 10/10. Book exactly 10 (a full-capacity single booking the old
    // half-capacity trigger would have rejected). Must succeed to remaining 0.
    // Then one more slot must fail via the RPC guard, remaining stays 0.
    tripB = await insertTrip("b", 10, 10);
    const b10 = await book(tripB, 10, "b10");
    const bAfter = await readRemaining(tripB);
    record(
      "BOUNDARY: exact 10-of-10 booking SUCCEEDS",
      b10.error === null && b10.id != null,
      b10.error ? `error=${b10.error}` : `booking id=${b10.id}`,
    );
    record(
      "BOUNDARY: trip B remaining_slots is now 0",
      bAfter === 0,
      `remaining=${bAfter}`,
    );
    const b1 = await book(tripB, 1, "b1");
    const bAfterReject = await readRemaining(tripB);
    record(
      "BOUNDARY: 1 more on a full trip FAILS via the RPC guard (not_enough_slots)",
      b1.id === null && b1.error != null && b1.error.includes("not_enough_slots"),
      b1.error ? `error=${b1.error}` : `unexpected id=${b1.id}`,
    );
    record(
      "BOUNDARY: rejected booking did not decrement (remaining still 0)",
      bAfterReject === 0,
      `remaining=${bAfterReject}`,
    );

    // ---- Scenario 4: LARGE-GROUP SANITY -----------------------------------
    // Fresh trip C 10/10. Book 6 (more than half). Must succeed to remaining 4.
    // A second confirmation of the fix at a different size.
    tripC = await insertTrip("c", 10, 10);
    const c6 = await book(tripC, 6, "c6");
    const cAfter = await readRemaining(tripC);
    record(
      "LARGE GROUP: 6-of-10 booking (more than half) SUCCEEDS",
      c6.error === null && c6.id != null,
      c6.error ? `error=${c6.error}` : `booking id=${c6.id}`,
    );
    record(
      "LARGE GROUP: trip C remaining_slots is now 4",
      cAfter === 4,
      `remaining=${cAfter}`,
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
