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
