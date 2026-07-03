import type { SupabaseClient } from "@supabase/supabase-js";

// Stage 5d: reversing an organizer credit when the underlying booking is
// cancelled or refunded (decision D5). A credit represents a balance that was
// paid online AFTER the downpayment had already been paid out, and is owed to
// the organizer. If that booking is later cancelled the joiner gets the balance
// back, so the organizer must not keep the credit.

export type CreditVoidAction = "none" | "voided" | "voided-and-offset";

// Pure decision for what voiding a booking's active organizer credit requires,
// given the credit's current status and the booking's payout_status. Kept
// separate from the DB work so the void-vs-void+offset choice is unit-testable.
//
// - No active credit -> "none".
// - 'pending' credit (never netted into a payout) -> "voided": just void it, the
//   organizer was never paid it.
// - 'applied' credit (already netted into a payout the organizer was paid):
//     - booking payout_status === 'remitted': the existing cancel/refund
//       deduction already claws back the FULL joiner refund, which includes this
//       balance, so we void WITHOUT an offset to avoid clawing the balance twice.
//     - otherwise (e.g. 'included'/'unpaid', where no remitted-deduction fired):
//       nothing else recovers the balance, so "voided-and-offset": void it AND
//       insert an offsetting deduction to claw the credit back.
export function decideCreditVoid(
  creditStatus: "pending" | "applied" | null | undefined,
  bookingPayoutStatus: string | null | undefined,
): CreditVoidAction {
  if (creditStatus === "applied") {
    return bookingPayoutStatus === "remitted" ? "voided" : "voided-and-offset";
  }
  if (creditStatus === "pending") return "voided";
  return "none";
}

