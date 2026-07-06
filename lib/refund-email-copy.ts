import type { RefundResult } from "@/lib/paymongo-refund";

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
