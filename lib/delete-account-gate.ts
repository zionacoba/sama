// Pure decision logic for the deleteAccount gates in app/actions/profile.ts.
// Fail-closed polarity throughout, matching the cluster precedent
// (resolvePastTripGate in lib/past-trip-gate.ts, resolveTripSlotSummary in
// lib/trip-slot-summary.ts): a fetch error or anomalous null never lets the
// deletion proceed.

export type DeleteAccountGate =
  | { ok: true }
  | { blocked: "upcoming-bookings" | "active-trips" }
  | { failure: "fetch-error" };

export function resolveUpcomingBookingGate(
  bookings: ReadonlyArray<{ trip: { date_start: string } | null }> | null,
  fetchError: unknown,
  nowIso: string,
): DeleteAccountGate {
  // Fetch error takes precedence even if rows are present.
  if (fetchError) return { failure: "fetch-error" };
  // A list select returns [] when empty, never null; null without an error is anomalous, fail closed.
  if (bookings == null) return { failure: "fetch-error" };
  const hasUpcoming = bookings.some(
    (b) => b.trip != null && b.trip.date_start > nowIso,
  );
  if (hasUpcoming) return { blocked: "upcoming-bookings" };
  return { ok: true };
}

export function resolveOrganizerTripGate(
  organizerError: unknown,
  organizerRow: { id: string } | null,
  activeTripsError: unknown,
  activeTripsCount: number | null,
): DeleteAccountGate {
  if (organizerError) return { failure: "fetch-error" };
  // maybeSingle() returns null WITHOUT an error when the user is not an organizer; that is legitimate.
  if (organizerRow == null) return { ok: true };
  if (activeTripsError) return { failure: "fetch-error" };
  // A successful count is a number; null without an error is anomalous, fail closed.
  if (activeTripsCount == null) return { failure: "fetch-error" };
  if (activeTripsCount > 0) return { blocked: "active-trips" };
  return { ok: true };
}
