export type PayoutRemittedGateResult =
  | { kind: "clear" }
  | { kind: "payout-remitted" }
  | { kind: "fetch-error" }
  | { kind: "missing-data" };

/**
 * Resolve the payout-remitted gate on the self-serve cancellation path from a
 * bookings list select. A trip whose bookings include any booking with
 * payout_status = 'remitted' has money already sent to the organizer, so it
 * must not be cancellable self-serve.
 *
 * The gate fails closed on error precedence: a present fetchError is reported
 * first, before any inspection of rows. rows null is anomalous because a list
 * select returns an empty array when nothing matches, never null; treat that
 * null as missing-data the caller must surface rather than a silent pass.
 *
 * The gate blocks only remitted, not included: a pending (included) payout has
 * not yet been sent money, and the existing per-booking reconciliation flag in
 * cancelTrip already covers cancellation after payout creation. Only remitted
 * represents money actually disbursed.
 */
export function resolvePayoutRemittedGate<T>(
  rows: T[] | null | undefined,
  fetchError: unknown,
): PayoutRemittedGateResult {
  if (fetchError) return { kind: "fetch-error" };
  if (rows == null) return { kind: "missing-data" };
  if (rows.length > 0) return { kind: "payout-remitted" };
  return { kind: "clear" };
}
