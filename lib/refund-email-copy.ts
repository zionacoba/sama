import type { RefundResult } from "@/lib/paymongo-refund";
import { amountJoinerPaid, computeRefundSplit } from "@/lib/booking-finance";

/**
 * Classify a refund attempt for email copy purposes.
 *
 * "manual" — QR Ph (requiresManualProcessing): the refund is EXPECTED to be
 * processed by a human, so the payer must get "our team will arrange it" copy,
 * not failure copy. "failed" — a genuine API failure, or no attempt recorded
 * (null/undefined result): the payer gets the email-us fallback copy.
 */
export type RefundEmailOutcome = "success" | "manual" | "failed";

export function classifyRefundResult(
  result: Pick<RefundResult, "success" | "requiresManualProcessing"> | null | undefined,
): RefundEmailOutcome {
  if (result?.success) return "success";
  if (result?.requiresManualProcessing) return "manual";
  return "failed";
}

/**
 * Follow-up sentence for manual (QR Ph) refund copy. The timeline and the
 * proactive "we contact you" direction must match the Terms, which promise our
 * team arranges manual refunds within 3 to 5 business days.
 */
export const MANUAL_REFUND_FOLLOWUP =
  "Our team will arrange it within 3 to 5 business days. No action is needed from you.";

/**
 * Cancellation line for a booking that has NO refund to issue (a
 * payment_pending hold that was never paid: no PayMongo payment id on either
 * leg). It makes no refund promise and states no amount, since nothing was
 * ever collected. Decided BEFORE classifyRefundResult, which only classifies
 * a refund that actually exists.
 */
export const CANCELLATION_NO_REFUND_LINE =
  `<p>If you have questions, please contact <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>`;

/** Booking fields needed to decide the cancellation refund line. */
export type CancellationEmailBooking = {
  payment_option: string | null;
  amount_due: number | string | null;
  total_amount: number | string | null;
  balance_payment_gateway_status: string | null;
  paymongo_payment_id: string | null;
  balance_paymongo_payment_id: string | null;
};

/**
 * The refund paragraph for a trip-cancellation email, mirroring cancelTrip's
 * ACTUAL refund issuance so the copy never overstates.
 *
 * The outer gate is refundIssued, computed exactly like cancelTrip's issuance
 * guards (downpayment leg only when paymongo_payment_id exists; the balance leg
 * already gated inside computeRefundSplit) and the cancel-preview's issued>0
 * test. A never-paid payment_pending hold has a positive amountJoinerPaid
 * (amount_due/total_amount are set at booking creation) but no payment id, so it
 * is NOT promised a refund and gets the neutral cancellation line.
 *
 * When a refund IS being issued, the success/manual/failed sub-branches are
 * chosen by classifyRefundResult exactly as before. The failed ("email us")
 * branch legitimately serves a real payer whose automatic refund errored, which
 * is why it stays distinct from the never-paid neutral line.
 */
export function cancellationRefundLine(
  booking: CancellationEmailBooking,
  refundResults: { initial: RefundResult | null; balance: RefundResult | null } | undefined,
  fmtCurrency: (amount: number) => string,
): string {
  const amountPaid = amountJoinerPaid(booking);
  const { downpaymentRefund, balanceRefund } = computeRefundSplit(booking, amountPaid);
  const refundIssued =
    (booking.paymongo_payment_id ? (downpaymentRefund ?? 0) : 0) + balanceRefund > 0;
  if (!refundIssued) return CANCELLATION_NO_REFUND_LINE;

  const refundSucceeded = refundResults?.initial?.success === true;
  const refundManual =
    classifyRefundResult(refundResults?.initial) === "manual" ||
    classifyRefundResult(refundResults?.balance) === "manual";
  if (refundSucceeded) {
    return `<p>A full refund of <strong>${fmtCurrency(amountPaid)}</strong> has been processed and will reflect within 24 hours.</p>`;
  }
  if (refundManual) {
    return `<p>You will receive a full refund of <strong>${fmtCurrency(amountPaid)}</strong>. It is being processed manually. ${MANUAL_REFUND_FOLLOWUP}</p>`;
  }
  return `<p>You will receive a full refund of <strong>${fmtCurrency(amountPaid)}</strong>. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> to process your refund within 3 to 5 business days.</p>`;
}
