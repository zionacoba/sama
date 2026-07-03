// Shared, dependency-free reconciliation-escalation logic for the strand-forever
// bound (Shape C). Kept free of Deno and Node globals so the cleanup edge
// function can import it (`../_shared/reconcile-escalation.ts`) and the vitest
// suite (Node) can import it by relative path and unit-test the predicate.

// A payment_pending booking whose PayMongo link stays unreachable this long is
// escalated to a human once and then left for the daily digest. It is NEVER
// auto-cancelled and its slot is NEVER freed automatically.
export const ESCALATION_THRESHOLD_HOURS = 6;

/**
 * Decide whether an unverifiable stuck booking has been failing long enough to
 * escalate. Pure and side-effect free.
 *
 * @param firstFailedAt ISO timestamp (or Date/null) of the first unreachable
 *   reconcile failure, i.e. bookings.reconcile_first_failed_at. Null means the
 *   booking has never failed as unreachable, so there is nothing to escalate.
 * @param nowMs Current time in epoch milliseconds (Date.now()).
 * @param thresholdHours Age, in hours, at or beyond which we escalate.
 * @returns true when firstFailedAt is set and the elapsed time is at or past the
 *   threshold. The boundary (exactly thresholdHours elapsed) escalates, so a
 *   discrete cron cadence can never step over the edge and miss it.
 */
export function shouldEscalate(
  firstFailedAt: string | Date | null | undefined,
  nowMs: number,
  thresholdHours: number = ESCALATION_THRESHOLD_HOURS,
): boolean {
  if (firstFailedAt == null) return false;
  const failedMs = firstFailedAt instanceof Date
    ? firstFailedAt.getTime()
    : new Date(firstFailedAt).getTime();
  if (Number.isNaN(failedMs)) return false;
  const elapsedMs = nowMs - failedMs;
  return elapsedMs >= thresholdHours * 60 * 60 * 1000;
}
