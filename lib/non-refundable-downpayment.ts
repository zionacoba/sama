import type { SupabaseClient } from "@supabase/supabase-js";
import { computeRefundSplit } from "@/lib/booking-finance";

// The non-refundable downpayment cancellation policy (ruled by Zion, v115).
//
// When a joiner cancels, the organizer keeps the downpayment at any time, and
// everything the joiner paid through Sama above it is refunded. Offered only on
// trips that take a downpayment. If the organizer cancels, every policy refunds
// in full (cancelTrip never reads the policy).
//
// Organizer terms section 8 promises that a refund made before the organizer is
// paid leaves them "the reduced amount". A cancelled booking never enters a
// payout, so the kept downpayment reaches the organizer as a pending
// organizer_credits row, which the next payout run adds to their net. The credit
// is the kept downpayment minus Sama's commission for the cancelled slots: the
// same figure the organizer would have received had the joiner travelled.

export const NON_REFUNDABLE_DOWNPAYMENT = "non_refundable_downpayment";

export const KEPT_DOWNPAYMENT_CREDIT_REASON = "Non-refundable downpayment kept after the joiner cancelled";

const round2 = (n: number) => Math.round(n * 100) / 100;

// The downpayment the organizer keeps for the WHOLE booking, before any
// slot scaling. Returns null when it cannot be worked out, which the refund
// calculator turns into manual review rather than a guessed refund.
//
// - Downpayment payers: their amount_due, which createBooking set to the trip's
//   minimum downpayment times slots, fixed at booking time.
// - Full payers: nothing on the booking records the downpayment, so it is the
//   trip's current min_downpayment times slots, capped at the total, mirroring
//   createBooking. Trips on this policy cannot change min_downpayment once booked.
export function keptDownpaymentAmount(input: {
  paymentOption: string | null | undefined;
  amountDue: number | string | null | undefined;
  totalAmount: number | string | null | undefined;
  slots: number | null | undefined;
  tripMinDownpayment: number | string | null | undefined;
}): number | null {
  if (input.paymentOption === "downpayment") {
    if (input.amountDue == null) return null;
    const due = Number(input.amountDue);
    return Number.isFinite(due) && due >= 0 ? round2(due) : null;
  }
  if (input.paymentOption === "full") {
    if (input.tripMinDownpayment == null || input.totalAmount == null) return null;
    const perSlot = Number(input.tripMinDownpayment);
    const total = Number(input.totalAmount);
    const slots = Number(input.slots);
    if (!Number.isFinite(perSlot) || perSlot <= 0) return null;
    if (!Number.isFinite(total) || total < 0) return null;
    if (!Number.isInteger(slots) || slots <= 0) return null;
    return round2(Math.min(perSlot * slots, total));
  }
  return null;
}

type RefundSplitBooking = Parameters<typeof computeRefundSplit>[0];

// Which leg a refund goes back to. Every existing policy keeps computeRefundSplit
// (proportional across both legs). This policy refunds the online balance FIRST,
// so the downpayment payment is only touched if the refund exceeds the balance.
// The balance leg's conditions mirror computeRefundSplit: paid online, with its
// payment id stored.
export function splitRefundForPolicy(
  policy: string,
  booking: RefundSplitBooking,
  refundAmount: number | null,
): { downpaymentRefund: number | null; balanceRefund: number } {
  if (policy !== NON_REFUNDABLE_DOWNPAYMENT) return computeRefundSplit(booking, refundAmount);
  if (refundAmount === null) return { downpaymentRefund: null, balanceRefund: 0 };
  const balanceAmount = Number(booking.total_amount ?? 0) - Number(booking.amount_due ?? 0);
  const balanceRefundable =
    booking.balance_payment_gateway_status === "paid" && booking.balance_paymongo_payment_id && balanceAmount > 0
      ? balanceAmount
      : 0;
  const balanceRefund = round2(Math.max(0, Math.min(refundAmount, balanceRefundable)));
  return { downpaymentRefund: round2(refundAmount - balanceRefund), balanceRefund };
}

