// FAITHFUL live verification of the refund 'owed'-window idempotency fix.
//
// Verifies against REAL rows in the live database (service-role client, same as
// the app) that the refunds_one_settled partial unique index makes the 'owed'
// insert in issueAndRecordRefund the atomic first-issue gate: two concurrent
// first-issue inserts of an 'owed' refund row on the SAME
// (booking_id, source, payment_id) tuple result in exactly ONE surviving row.
// One insert wins; the other fails with Postgres error code 23505 (unique
// violation), which lib/refunds.ts already maps to { success: true } so the
// loser issues no PayMongo call.
//
// This harness NEVER contacts PayMongo, NEVER sends email, and NEVER calls
// issueAndRecordRefund or any server action. It asserts DB state ONLY: it fires
// two bare refunds inserts in parallel and inspects which survive. It creates
// only its own throwaway trip/booking (stamped with a per-run marker), deletes
// them in a finally block in FK-safe order (refunds, then booking, then trip),
// and asserts zero leftovers at the end.
//
// The throwaway booking is created with the REAL production path,
// book_slot_and_create_booking, because the bare book_slot RPC does NOT exist in
// the live database. That RPC decrements remaining_slots and inserts a booking
// row in one statement; the inserted row carries notes = RUN_MARKER so the
// finally-block cleanup catches it (FK-safe: refunds and booking before trip).
//
// This harness is designed to be run TWICE:
//   * BEFORE the index change: the old predicate does not cover 'owed', so BOTH
//     inserts succeed. The "exactly one succeeded", "failure is 23505", and
//     "count == 1" assertions all FAIL loudly (they do NOT throw), and cleanup
//     still runs. OVERALL: FAIL.
//   * AFTER the index change: the second insert hits 23505, one row survives.
//     OVERALL: PASS.
//
// Run:  npx tsx scripts/verify-refund-idempotency.ts
//
// Do NOT commit. Do NOT modify source. Test harness only.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";

