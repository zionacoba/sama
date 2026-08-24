import { ACTIVITY_TYPES } from "@/lib/activities";

type ActivityType = (typeof ACTIVITY_TYPES)[number];

// Per-activity waiver text pre-filled into the trip form when an organizer
// picks an activity. Written to this file by a direct transfer from
// waiver-templates-draft-v2.md; the wording never passed through prompt text.
//
// A miss returns undefined and the caller falls back to DEFAULT_WAIVER_TEXT.
// The `satisfies` clause keeps the keys honest against lib/activities.ts while
// the annotation lets callers look up with a plain string.
export const WAIVER_TEMPLATES: Record<string, string | undefined> = {
  Hiking: `I understand that hiking and trekking involve inherent risks including physical injury, falls on uneven or steep terrain, cold exposure and changeable weather, altitude, and physical exertion beyond what I am used to. I voluntarily participate in this trip organized by [Organizer Name] and assume all risks associated with it.

I confirm that I am physically fit for the difficulty level described in this listing. I understand that sharing any relevant medical conditions with the organizer is optional but strongly recommended for my safety.

I will follow the guide's instructions and the organizer's safety briefing at all times, and I understand that the organizer may turn the group back or change the route if conditions make it unsafe to continue.

I release the organizer from liability for any injury, loss, or damage arising from my own actions or pre-existing conditions, except in cases of gross negligence.

I have read and understood the cancellation policy for this trip.`,
  Freediving: `I understand that freediving and water activities involve inherent risks including breath-hold blackout and loss of consciousness underwater, barotrauma and ear or sinus injury, marine hazards, currents and changing sea conditions, and boat travel.

I voluntarily participate in this trip organized by [Organizer Name] and assume all risks associated with it.

I confirm that I am medically fit for breath-hold diving and water activities. I understand that sharing any relevant medical conditions with the organizer is optional but strongly recommended for my safety, and that some conditions affecting the heart, lungs, ears or sinuses carry particular risk in the water.

I will follow the instructor's and safety diver's instructions at all times. I understand that I must never breath-hold dive alone, and that direct supervision by a buddy or safety diver is a condition of participating.

I release the organizer from liability for any injury, loss, or damage arising from my own actions or pre-existing conditions, except in cases of gross negligence.

I have read and understood the cancellation policy for this trip.`,
  "Beach & Island": `I understand that beach and island trips involve inherent risks including boat transfer and open-water crossings, sun and heat exposure, currents and changing sea conditions, marine stings and other marine hazards, and slippery boat decks, ladders and shoreline landings. I voluntarily participate in this trip organized by [Organizer Name] and assume all risks associated with it.

I confirm that I am comfortable in and around water and physically fit for the activities described in this listing. I understand that sharing any relevant medical conditions with the organizer is optional but strongly recommended for my safety.

I will follow the instructions of the organizer and the boat crew at all times, and I understand that the trip may be shortened, rerouted or cancelled if sea or weather conditions make it unsafe to continue.

I release the organizer from liability for any injury, loss, or damage arising from my own actions or pre-existing conditions, except in cases of gross negligence.

I have read and understood the cancellation policy for this trip.`,
} satisfies Partial<Record<ActivityType, string>>;
