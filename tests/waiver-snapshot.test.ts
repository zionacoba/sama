import { describe, expect, it } from "vitest";
import {
  ADULT_ATTESTATION_BOOKING_TEXT,
  ADULT_ATTESTATION_PARTICIPANT_TEXT,
  DEFAULT_WAIVER_TEXT,
  PLATFORM_WAIVER_SNAPSHOT_TEXT,
} from "@/lib/constants";
import { withParticipantAdultAttestation } from "@/lib/waiver-snapshot";

describe("PLATFORM_WAIVER_SNAPSHOT_TEXT", () => {
  it("contains the booking-level 18+ attestation so every booking row stores it", () => {
    expect(PLATFORM_WAIVER_SNAPSHOT_TEXT).toContain(ADULT_ATTESTATION_BOOKING_TEXT);
  });

  it("still contains the original platform terms language", () => {
    expect(PLATFORM_WAIVER_SNAPSHOT_TEXT).toContain(
      "Sama is a technology marketplace that connects participants with independent trip organizers",
    );
    expect(PLATFORM_WAIVER_SNAPSHOT_TEXT).toContain(
      "I voluntarily assume all risks associated with outdoor activities.",
    );
  });
});

describe("withParticipantAdultAttestation", () => {
  it("appends the participant 18+ attestation to a waiver snapshot", () => {
    const result = withParticipantAdultAttestation("Organizer waiver body.");
    expect(result).toBe(`Organizer waiver body.\n\n${ADULT_ATTESTATION_PARTICIPANT_TEXT}`);
  });

  it("appends it to the default waiver text", () => {
    const result = withParticipantAdultAttestation(DEFAULT_WAIVER_TEXT);
    expect(result).toContain(DEFAULT_WAIVER_TEXT);
    expect(result).toContain(ADULT_ATTESTATION_PARTICIPANT_TEXT);
  });

  it("is idempotent when the snapshot already carries the attestation", () => {
    const once = withParticipantAdultAttestation("Waiver body.");
    expect(withParticipantAdultAttestation(once)).toBe(once);
  });

  it("passes null through so callers that store no snapshot keep that behavior", () => {
    expect(withParticipantAdultAttestation(null)).toBeNull();
  });
});
