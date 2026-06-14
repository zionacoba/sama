// Canonical organizer-ownership check. Null/undefined ids are treated as a MISMATCH
// (never a match), so a missing id can never accidentally authorize.
export function organizerOwns(
  resourceOrganizerId: string | null | undefined,
  actingOrganizerId: string | null | undefined,
): boolean {
  if (!resourceOrganizerId || !actingOrganizerId) return false;
  return resourceOrganizerId.trim() === actingOrganizerId.trim();
}
