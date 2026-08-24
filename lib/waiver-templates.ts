import { ACTIVITY_TYPES } from "@/lib/activities";
import { DEFAULT_WAIVER_TEXT } from "@/lib/constants";

type ActivityType = (typeof ACTIVITY_TYPES)[number];

// Per-activity waiver text shown when an organizer picks an activity. The real
// Hiking and Freediving wording is still pending and lands in a separate
// commit — until then both keys point at DEFAULT_WAIVER_TEXT so the shape is in
// place and callers can be written against it.
//
// "Beach & Island" is deliberately absent: it has no template yet, and a miss
// here returns undefined so the caller falls back to DEFAULT_WAIVER_TEXT. The
// `satisfies` clause keeps the keys honest against lib/activities.ts while the
// annotation lets callers look up with a plain string.
export const WAIVER_TEMPLATES: Record<string, string | undefined> = {
  Hiking: DEFAULT_WAIVER_TEXT,
  Freediving: DEFAULT_WAIVER_TEXT,
} satisfies Partial<Record<ActivityType, string>>;
