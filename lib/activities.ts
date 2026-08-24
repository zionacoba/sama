// The values stored in trips.activity_type. This list is the only thing
// enforcing that column — there is no CHECK constraint and no enum behind it,
// so anything not written from here can still be persisted.
//
// The organizer application form keeps its own separate list on purpose: it
// feeds organizers.activity_types, a different column with its own lifecycle.
export const ACTIVITY_TYPES = ["Hiking", "Freediving", "Beach & Island"] as const;
