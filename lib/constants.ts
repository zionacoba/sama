export const DEFAULT_WAIVER_TEXT = `I understand that outdoor activities involve inherent risks including but not limited to physical injury, accidents, and unpredictable weather conditions. I voluntarily participate in this trip organized by [Organizer Name] and assume all risks associated with it. I confirm that I am physically fit to participate and have disclosed any relevant medical conditions. I release the organizer from liability for any injury, loss, or damage arising from my participation, except in cases of gross negligence. I have read and understood the cancellation policy for this trip.`;

// Adults-only attestation. The booking-level sentence is what the booker checks
// in the booking modal; the participant-level sentence is what each participant
// checks on /join. Both are folded into the stored waiver snapshots so there is
// a durable record of exactly what was agreed to.
export const ADULT_ATTESTATION_BOOKING_TEXT =
  "I confirm that I and all other participants in this booking are 18 years of age or older.";

export const ADULT_ATTESTATION_PARTICIPANT_TEXT =
  "I confirm I am 18 years of age or older.";

// Snapshot of the platform terms stored on every booking row at creation time.
export const PLATFORM_WAIVER_SNAPSHOT_TEXT = `By completing this booking, I agree that Sama is a technology marketplace that connects participants with independent trip organizers. Sama is not responsible for the conduct, acts, or omissions of organizers. I voluntarily assume all risks associated with outdoor activities. ${ADULT_ATTESTATION_BOOKING_TEXT}`;