// Voids the active organizer_credits row for a cancelled/refunded booking, and
// when required inserts an offsetting organizer_deductions row so an already-paid
// credit is clawed back. The whole credit is voided; there is no proportional or
// partial shrinking (a partial cancel still voids the full credit). `admin` MUST
// be the service-role client (both tables are RLS deny-by-default).
//
// Returns what it did for logging. On a DB error it returns the action reached so
// far plus `error`, so the caller can alert without the failure being swallowed.
export async function voidBookingCredit(
  admin: SupabaseClient,
  bookingId: number,
  organizerId: string,
  bookingPayoutStatus: string | null | undefined,
): Promise<{ action: CreditVoidAction; error?: string }> {
  // At most one active credit per booking (Stage 5a partial unique index on
  // booking_id WHERE status <> 'void'), so maybeSingle is safe.
  const { data: credit, error: fetchError } = await (admin
    .from("organizer_credits" as "trips")
    .select("id, amount, status")
    .eq("booking_id", bookingId)
    .neq("status", "void")
    .maybeSingle() as unknown as Promise<{
      data: { id: string; amount: number; status: "pending" | "applied" } | null;
      error: { message: string } | null;
    }>);

  if (fetchError) return { action: "none", error: fetchError.message };
  if (!credit) return { action: "none" };

  const action = decideCreditVoid(credit.status, bookingPayoutStatus);
  if (action === "none") return { action: "none" };

  // Void the credit. The .neq("status","void") guard plus .select("id") means
  // only the call that actually transitions the row proceeds to the offset, so a
  // concurrent void can never produce a duplicate offsetting deduction.
  const { data: voided, error: voidError } = await (admin
    .from("organizer_credits" as "trips")
    .update({ status: "void" } as never)
    .eq("id", credit.id)
    .neq("status", "void")
    .select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>);

  if (voidError) return { action: "none", error: voidError.message };
  // Another concurrent path already voided it; do nothing (and do not offset).
  if (!voided || voided.length === 0) return { action: "none" };

  if (action === "voided-and-offset") {
    const { error: offsetError } = await (admin
      .from("organizer_deductions" as "trips")
      .insert({
        organizer_id: organizerId,
        booking_id: bookingId,
        amount: credit.amount,
        reason: "Reversal of balance credit after cancellation",
        status: "pending",
      } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (offsetError) return { action: "voided", error: offsetError.message };
  }

  return { action };
}

// Stage 5e: policy-aware, payment-aware reversal of a booking's organizer credit.
// Siblings of decideCreditVoid/voidBookingCredit above (which partialCancelBooking
// still uses). The base clawback deduction now recovers only the DOWNPAYMENT
// portion; the online BALANCE is owned entirely by this credit ledger, so the
// amount refunded to the joiner from the balance (balanceRefundedToJoiner, = p x B
// already rounded at the call site) drives whether we void, shrink, offset, or
// merely document the credit.
export type CreditReversalAction =
  | { kind: "none" }
  | { kind: "void" }
  | { kind: "shrink"; retained: number }
  | { kind: "void-and-offset"; amount: number }
  | { kind: "document" };

// Pure decision, kept separate from the DB work so every matrix cell is unit-testable.
//
// - pending credit (never netted into a payout): the credit is a claim we have not
//   paid, so we simply reduce it by whatever balance was refunded. Retained 0 -> void;
//   otherwise shrink to the retained amount.
// - applied credit (already netted into a payout):
//     - payout NOT remitted: the organizer has not been paid yet, so nothing needs to
//       move now; flag the payout for review -> "document".
//     - payout remitted: the organizer was paid this balance, so void the credit and
//       claw back the refunded balance via an offsetting deduction (offset 0 -> void).
// - null/undefined status (no active credit): "none".
export function decideCreditReversal(
  creditStatus: "pending" | "applied" | null | undefined,
  creditAmount: number,
  balanceRefundedToJoiner: number,   // p x B, already rounded, from the call site
  creditPayoutRemitted: boolean,     // status(payout at applied_payout_id) === 'remitted'
): CreditReversalAction {
  if (creditStatus === "pending") {
    const retained = Math.max(0, Math.round((creditAmount - balanceRefundedToJoiner) * 100) / 100);
    return retained === 0 ? { kind: "void" } : { kind: "shrink", retained };
  }
  if (creditStatus === "applied") {
    if (!creditPayoutRemitted) return { kind: "document" };
    const offset = Math.round(balanceRefundedToJoiner * 100) / 100;
    return offset > 0 ? { kind: "void-and-offset", amount: offset } : { kind: "void" };
  }
  return { kind: "none" };
}

// Applies the decideCreditReversal decision to the DB. `admin` MUST be the
// service-role client (both tables are RLS deny-by-default). Every write keeps the
// .neq("status","void") guard so a concurrent apply/void can never double-act.
// Returns what it did (plus `error` on a DB failure) so the caller can alert.
export async function reverseBookingCredit(
  admin: SupabaseClient,
  bookingId: number,
  organizerId: string,
  balanceRefundedToJoiner: number,
): Promise<{ action: CreditReversalAction; error?: string }> {
  // At most one active credit per booking (Stage 5a partial unique index), so
  // maybeSingle is safe.
  const { data: credit, error: fetchError } = await (admin
    .from("organizer_credits" as "trips")
    .select("id, amount, status, applied_payout_id")
    .eq("booking_id", bookingId)
    .neq("status", "void")
    .maybeSingle() as unknown as Promise<{
      data: { id: string; amount: number; status: "pending" | "applied"; applied_payout_id: string | null } | null;
      error: { message: string } | null;
    }>);

  if (fetchError) return { action: { kind: "none" }, error: fetchError.message };
  if (!credit) return { action: { kind: "none" } };

  // Whether the payout this credit was netted into has actually been remitted.
  // Only meaningful for an applied credit with an applied_payout_id; read from the
  // payout row directly, never from booking.payout_status.
  let creditPayoutRemitted = false;
  if (credit.status === "applied" && credit.applied_payout_id) {
    const { data: payout, error: payoutError } = await (admin
      .from("payouts" as "trips")
      .select("status")
      .eq("id", credit.applied_payout_id)
      .maybeSingle() as unknown as Promise<{
        data: { status: string } | null;
        error: { message: string } | null;
      }>);
    if (payoutError) return { action: { kind: "none" }, error: payoutError.message };
    creditPayoutRemitted = payout?.status === "remitted";
  }

  const action = decideCreditReversal(credit.status, credit.amount, balanceRefundedToJoiner, creditPayoutRemitted);

  if (action.kind === "none") return { action };

  // Applied into an undisbursed payout: flag the payout for review, touch neither
  // cash nor the credit. The caller emits an admin alert.
  if (action.kind === "document") {
    if (credit.applied_payout_id) {
      const { error: flagError } = await (admin
        .from("payouts" as "trips")
        .update({ needs_reconciliation: true } as never)
        .eq("id", credit.applied_payout_id) as unknown as Promise<{ error: { message: string } | null }>);
      if (flagError) return { action, error: flagError.message };
    }
    return { action };
  }

  // Shrink a pending credit to the retained amount. The status='pending' guard plus
  // .neq("status","void") means a credit that raced to 'applied' or 'void' is not
  // touched; zero rows changed -> we lost the race, report "none".
  if (action.kind === "shrink") {
    const { data: shrunk, error: shrinkError } = await (admin
      .from("organizer_credits" as "trips")
      .update({ amount: action.retained } as never)
      .eq("id", credit.id)
      .eq("status", "pending")
      .neq("status", "void")
      .select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>);
    if (shrinkError) return { action: { kind: "none" }, error: shrinkError.message };
    if (!shrunk || shrunk.length === 0) return { action: { kind: "none" } };
    return { action };
  }

  // 'void' or 'void-and-offset': void the credit first. Only the call that actually
  // transitions the row (via .neq guard + .select) proceeds to insert the offset, so
  // a concurrent void can never produce a duplicate offsetting deduction.
  const { data: voided, error: voidError } = await (admin
    .from("organizer_credits" as "trips")
    .update({ status: "void" } as never)
    .eq("id", credit.id)
    .neq("status", "void")
    .select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>);
  if (voidError) return { action: { kind: "none" }, error: voidError.message };
  if (!voided || voided.length === 0) return { action: { kind: "none" } };

  if (action.kind === "void-and-offset") {
    const { error: offsetError } = await (admin
      .from("organizer_deductions" as "trips")
      .insert({
        organizer_id: organizerId,
        booking_id: bookingId,
        amount: action.amount,
        reason: "Reversal of refunded balance after cancellation",
        status: "pending",
      } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (offsetError) return { action, error: offsetError.message };
  }

  return { action };
}
