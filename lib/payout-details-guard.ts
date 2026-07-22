export type GuardCountResult =
  | { kind: "fetch-error" }
  | { kind: "count"; count: number };

export type GuardRowsResult<T> =
  | { kind: "fetch-error" }
  | { kind: "rows"; rows: T[] };

/**
 * Resolve a head:true count query that feeds a guard which must fail closed,
 * for example the payout-details removal guard in updateOrganizerProfile
 * (pending-payout count, confirmed-bookings count) or the rate-limit count
 * guard in createBooking.
 *
 * The guard exists to BLOCK removal when the count is positive, so it must fail
 * closed: if the query cannot be read, the caller must not be allowed to strand
 * a pending payout or confirmed bookings by clearing its payout destination.
 *
 * A present fetchError is reported first, before the count is inspected, so an
 * error that arrives alongside a stale count still fails closed. A null count
 * without an error is also anomalous for a head:true count query, which returns
 * a number on success, so it is treated as fetch-error rather than silently
 * read as zero (which would let the removal proceed).
 */
export function resolveGuardCount(count: number | null, fetchError: unknown): GuardCountResult {
  if (fetchError) return { kind: "fetch-error" };
  if (count == null) return { kind: "fetch-error" };
  return { kind: "count", count };
}

/**
 * Resolve a list select that feeds a payout-details removal guard in
 * updateOrganizerProfile (the upcoming-active-trips list whose ids gate the
 * confirmed-bookings count).
 *
 * Same fail-closed reasoning: a guard that cannot read its rows must not let the
 * removal proceed. A present fetchError is reported first. A null rows without
 * an error is anomalous because a list select returns an empty array when
 * nothing matches, never null, so null is treated as fetch-error. An empty
 * array is a legitimate pass-through (no upcoming trips), so it is returned as
 * rows, not an error.
 */
export function resolveGuardRows<T>(rows: T[] | null, fetchError: unknown): GuardRowsResult<T> {
  if (fetchError) return { kind: "fetch-error" };
  if (rows == null) return { kind: "fetch-error" };
  return { kind: "rows", rows };
}
