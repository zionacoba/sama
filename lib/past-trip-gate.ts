export type PastTripGateFailure = "fetch-error" | "missing-data" | "trip-in-past";

/**
 * Resolve the past-trip gate on the cancellation paths from the trip fetch
 * result. The gate must fail closed: the previous shape discarded the fetch
 * error, so a failed query left the row null and the guard's `trip &&`
 * conjunction falsy, silently skipping the past-trip check. Here a fetch
 * error or an anomalous missing row (maybeSingle() returning null without an
 * error) returns a failure the caller must surface, never a pass.
 *
 * The date comparison is strictly `<` on purpose: a trip whose date_start
 * equals todayPH is happening today, not past, and must pass the gate.
 *
 * The generic parameter preserves the caller's row type, so the returned
 * trip narrows to non-null with all of its selected columns intact.
 */
export function resolvePastTripGate<T extends { date_start: string }>(
  trip: T | null | undefined,
  fetchError: unknown,
  todayPH: string,
): { trip: T } | { failure: PastTripGateFailure } {
  if (fetchError) return { failure: "fetch-error" };
  if (trip == null) return { failure: "missing-data" };
  if (trip.date_start < todayPH) return { failure: "trip-in-past" };
  return { trip };
}