const RUN_MARKER = `refund-idem-verify-${Date.now()}`;
const PRICE = 1000;
const SOURCE = "downpayment";
// Fixed synthetic payment id carrying the marker. Not a real PayMongo id; the
// harness never contacts PayMongo. It is the third column of the tuple under
// test and the handle the refunds cleanup sweeps by.
const PAYMENT_ID = `fake_pay_${RUN_MARKER}`;
const REFUND_AMOUNT = 500;

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
// trailing custom-question params default to NULL. p_user_id is null
// (bookings.user_id is nullable). p_notes is the RUN_MARKER so the row is caught
// by FK-safe cleanup. The booking id is read back by marker afterward.
async function createBooking(tripId: number): Promise<number> {
  const { error } = await admin.rpc("book_slot_and_create_booking", {
    p_trip_id: tripId,
    p_user_id: null,
    p_slots_requested: 1,
    p_full_name: `Booker (${RUN_MARKER})`,
    p_email: `booker-${RUN_MARKER}@example.invalid`,
    p_phone: "09170000000",
    p_total_amount: PRICE,
    p_status: "confirmed",
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

// One 'owed' refund insert on the tuple under test. Resolves to the raw
// PostgrestResponse (supabase-js does not reject on a DB error), so the caller
// inspects .error rather than a rejected promise.
function insertOwedRefund(bookingId: number) {
  return admin.from("refunds").insert({
    booking_id: bookingId,
    source: SOURCE,
    payment_id: PAYMENT_ID,
    amount: REFUND_AMOUNT,
    status: "owed",
    reason: "others",
  });
}

async function main() {
  console.log(`Refund idempotency live verification — run marker ${RUN_MARKER}`);
  console.log(`No PayMongo, no email, no issueAndRecordRefund call. DB state only.\n`);

  let tripId: number | null = null;
  let bookingId: number | null = null;

  try {
    tripId = await insertTrip();
    bookingId = await createBooking(tripId);
    record("setup: throwaway trip + booking created via book_slot_and_create_booking", true, `trip=${tripId}, booking=${bookingId}`);

    // Fire two first-issue 'owed' inserts on the SAME tuple in parallel. Neither
    // promise rejects; each settles with a PostgrestResponse carrying .error.
    const settled = await Promise.allSettled([
      insertOwedRefund(bookingId),
      insertOwedRefund(bookingId),
    ]);

    // Normalize: a fulfilled settle with no .error is a DB success; a fulfilled
    // settle WITH .error, or a rejected settle, is a DB failure. Capture the
    // Postgres error code where present.
    const outcomes = settled.map((s) => {
      if (s.status === "fulfilled") {
        const err = (s.value as { error: { code?: string; message?: string } | null }).error;
        return { ok: !err, code: err?.code ?? null, message: err?.message ?? null };
      }
      const reason = s.reason as { code?: string; message?: string };
      return { ok: false, code: reason?.code ?? null, message: reason?.message ?? String(s.reason) };
    });

    const successes = outcomes.filter((o) => o.ok);
    const failures = outcomes.filter((o) => !o.ok);

    // Assertion 1: exactly one insert won, exactly one lost. Before the index
    // change both win (2 successes, 0 failures) and this FAILS loudly.
    record(
      "exactly one insert succeeded and exactly one failed",
      successes.length === 1 && failures.length === 1,
      `successes=${successes.length}, failures=${failures.length}` +
        (failures.length ? ` (fail codes: ${failures.map((f) => f.code ?? "none").join(", ")})` : ""),
    );

    // Assertion 2: the failure is a Postgres unique violation (23505). With no
    // failure (both succeeded) there is nothing coded 23505, so this FAILS.
    const uniqueViolation = failures.length === 1 && failures[0].code === "23505";
    record(
      "the failed insert's Postgres code is 23505 (unique violation)",
      uniqueViolation,
      failures.length
        ? `code=${failures[0].code ?? "none"}, message=${failures[0].message ?? ""}`
        : "no insert failed (both succeeded)",
    );

    // Assertion 3: exactly one row physically survives for the tuple. Before the
    // index change two rows land and this FAILS.
    const { data: rows, error: countErr } = await admin
      .from("refunds")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("source", SOURCE)
      .eq("payment_id", PAYMENT_ID);
    record(
      "exactly one refunds row exists for the tuple",
      !countErr && (rows?.length ?? -1) === 1,
      countErr?.message ?? `count=${rows?.length ?? 0}`,
    );
  } catch (e) {
    record("threw", false, String(e));
  } finally {
    // FK-safe teardown: refunds (reference bookings) first, then booking, then
    // trip. By-marker/tuple deletes catch everything this run created even if an
    // id capture was missed or the index let a duplicate through.
    const leftoverErrs: string[] = [];
    const r = await admin.from("refunds").delete().eq("payment_id", PAYMENT_ID);
    if (r.error) leftoverErrs.push(`refunds(${PAYMENT_ID}): ${r.error.message}`);
    const b = await admin.from("bookings").delete().eq("notes", RUN_MARKER);
    if (b.error) leftoverErrs.push(`bookings(${RUN_MARKER}): ${b.error.message}`);
    const t = await admin.from("trips").delete().like("slug", `${RUN_MARKER}-%`);
    if (t.error) leftoverErrs.push(`trips(${RUN_MARKER}): ${t.error.message}`);
    if (leftoverErrs.length) {
      console.error("  !! CLEANUP FAILED — REMOVE BY HAND:");
      for (const l of leftoverErrs) console.error("     " + l);
    }
  }

  // Final zero-leftover assertion for this run's marker across all three tables.
  const [
    { data: leftR, error: leftRErr },
    { data: leftB, error: leftBErr },
    { data: leftT, error: leftTErr },
  ] = await Promise.all([
    admin.from("refunds").select("id").eq("payment_id", PAYMENT_ID),
    admin.from("bookings").select("id").eq("notes", RUN_MARKER),
    admin.from("trips").select("id").like("slug", `${RUN_MARKER}-%`),
  ]);
  const leftoverCount =
    leftRErr || leftBErr || leftTErr
      ? -1
      : (leftR?.length ?? 0) + (leftB?.length ?? 0) + (leftT?.length ?? 0);
  record(
    "zero leftover rows from this run",
    leftoverCount === 0,
    leftRErr?.message ??
      leftBErr?.message ??
      leftTErr?.message ??
      `refunds=${leftR?.length ?? 0} bookings=${leftB?.length ?? 0} trips=${leftT?.length ?? 0}`,
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
