// FAITHFUL live verification of create_payout_atomic's in-transaction adjustment
// stamps (migration 20260721000000).
//
// Verifies against REAL rows in the live database (service-role client, same as
// the app) that create_payout_atomic now stamps the organizer_deductions and
// organizer_credits rows INSIDE its own transaction, strictly, so a payout can
// never be created on top of stale adjustment state:
//
//   LEG 1 (rollback proof): if a passed deduction id is no longer 'pending'
//   when the RPC runs, the strict stamp's row count does not match the array
//   length, the function RAISEs 'adjustment_state_changed', and the ENTIRE
//   transaction rolls back. No payout row lands, the booking stays unpaid, and
//   the perfectly-valid credit that shared the call is left untouched (its stamp
//   was rolled back with everything else).
//
//   LEG 2 (happy path): with both adjustments back to 'pending', the same call
//   succeeds, returns a payout id, flips the booking to 'included', and stamps
//   BOTH adjustment rows 'applied' with applied_payout_id set to the new payout.
//
// This harness contacts NO PayMongo and sends NO email. It creates a throwaway
// auth user + approved organizer + trip + ONE booking (via the REAL production
// RPC book_slot_and_create_booking) + one pending deduction + one pending
// credit, all stamped with a per-run marker. Everything is removed in a finally
// block in FK-safe order even if an assertion throws, and a zero-leftover
// assertion runs at the end. Non-zero exit on any failure.
//
// Run:  npx tsx scripts/verify-payout-atomic-stamps.ts
//
// Committed alongside migration 20260721000000. Creates and removes its own throwaway rows.

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

import { createClient } from "@supabase/supabase-js";

const RUN_MARKER = `payout-atomic-verify-${Date.now()}`;
// Marker stamped into the adjustments' reason text so cleanup and the leftover
// check can sweep them precisely.
const REASON = `Payout atomic stamp verify (${RUN_MARKER})`;

const PRICE = 1000;
const DEDUCTION_AMOUNT = 100;
const CREDIT_AMOUNT = 50;
// Payout amounts. create_payout_atomic stores these on the payouts row; it does
// not re-derive them, so they only need to be internally sensible.
const TOTAL = PRICE;
const COMMISSION = 0;
const NET = TOTAL - COMMISSION - DEDUCTION_AMOUNT + CREDIT_AMOUNT; // 950

// Untyped client on purpose: throwaway-row plumbing across many tables, no
// generated-type friction. The seven-param create_payout_atomic is called the
// same way regardless.
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

// --- setup helpers ----------------------------------------------------------

// Throwaway auth user so the organizer FK to auth.users(id) is satisfied. The
// admin createUser API sends NO email (email_confirm short-circuits it).
async function createAuthUser(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `org-${RUN_MARKER}@example.invalid`,
    password: `Pw-${RUN_MARKER}-x9`,
    email_confirm: true,
  });
  if (error || !data?.user) throw new Error(`auth user create failed: ${error?.message}`);
  return data.user.id;
}

