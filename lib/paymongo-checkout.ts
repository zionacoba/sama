// Pure helpers for interpreting PayMongo Checkout Session payment state.
//
// A checkout session has no paid/unpaid status of its own — its `status` is
// only "active" | "expired" — so whether the customer actually paid must be
// derived from the `payments` array on the session. Each entry may be a bare
// payment resource or wrapped under a `data` key (the same two shapes
// extractPaymentDetails in lib/confirm-paid-booking.ts already tolerates).
//
// This module is deliberately dependency-free so unit tests can exercise the
// derivation without network or framework imports.

function paymentAttributes(payment: unknown): Record<string, unknown> | undefined {
  if (!payment || typeof payment !== "object") return undefined;
  const resource = ((payment as Record<string, unknown>).data ?? payment) as Record<string, unknown>;
  if (!resource || typeof resource !== "object") return undefined;
  return resource.attributes as Record<string, unknown> | undefined;
}

/** The subset of a session's payments whose own status is "paid". */
export function filterPaidPayments(payments: unknown[] | undefined): unknown[] {
  if (!payments) return [];
  return payments.filter((p) => paymentAttributes(p)?.status === "paid");
}

export function hasPaidPayment(payments: unknown[] | undefined): boolean {
  return filterPaidPayments(payments).length > 0;
}

/**
 * Collapse a checkout session's state into the single status string the
 * confirm/reconcile paths key on: "paid" when any payment on the session is
 * paid, otherwise the raw session status ("active" | "expired" | null).
 */
export function deriveCheckoutPaymentStatus(
  sessionStatus: string | null,
  payments: unknown[] | undefined,
): string | null {
  return hasPaidPayment(payments) ? "paid" : sessionStatus;
}
