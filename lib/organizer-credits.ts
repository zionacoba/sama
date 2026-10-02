import type { SupabaseClient } from "@supabase/supabase-js";

// Stage 5d: reversing an organizer credit when the underlying booking is
// cancelled or refunded (decision D5). A credit represents a balance that was
// paid online AFTER the downpayment had already been paid out, and is owed to
// the organizer. If that booking is later cancelled the joiner gets the balance
// back, so the organizer must not keep the credit.

// Stage 5e: policy-aware, payment-aware reversal of a booking's organizer credit.
// The base clawback deduction recovers only the DOWNPAYMENT
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
    .from("organizer_credits")
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
      .from("payouts")
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
        .from("payouts")
        .update({ needs_reconciliation: true })
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
      .from("organizer_credits")
      .update({ amount: action.retained })
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
    .from("organizer_credits")
    .update({ status: "void" })
    .eq("id", credit.id)
    .neq("status", "void")
    .select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>);
  if (voidError) return { action: { kind: "none" }, error: voidError.message };
  if (!voided || voided.length === 0) return { action: { kind: "none" } };

  if (action.kind === "void-and-offset") {
    const { error: offsetError } = await (admin
      .from("organizer_deductions")
      .insert({
        organizer_id: organizerId,
        booking_id: bookingId,
        amount: action.amount,
        reason: "Reversal of refunded balance after cancellation",
        status: "pending",
      }) as unknown as Promise<{ error: { message: string } | null }>);
    if (offsetError) return { action, error: offsetError.message };
  }

  return { action };
}

// The base clawback deduction when a joiner is refunded after the booking's payout
// was already remitted: only the DOWNPAYMENT share of the refund. The online
// balance is owned by the credit ledger (reverseBookingCredit above), so deducting
// the balance share here as well would charge the organizer for it twice. A null
// downpayment share falls back to the whole refund, as cancelBooking always has;
// both refund splitters return null only when the refund itself is null, which
// every caller excludes before it gets here. A result of 0 (the whole refund
// came from the balance) means no deduction row is written at all.
export function remittedRefundDeductionAmount(
  downpaymentRefund: number | null,
  refundAmount: number,
): number {
  return downpaymentRefund ?? refundAmount;
}