// Approved throwaway organizer owned by the throwaway user.
async function insertOrganizer(userId: string): Promise<string> {
  const { data, error } = await admin
    .from("organizers")
    .insert({
      user_id: userId,
      full_name: `Organizer (${RUN_MARKER})`,
      email: `org-${RUN_MARKER}@example.invalid`,
      phone: "09170000000",
      bio: `Throwaway organizer for ${RUN_MARKER}`,
      status: "approved",
      commission_rate: 0,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`organizer insert failed: ${error?.message}`);
  return data.id as string;
}

// Throwaway active trip with headroom, owned by the throwaway organizer.
async function insertTrip(organizerId: string): Promise<number> {
  const { data, error } = await admin
    .from("trips")
    .insert({
      title: `${RUN_MARKER}-trip`,
      slug: `${RUN_MARKER}-trip`,
      status: "active",
      organizer_id: organizerId,
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

// One booking via the REAL production RPC (bare book_slot does not exist live).
// Every required positional parameter is supplied; the two trailing custom-
// question params default to NULL. p_notes carries the RUN_MARKER so cleanup and
// read-back can find the row. The booking is flipped to the payout-eligible
// shape (confirmed / paid / unpaid) by direct marker-scoped UPDATE afterward.
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
    p_platform_commission: COMMISSION,
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
  const bookingId = data.id as number;

  const { error: flipErr } = await admin
    .from("bookings")
    .update({ status: "confirmed", payment_gateway_status: "paid", payout_status: "unpaid" })
    .eq("id", bookingId);
  if (flipErr) throw new Error(`booking flip failed: ${flipErr.message}`);
  return bookingId;
}

async function insertDeduction(organizerId: string, bookingId: number): Promise<string> {
  const { data, error } = await admin
    .from("organizer_deductions")
    .insert({
      organizer_id: organizerId,
      booking_id: bookingId,
      amount: DEDUCTION_AMOUNT,
      reason: REASON,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`deduction insert failed: ${error?.message}`);
  return data.id as string;
}

async function insertCredit(organizerId: string, bookingId: number): Promise<string> {
  const { data, error } = await admin
    .from("organizer_credits")
    .insert({
      organizer_id: organizerId,
      booking_id: bookingId,
      amount: CREDIT_AMOUNT,
      reason: REASON,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`credit insert failed: ${error?.message}`);
  return data.id as string;
}

// --- read helpers -----------------------------------------------------------

async function readBooking(id: number) {
  const { data } = await admin
    .from("bookings")
    .select("id, status, payout_status, payout_id")
    .eq("id", id)
    .maybeSingle();
  return data as { id: number; status: string; payout_status: string; payout_id: string | null } | null;
}

async function readAdjustment(table: "organizer_deductions" | "organizer_credits", id: string) {
  const { data } = await admin
    .from(table)
    .select("id, status, applied_payout_id")
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; status: string; applied_payout_id: string | null } | null;
}

async function countOrgPayouts(organizerId: string): Promise<number> {
  const { data } = await admin.from("payouts").select("id").eq("organizer_id", organizerId);
  return (data as Array<{ id: string }> | null)?.length ?? -1;
}

// The seven-param RPC through the service-role client. Resolves to the raw
// response so callers inspect .error rather than a rejected promise.
function callCreatePayout(
  organizerId: string,
  bookingId: number,
  deductionIds: string[],
  creditIds: string[],
) {
  return admin.rpc("create_payout_atomic", {
    p_organizer_id: organizerId,
    p_booking_ids: [bookingId],
    p_total_amount: TOTAL,
    p_platform_commission: COMMISSION,
    p_net_amount: NET,
    p_deduction_ids: deductionIds,
    p_credit_ids: creditIds,
  }) as unknown as Promise<{ data: string | null; error: { message: string } | null }>;
}

async function main() {
  console.log(`create_payout_atomic stamp verification - run marker ${RUN_MARKER}`);
  console.log(`No PayMongo, no email. Throwaway rows only.\n`);

  let userId: string | null = null;
  let organizerId: string | null = null;
  let tripId: number | null = null;
  let bookingId: number | null = null;

  try {
    // -- SETUP --------------------------------------------------------------
    userId = await createAuthUser();
    organizerId = await insertOrganizer(userId);
    tripId = await insertTrip(organizerId);
    bookingId = await createBooking(tripId);
    const deductionId = await insertDeduction(organizerId, bookingId);
    const creditId = await insertCredit(organizerId, bookingId);
    record(
      "setup: user + approved organizer + trip + booking + pending deduction + pending credit",
      true,
      `user=${userId} org=${organizerId} trip=${tripId} booking=${bookingId} ded=${deductionId} cred=${creditId}`,
    );

    // -- LEG 1: FAIL LEG (rollback proof) -----------------------------------
    // Flip the deduction to 'applied' behind the caller's back, then call the
    // RPC with the now-stale deduction id (plus the still-valid credit id).
    const { error: staleErr } = await admin
      .from("organizer_deductions")
      .update({ status: "applied" })
      .eq("id", deductionId);
    if (staleErr) throw new Error(`could not stale the deduction: ${staleErr.message}`);

    const leg1 = await callCreatePayout(organizerId, bookingId, [deductionId], [creditId]);

    record(
      "LEG1 (a): RPC errors with 'adjustment_state_changed'",
      !!leg1.error && (leg1.error.message ?? "").includes("adjustment_state_changed"),
      `error=${leg1.error?.message ?? "none"} data=${leg1.data ?? "null"}`,
    );

    const leg1Payouts = await countOrgPayouts(organizerId);
    record(
      "LEG1 (b): NO payouts row exists for the organizer (full rollback)",
      leg1Payouts === 0,
      `count=${leg1Payouts}`,
    );

    const leg1Booking = await readBooking(bookingId);
    record(
      "LEG1 (c): booking still payout_status 'unpaid' with null payout_id",
      leg1Booking?.payout_status === "unpaid" && leg1Booking?.payout_id === null,
      `payout_status=${leg1Booking?.payout_status} payout_id=${leg1Booking?.payout_id ?? "null"}`,
    );

    const leg1Credit = await readAdjustment("organizer_credits", creditId);
    record(
      "LEG1 (d): valid credit rolled back - still 'pending' with null applied_payout_id",
      leg1Credit?.status === "pending" && leg1Credit?.applied_payout_id === null,
      `status=${leg1Credit?.status} applied_payout_id=${leg1Credit?.applied_payout_id ?? "null"}`,
    );

    // Restore the deduction to 'pending' for the pass leg.
    const { error: restoreErr } = await admin
      .from("organizer_deductions")
      .update({ status: "pending" })
      .eq("id", deductionId);
    if (restoreErr) throw new Error(`could not restore the deduction: ${restoreErr.message}`);

    // -- LEG 2: PASS LEG ----------------------------------------------------
    const leg2 = await callCreatePayout(organizerId, bookingId, [deductionId], [creditId]);
    const newPayoutId = leg2.data;

    record(
      "LEG2 (a): RPC returns a payout id with no error",
      !leg2.error && !!newPayoutId,
      `error=${leg2.error?.message ?? "none"} payoutId=${newPayoutId ?? "null"}`,
    );

    const leg2Payout = newPayoutId
      ? ((await admin.from("payouts").select("id, status").eq("id", newPayoutId).maybeSingle()).data as
          | { id: string; status: string }
          | null)
      : null;
    record(
      "LEG2 (b): payouts row exists with status 'pending'",
      leg2Payout?.id === newPayoutId && leg2Payout?.status === "pending",
      `id=${leg2Payout?.id ?? "null"} status=${leg2Payout?.status ?? "null"}`,
    );

    const leg2Booking = await readBooking(bookingId);
    record(
      "LEG2 (c): booking now payout_status 'included' with payout_id = new payout",
      leg2Booking?.payout_status === "included" && leg2Booking?.payout_id === newPayoutId,
      `payout_status=${leg2Booking?.payout_status} payout_id=${leg2Booking?.payout_id ?? "null"}`,
    );

    const leg2Ded = await readAdjustment("organizer_deductions", deductionId);
    const leg2Cred = await readAdjustment("organizer_credits", creditId);
    record(
      "LEG2 (d): BOTH adjustments 'applied' with applied_payout_id = new payout",
      leg2Ded?.status === "applied" &&
        leg2Ded?.applied_payout_id === newPayoutId &&
        leg2Cred?.status === "applied" &&
        leg2Cred?.applied_payout_id === newPayoutId,
      `deduction[status=${leg2Ded?.status} applied=${leg2Ded?.applied_payout_id ?? "null"}] ` +
        `credit[status=${leg2Cred?.status} applied=${leg2Cred?.applied_payout_id ?? "null"}]`,
    );
  } catch (e) {
    record("threw", false, String(e));
  } finally {
    // FK-safe teardown. organizer_deductions and organizer_credits reference
    // both payouts (applied_payout_id) and bookings, so they go first. The
    // booking's payout_id references payouts with no ON DELETE, so it is nulled
    // before the payout is deleted. Then payouts, then participants + booking,
    // then trip, then organizer, then the auth user. Loud on any failure.
    const leftoverErrs: string[] = [];
    if (organizerId != null) {
      const d = await admin.from("organizer_deductions").delete().eq("organizer_id", organizerId);
      if (d.error) leftoverErrs.push(`deductions(org ${organizerId}): ${d.error.message}`);
      const c = await admin.from("organizer_credits").delete().eq("organizer_id", organizerId);
      if (c.error) leftoverErrs.push(`credits(org ${organizerId}): ${c.error.message}`);
    }
    if (bookingId != null) {
      const nb = await admin.from("bookings").update({ payout_id: null }).eq("id", bookingId);
      if (nb.error) leftoverErrs.push(`booking payout_id null(${bookingId}): ${nb.error.message}`);
    }
    if (organizerId != null) {
      const p = await admin.from("payouts").delete().eq("organizer_id", organizerId);
      if (p.error) leftoverErrs.push(`payouts(org ${organizerId}): ${p.error.message}`);
    }
    if (bookingId != null) {
      const bp = await admin.from("booking_participants").delete().eq("booking_id", bookingId);
      if (bp.error) leftoverErrs.push(`participants(booking ${bookingId}): ${bp.error.message}`);
      const b = await admin.from("bookings").delete().eq("id", bookingId);
      if (b.error) leftoverErrs.push(`booking(${bookingId}): ${b.error.message}`);
    }
    if (tripId != null) {
      const t = await admin.from("trips").delete().eq("id", tripId);
      if (t.error) leftoverErrs.push(`trip(${tripId}): ${t.error.message}`);
    }
    if (organizerId != null) {
      const o = await admin.from("organizers").delete().eq("id", organizerId);
      if (o.error) leftoverErrs.push(`organizer(${organizerId}): ${o.error.message}`);
    }
    if (userId != null) {
      const { error: uErr } = await admin.auth.admin.deleteUser(userId);
      if (uErr) leftoverErrs.push(`auth user(${userId}): ${uErr.message}`);
    }
    if (leftoverErrs.length) {
      console.error("  !! CLEANUP FAILED - REMOVE BY HAND:");
      for (const l of leftoverErrs) console.error("     " + l);
    }
  }

  // Final zero-leftover assertion for this run across every table it touched.
  const [
    { data: leftDed },
    { data: leftCred },
    { data: leftBook },
    { data: leftTrip },
    { data: leftOrg },
    { data: leftPay },
  ] = await Promise.all([
    admin.from("organizer_deductions").select("id").eq("reason", REASON),
    admin.from("organizer_credits").select("id").eq("reason", REASON),
    admin.from("bookings").select("id").eq("notes", RUN_MARKER),
    admin.from("trips").select("id").like("slug", `${RUN_MARKER}-%`),
    organizerId != null
      ? admin.from("organizers").select("id").eq("id", organizerId)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
    organizerId != null
      ? admin.from("payouts").select("id").eq("organizer_id", organizerId)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ]);

  let userLeftover = 0;
  if (userId != null) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    userLeftover = u?.user ? 1 : 0;
  }

  const leftoverCount =
    ((leftDed as unknown[] | null)?.length ?? 0) +
    ((leftCred as unknown[] | null)?.length ?? 0) +
    ((leftBook as unknown[] | null)?.length ?? 0) +
    ((leftTrip as unknown[] | null)?.length ?? 0) +
    ((leftOrg as unknown[] | null)?.length ?? 0) +
    ((leftPay as unknown[] | null)?.length ?? 0) +
    userLeftover;

  record(
    "zero leftover rows from this run",
    leftoverCount === 0,
    `deductions=${(leftDed as unknown[] | null)?.length ?? 0} credits=${(leftCred as unknown[] | null)?.length ?? 0} ` +
      `bookings=${(leftBook as unknown[] | null)?.length ?? 0} trips=${(leftTrip as unknown[] | null)?.length ?? 0} ` +
      `organizers=${(leftOrg as unknown[] | null)?.length ?? 0} payouts=${(leftPay as unknown[] | null)?.length ?? 0} ` +
      `authUser=${userLeftover}`,
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
