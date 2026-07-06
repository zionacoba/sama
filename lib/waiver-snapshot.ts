import { ADULT_ATTESTATION_PARTICIPANT_TEXT } from "@/lib/constants";

// Folds the participant-level 18+ attestation into a waiver snapshot so the
// stored per-participant record captures exactly what was agreed to on /join.
// Idempotent: a snapshot that already carries the attestation is returned
// unchanged. Null passes through so callers that intentionally store no
// snapshot (and let confirmParticipant fill it later) keep that behavior.
export function withParticipantAdultAttestation(waiverText: string): string;
export function withParticipantAdultAttestation(waiverText: string | null): string | null;
export function withParticipantAdultAttestation(waiverText: string | null): string | null {
  if (waiverText == null) return null;
  if (waiverText.includes(ADULT_ATTESTATION_PARTICIPANT_TEXT)) return waiverText;
  return `${waiverText}\n\n${ADULT_ATTESTATION_PARTICIPANT_TEXT}`;
}
