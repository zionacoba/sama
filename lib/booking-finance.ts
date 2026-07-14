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

// Today's date in Manila, as "YYYY-MM-DD". This is the date basis for every
// payout/booking/cancellation eligibility gate — using UTC instead would drift
// from Manila's true today by up to 8 hours near the day boundary.
export function todayManilaDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

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

// "YYYY-MM-DD" for an ISO instant, expressed in Manila. Same formatter as
// todayManilaDate so a booking's created_at and "today" are compared on one
// timezone basis.
export function manilaDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(iso));
}

// Adds n calendar days to a "YYYY-MM-DD" string, returning "YYYY-MM-DD". The
// input is parsed as UTC midnight ("...T00:00:00Z") and formatted back in UTC on
// purpose: a plain new Date("YYYY-MM-DD") is already UTC midnight, but doing the
// arithmetic and formatting in UTC guarantees the +2 / -7 day shift is pure
// calendar-day math that no local timezone or DST transition can nudge across a
// day boundary. n may be negative.
//
// Callers also pass full ISO timestamptz strings: trips.date_start is a
// timestamptz, so the payout call sites receive "2026-12-01T00:00:00+00:00"
// from PostgREST, not a bare date. Without the slice, the template below would
// produce "...+00:00T00:00:00Z" (an invalid date) and Intl.format would throw
// RangeError. The first 10 chars are the organizer-picked calendar date
// (date_start is always stored at UTC midnight from a bare-date insert), which
// is the same calendar date the gate's lexical date_start comparisons use.
export function addCalendarDays(ymd: string, n: number): string {
  const day = ymd.slice(0, 10);
  const base = new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(base));
}

type PayoutTimingFields = {
  payment_option: string | null;
  balance_payment_gateway_status: string | null;
  created_at: string;
  trip: { date_start: string } | null;
};

export type PayoutTiming =
  | { payable: true; reason: "pre-trip-cleared" }
  | { payable: true; reason: "post-trip-balance" }
  | { payable: true; reason: "post-trip-late" }
  | { payable: false; reason: "not-cleared" | "trip-not-past" | "no-trip" };

// Decides WHETHER a booking is payable now and WHY, implementing the three
// payout-timing lanes. This replaces the old inline "trip.date_start < today"
// gate at every payout call site. It is deliberately orthogonal to
// isPayoutEligible: this answers "is it the right time to pay", isPayoutEligible
// answers "was it earned at all" (attended + payment received). Both must pass.
//
// All dates are "YYYY-MM-DD" Manila strings compared lexically (which matches
// chronological order for that format). Lanes are mutually exclusive and checked
// C, then B, then A:
//   Lane C: the balance was paid online (balance_payment_gateway_status ===
//     "paid"). The whole booking waits post-trip, since amountSamaHolds returns
//     the combined total on one row and a booking row is never split across two
//     payouts. Payable only once the trip is past.
//   Lane B: a late booking, created less than 7 days before the trip. Falls back
//     to the original post-trip gate. Payable only once the trip is past.
//   Lane A: everything else. Pre-trip eligible once the payment has "cleared",
//     defined as created_at Manila date + 2 calendar days <= today Manila, even
//     if the trip has not happened yet.
export function payoutTimingGate(b: PayoutTimingFields, todayManila: string): PayoutTiming {
  if (!b.trip?.date_start) return { payable: false, reason: "no-trip" };

  const tripPast = b.trip.date_start < todayManila;
  const balancePaidOnline = b.balance_payment_gateway_status === "paid";

  // Lane C: online balance payment always waits post-trip (whole booking).
  if (balancePaidOnline) {
    return tripPast
      ? { payable: true, reason: "post-trip-balance" }
      : { payable: false, reason: "trip-not-past" };
  }

  // Lane B: late booking (created less than 7 days before the trip). A booking
  // created exactly on the cutoff (trip minus 7 days) is NOT late; only one
  // created strictly after it (fewer than 7 days out) is.
  const createdManila = manilaDateOf(b.created_at);
  const cutoff = addCalendarDays(b.trip.date_start, -7);
  const isLate = createdManila > cutoff;
  if (isLate) {
    return tripPast
      ? { payable: true, reason: "post-trip-late" }
      : { payable: false, reason: "trip-not-past" };
  }

  // Lane A: pre-trip. Payable once the payment has cleared, regardless of whether
  // the trip has taken place.
  const cleared = addCalendarDays(createdManila, 2) <= todayManila;
  return cleared
    ? { payable: true, reason: "pre-trip-cleared" }
    : { payable: false, reason: "not-cleared" };
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

export type PendingDeduction = { id: string; amount: number | string };
export type PendingCredit = { id: string; amount: number | string };

// Applies pending organizer credits and deductions to a payout's net amount.
// Credits and deductions net as ONE running balance (decision D4): credits ADD
// first (they always apply, since they only increase what the organizer is
// owed), then deductions apply greedily and oldest-first against the
// credit-inflated base. A deduction is applied only if it fully fits in what
// remains, otherwise it is skipped and left pending for the next payout.
//
// This is the source of truth for what create_payout_atomic actually writes, so
// the admin payout list's displayed net must call this same function rather than
// a separate floored subtraction, or the shown number can disagree with the
// money actually remitted (e.g. two 80 deductions against a net of 100 would
// floor-display as 0 but this function actually applies only one, leaving 20).
//
// pendingCredits defaults to [] so existing callers that pass no credits behave
// identically to before. appliedCreditIds is every credit id (credits always
// apply); the greedy skip logic is deductions-only.
export function computeAppliedNet(
  bookingsNet: number,
  pendingDeductions: PendingDeduction[],
  pendingCredits: PendingCredit[] = [],
): { net: number; appliedDeductionIds: string[]; skippedDeductionIds: string[]; appliedCreditIds: string[] } {
  const creditsTotal = Math.round(pendingCredits.reduce((s, c) => s + Number(c.amount), 0) * 100) / 100;
  let remaining = Math.round((bookingsNet + creditsTotal) * 100) / 100;
  const appliedDeductionIds: string[] = [];
  const skippedDeductionIds: string[] = [];
  for (const d of pendingDeductions) {
    const amt = Number(d.amount);
    if (remaining >= amt) {
      remaining = Math.round((remaining - amt) * 100) / 100;
      appliedDeductionIds.push(d.id);
    } else {
      skippedDeductionIds.push(d.id);
    }
  }
  const appliedCreditIds = pendingCredits.map((c) => c.id);
  return { net: remaining, appliedDeductionIds, skippedDeductionIds, appliedCreditIds };
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

// Organizer rejection records a refund obligation whenever money was collected.
// payment_gateway_status === "paid" is the authoritative collected signal: the only
// writer that puts a booking into a rejectable state with amount_due > 0 is
// confirmPaidBooking, which sets that status in the same UPDATE. A null
// paymongo_payment_id must NOT suppress the record; that case flows through
// issueAndRecordRefund, which writes the durable refunds row and then fails at
// processPayMongoRefund ("No payment transaction ID found"), matching the
// cancellation path's downpayment leg. Free Advanced trips (amount_due 0) still
// never trigger a refund or a PayMongo call.
export function shouldRefundOnReject(
  amountDue: number | null | undefined,
  paymentGatewayStatus: string | null | undefined,
): boolean {
  return (amountDue ?? 0) > 0 && paymentGatewayStatus === "paid";
}