// The share of a whole-booking amount that belongs to the cancelled slots in a
// partial cancel. Computed as the whole minus the remaining slots' share, rounded
// exactly as partialCancelBooking rounds the new amount_due and commission, so
// the cancelled share and the remaining share always add back to the whole.
export function cancelledSlotsShare(whole: number, remainingSlots: number, originalSlots: number): number {
  if (!(originalSlots > 0)) return 0;
  return round2(whole - round2(whole * (remainingSlots / originalSlots)));
}

// The organizer's credit for the cancelled slots: the kept downpayment minus
// Sama's commission on those slots, never below zero. Null when either figure is
// unusable, so the caller alerts a human instead of writing a wrong amount.
export function keptDownpaymentCredit(
  keptForSlots: number | null,
  commissionForSlots: number | string | null | undefined,
): number | null {
  if (keptForSlots == null || !Number.isFinite(keptForSlots)) return null;
  if (commissionForSlots == null) return null;
  const commission = Number(commissionForSlots);
  if (!Number.isFinite(commission) || commission < 0) return null;
  return round2(Math.max(0, keptForSlots - commission));
}

// Whether a cancellation takes the kept-downpayment credit path instead of the
// existing credit void/reversal. True only under this policy, when the downpayment
// was actually collected, and while the booking has not entered a payout.
//
// Why skipping the existing void/reversal is safe here: a balance credit is only
// ever created once a booking's payout_status is 'included' or 'remitted'
// (confirmPaidBalance), and payout_status never moves back to 'unpaid'. So while it
// is 'unpaid', any live credit on the booking can only be this policy's kept
// credit, and the balance-credit void/reversal would wrongly void or shrink it.
export function usesKeptDownpaymentCredit(input: {
  policy: string;
  paymentGatewayStatus: string | null | undefined;
  payoutStatus: string | null | undefined;
}): boolean {
  return (
    input.policy === NON_REFUNDABLE_DOWNPAYMENT &&
    input.paymentGatewayStatus === "paid" &&
    (input.payoutStatus ?? "unpaid") === "unpaid"
  );
}

// Records the organizer's kept-downpayment credit: inserts a pending credit, or
// tops up this booking's existing pending credit (a partial cancel followed by
// another cancel). The partial unique index allows one non-void credit per
// booking, so a second insert fails loudly rather than paying twice. An applied
// credit is never modified here; that case returns an error for a human.
// `admin` MUST be the service-role client (organizer_credits is RLS deny-all).
export async function recordKeptDownpaymentCredit(
  admin: SupabaseClient,
  input: { bookingId: number; organizerId: string; amount: number },
): Promise<{ action: "none" | "inserted" | "topped-up"; error?: string }> {
  if (!(input.amount > 0)) return { action: "none" };

  const { data: existing, error: fetchError } = await (admin
    .from("organizer_credits")
    .select("id, amount, status")
    .eq("booking_id", input.bookingId)
    .neq("status", "void")
    .maybeSingle() as unknown as Promise<{
      data: { id: string; amount: number | string; status: string } | null;
      error: { message: string } | null;
    }>);
  if (fetchError) return { action: "none", error: fetchError.message };

  if (!existing) {
    const { error: insertError } = await (admin
      .from("organizer_credits")
      .insert({
        organizer_id: input.organizerId,
        booking_id: input.bookingId,
        amount: round2(input.amount),
        reason: KEPT_DOWNPAYMENT_CREDIT_REASON,
        status: "pending",
      }) as unknown as Promise<{ error: { message: string } | null }>);
    if (insertError) return { action: "none", error: insertError.message };
    return { action: "inserted" };
  }

  if (existing.status !== "pending") {
    return { action: "none", error: `booking already has a ${existing.status} credit; record the kept downpayment by hand` };
  }

  const { data: updated, error: updateError } = await (admin
    .from("organizer_credits")
    .update({ amount: round2(Number(existing.amount) + input.amount) })
    .eq("id", existing.id)
    .eq("status", "pending")
    .select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: { message: string } | null }>);
  if (updateError) return { action: "none", error: updateError.message };
  if (!updated || updated.length === 0) {
    return { action: "none", error: "the pending credit changed state before it could be topped up" };
  }
  return { action: "topped-up" };
}
