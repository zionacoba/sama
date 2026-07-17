export type CancellationCascadeFailure = "fetch-error" | "missing-data";

/**
 * Resolve the status-guarded cascade `update(...).select(...)` on the
 * cancellation paths from its result. The cascade must fail closed: the
 * previous shape discarded the update error, so a failed statement left the
 * row list null and every downstream consumer of `(rows ?? [])` iterated
 * nothing, silently skipping refunds and notifications for a trip whose
 * status had already been flipped.
 *
 * Precedence: an error always wins, even when rows arrive alongside it.
 * A null/undefined list without an error is anomalous (a list select or
 * update-select returns [] when it matches nothing, never null) and also
 * fails. An empty array is a legitimate pass: a trip with nothing
 * cancellable.
 *
 * The generic parameter preserves the caller's row type, so the returned
 * rows keep every selected column intact.
 */
export function resolveCancellationCascade<T>(
  rows: T[] | null | undefined,
  fetchError: unknown,
): { rows: T[] } | { failure: CancellationCascadeFailure } {
  if (fetchError) return { failure: "fetch-error" };
  if (rows == null) return { failure: "missing-data" };
  return { rows };
}
