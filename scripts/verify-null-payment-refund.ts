// Fail-then-pass proof that refunds.payment_id accepts SQL NULL, which is the
// visibility mechanism issueAndRecordRefund relies on for owed-but-unrefundable
// downpayment refunds (its payload uses paymentId ?? null).
//
// Run BEFORE the drop-not-null migration: the insert must FAIL with Postgres
// error 23502 (the hand-applied NOT NULL is still present). OVERALL: FAIL.
// Run AFTER the migration: the insert succeeds, the row reads back with
// payment_id IS NULL and status 'owed'. OVERALL: PASS.
//
// This harness NEVER contacts PayMongo, NEVER sends email, and NEVER imports
// lib/refunds.ts or anything that initializes Sentry. It asserts DB state ONLY
// via direct supabase-js calls. It creates its own throwaway trip/booking
// (stamped with a per-run marker), deletes them in a finally block in FK-safe
// order (refunds, then booking, then trip), and asserts zero leftovers at the
// end. The refunds row carries payment_id NULL by design, so cleanup sweeps
// refunds by booking_id linkage instead of by a synthetic payment id.
//
// Run:  npx tsx scripts/verify-null-payment-refund.ts
//
// Do NOT commit. Do NOT modify source. Test harness only.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";

const RUN_MARKER = `null-payment-verify-${Date.now()}`;
const PRICE = 1000;
const SOURCE = "downpayment";
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

async function main() {
  console.log(`Null payment_id refund live verification - run marker ${RUN_MARKER}`);
  console.log(`No PayMongo, no email, no issueAndRecordRefund call. DB state only.\n`);

  let tripId: number | null = null;
  let bookingId: number | null = null;

  try {
    tripId = await insertTrip();
    bookingId = await createBooking(tripId);
    record("setup: throwaway trip + booking created via book_slot_and_create_booking", true, `trip=${tripId}, booking=${bookingId}`);

    // THE CORE ASSERTION: exactly the payload shape issueAndRecordRefund uses,
    // with an explicit JavaScript null for payment_id. Explicit null (never
    // undefined) matters: supabase-js drops undefined properties from the
    // payload entirely, and the whole point is transmitting SQL NULL.
    const { data: inserted, error: insertError } = await admin
      .from("refunds")
      .insert({
        booking_id: bookingId,
        source: SOURCE,
        payment_id: null,
        amount: REFUND_AMOUNT,
        status: "owed",
        reason: "others",
      })
      .select("id")
      .single();

    if (insertError) {
      const code = (insertError as { code?: string }).code ?? "none";
      console.error(`  insert failed: code=${code}, message=${insertError.message}`);
      if (code === "23502") {
        console.error(
          "  KNOWN PRE-MIGRATION FAILURE: refunds.payment_id still carries the hand-applied NOT NULL constraint. Run again after the drop-not-null migration.",
        );
        record(
          "owed refunds row with payment_id NULL inserted",
          false,
          "23502 not-null violation: the pre-migration NOT NULL constraint is still present",
        );
      } else {
        console.error("  !! UNEXPECTED ERROR CODE: this is NOT the known pre-migration 23502 failure. Investigate before migrating.");
        record(
          "owed refunds row with payment_id NULL inserted",
          false,
          `unexpected error code=${code}, message=${insertError.message}`,
        );
      }
    } else {
      const refundRowId = (inserted as { id?: number } | null)?.id;
      record("owed refunds row with payment_id NULL inserted", true, `refund row id=${refundRowId}`);

      // Read the row back by id and assert what the database actually stored.
      const { data: row, error: readErr } = await admin
        .from("refunds")
        .select("id, payment_id, status")
        .eq("id", refundRowId)
        .single();
      if (readErr || !row) {
        record("inserted refunds row reads back", false, readErr?.message ?? "row not found");
      } else {
        record("inserted refunds row reads back", true, `id=${row.id}`);
        record(
          "stored payment_id IS NULL",
          row.payment_id === null,
          `payment_id=${row.payment_id === null ? "null" : JSON.stringify(row.payment_id)}`,
        );
        record("stored status is 'owed'", row.status === "owed", `status=${row.status}`);
      }
    }
  } catch (e) {
    record("threw", false, String(e));
  } finally {
    // FK-safe teardown: refunds (reference bookings) first, then booking, then
    // trip. The refunds row has payment_id NULL, so it is swept by booking_id
    // linkage; the booking and trip are swept by marker as in the sibling
    // harness.
    const leftoverErrs: string[] = [];
    if (bookingId != null) {
      const r = await admin.from("refunds").delete().eq("booking_id", bookingId);
      if (r.error) leftoverErrs.push(`refunds(booking ${bookingId}): ${r.error.message}`);
    }
    const b = await admin.from("bookings").delete().eq("notes", RUN_MARKER);
    if (b.error) leftoverErrs.push(`bookings(${RUN_MARKER}): ${b.error.message}`);
    const t = await admin.from("trips").delete().like("slug", `${RUN_MARKER}-%`);
    if (t.error) leftoverErrs.push(`trips(${RUN_MARKER}): ${t.error.message}`);
    if (leftoverErrs.length) {
      console.error("  !! CLEANUP FAILED - REMOVE BY HAND:");
      for (const l of leftoverErrs) console.error("     " + l);
    }
  }

  // Final zero-leftover assertion for this run's marker across all three tables.
  // Refunds are checked by booking_id linkage (payment_id is NULL by design);
  // if setup never produced a booking id, no refunds row can exist for this run.
  const [
    refundsLeft,
    { data: leftB, error: leftBErr },
    { data: leftT, error: leftTErr },
  ] = await Promise.all([
    bookingId != null
      ? admin.from("refunds").select("id").eq("booking_id", bookingId)
      : Promise.resolve({ data: [] as { id: number }[], error: null }),
    admin.from("bookings").select("id").eq("notes", RUN_MARKER),
    admin.from("trips").select("id").like("slug", `${RUN_MARKER}-%`),
  ]);
  const { data: leftR, error: leftRErr } = refundsLeft;
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
