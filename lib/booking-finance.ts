// Centralizes the "how much money actually moved through Sama" logic for a
// booking. The key distinction is between `balance_collected` (which is true
// for BOTH online balance payments AND cash collected directly by the
// organizer) and `balance_payment_gateway_status === "paid"` (which is true
// ONLY when the balance was actually paid online through Sama).
//
// Payout and refund math must key off the gateway status, never
// `balance_collected` — otherwise Sama remits or refunds money it never held
// for downpayment bookings whose balance was collected in cash.

import { ATTENDED_STATUSES } from "./booking-status";

type SamaHoldsFields = {
  payment_option: string | null;
  amount_due: number | string | null;
  total_amount: number | string | null;
  balance_payment_gateway_status: string | null;
};

type PayoutEligibilityFields = {
  status: string;
  payment_gateway_status: string | null;
  total_amount: number | string | null;
};

// Whether a booking is eligible to be paid out to its organizer, i.e. whether
// the organizer is treated as having earned it. This is the exact predicate the
// admin payout pipeline applies: the booking must be in an ATTENDED status
// (confirmed or no_show) AND payment must have actually been received online
// (payment_gateway_status === "paid") OR the trip is free (total_amount === 0,
// which is confirmed without a gateway status).
//
// Deliberately NOT included here: the "trip has already taken place" date guard
// and the payout_status (unpaid vs already paid out) handling. Those vary by
// call site and stay inline so the shared predicate means exactly one thing.
export function isPayoutEligible(booking: PayoutEligibilityFields): boolean {
  const attended = (ATTENDED_STATUSES as readonly string[]).includes(booking.status);
  const paymentReceived =
    booking.payment_gateway_status === "paid" || Number(booking.total_amount) === 0;
  return attended && paymentReceived;
}

// Returns the gross amount Sama actually received online for this booking —
// the amount Sama is holding and must remit from, before commission.
//
// For downpayment bookings where the balance was NOT paid online (i.e. it was
// collected in cash by the organizer, or not yet collected), Sama only holds
// the downpayment (amount_due). For full-payment bookings, or downpayment
// bookings where the balance WAS paid online, Sama holds the full total_amount.
export function amountSamaHolds(booking: SamaHoldsFields): number {
  const balancePaidOnline = booking.balance_payment_gateway_status === "paid";
  const isDownpaymentOnly = booking.payment_option === "downpayment" && !balancePaidOnline;
  return isDownpaymentOnly ? Number(booking.amount_due ?? 0) : Number(booking.total_amount ?? 0);
}

// Returns the gross amount the joiner actually paid online through Sama. This
// is the basis for refund estimates shown to the joiner, and matches what
// cancelBooking actually processes as a refund.
//
// It happens to return the same value as amountSamaHolds for these bookings,
// but is kept separate because it answers a different question (what the joiner
// paid vs. what Sama is holding to remit).
export function amountJoinerPaid(booking: SamaHoldsFields): number {
  const balancePaidOnline = booking.balance_payment_gateway_status === "paid";
  const isDownpaymentOnly = booking.payment_option === "downpayment" && !balancePaidOnline;
  return isDownpaymentOnly ? Number(booking.amount_due ?? 0) : Number(booking.total_amount ?? 0);
}

type RefundSplitFields = SamaHoldsFields & {
  balance_paymongo_payment_id: string | null;
};

// Splits a final refund amount across the two payment sources Sama can refund
// against: the downpayment (paymongo_payment_id) and the online balance
// (balance_paymongo_payment_id). The split is proportional to how much of what
// the joiner paid online came from each source.
//
// `refundAmount` is the already-final total refund for this action. Callers that
// refund only part of a booking (e.g. a partial cancellation) must scale it
// before passing it in; this helper does not know about slots or policy.
//
// The balance portion is only ever refunded when the balance was actually paid
// online (gateway status "paid") and a balance payment id exists, so cash-
// collected balances are never refunded by Sama. The `amountPaid > 0` guard
// avoids a divide-by-zero when there is nothing to split.
export function computeRefundSplit(
  booking: RefundSplitFields,
  refundAmount: number | null,
): { downpaymentRefund: number | null; balanceRefund: number } {
  const amountPaid = amountJoinerPaid(booking);
  const balanceAmount = Number(booking.total_amount ?? 0) - Number(booking.amount_due ?? 0);
  const balancePaidOnline = booking.balance_payment_gateway_status === "paid";
  const balanceRefund =
    balancePaidOnline && booking.balance_paymongo_payment_id && balanceAmount > 0 && amountPaid > 0 && refundAmount !== null
      ? Math.round(refundAmount * (balanceAmount / amountPaid) * 100) / 100
      : 0;
  const downpaymentRefund =
    refundAmount !== null ? Math.round((refundAmount - balanceRefund) * 100) / 100 : null;
  return { downpaymentRefund, balanceRefund };
}
