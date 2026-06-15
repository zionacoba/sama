// Canonical organizer-ownership check. Null/undefined ids are treated as a MISMATCH
// (never a match), so a missing id can never accidentally authorize.
export function organizerOwns(
  resourceOrganizerId: string | null | undefined,
  actingOrganizerId: string | null | undefined,
): boolean {
  const a = resourceOrganizerId?.trim();
  const b = actingOrganizerId?.trim();
  if (!a || !b) return false; // null, undefined, empty, or whitespace-only all reject
  return a === b;
}
