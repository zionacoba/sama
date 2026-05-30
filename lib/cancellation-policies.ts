export const CANCELLATION_POLICIES = {
  flexible: {
    label: "Flexible",
    short: "Full refund 7+ days before, 50% within 3–7 days, no refund within 3 days",
    text: "Full refund if cancelled 7 or more days before the trip. 50% refund of amount paid if cancelled 3–7 days before. No refund within 3 days.",
    color: "bg-emerald-100 text-emerald-800",
  },
  moderate: {
    label: "Moderate",
    short: "Full refund 14+ days before, 50% within 7–14 days, no refund within 7 days",
    text: "Full refund if cancelled 14 or more days before the trip. 50% refund of amount paid if cancelled 7–14 days before. No refund within 7 days.",
    color: "bg-amber-100 text-amber-900",
  },
  strict: {
    label: "Strict",
    short: "Full refund 30+ days before, 50% within 7–30 days, no refund within 7 days",
    text: "Full refund if cancelled 30 or more days before the trip. 50% refund of amount paid if cancelled 7–30 days before. No refund within 7 days.",
    color: "bg-red-100 text-red-800",
  },
  custom: {
    label: "Custom",
    short: "Write your own policy",
    text: "",
    color: "bg-stone-100 text-stone-700",
  },
} as const;

export type CancellationPolicyKey = keyof typeof CANCELLATION_POLICIES;

/**
 * Returns the refund amount based on the policy and days until the trip.
 * Returns null for "custom" policies (manual review required).
 */
export function calculateRefundAmount(
  policy: string,
  amountPaid: number,
  daysUntilTrip: number,
): number | null {
  const days = Math.max(0, daysUntilTrip);
  if (policy === "flexible") {
    if (days >= 7) return amountPaid;
    if (days >= 3) return Math.round(amountPaid * 0.5 * 100) / 100;
    return 0;
  }
  if (policy === "moderate") {
    if (days >= 14) return amountPaid;
    if (days >= 7) return Math.round(amountPaid * 0.5 * 100) / 100;
    return 0;
  }
  if (policy === "strict") {
    if (days >= 30) return amountPaid;
    if (days >= 7) return Math.round(amountPaid * 0.5 * 100) / 100;
    return 0;
  }
  return null;
}
