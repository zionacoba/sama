/**
 * Decide whether a paid booking confirms itself or waits for the organizer.
 *
 * Only an explicit `false` auto-confirms, so a missing value — a column not
 * selected, a row read before the column existed, an undefined field — fails
 * toward organizer review rather than silently confirming a booking the
 * organizer meant to screen.
 */
export function autoConfirms(requiresApproval: boolean | null | undefined): boolean {
  return requiresApproval === false;
}
