import { describe, expect, it } from "vitest";
import { resolveAttendee } from "@/lib/attendee";
import type { AttendeeBooking, SlotZeroParticipant } from "@/lib/attendee";

const booker: AttendeeBooking = {
  status: "confirmed",
  full_name: "Original Booker",
  emergency_contact_name: "Booker Kin",
  emergency_contact_phone: "0900000000",
  meeting_point: "SM North EDSA, 5:00 AM",
};

describe("resolveAttendee", () => {
  it("returns the booking row values for a non-transferred booking", () => {
    const result = resolveAttendee(booker, undefined);
    expect(result).toEqual({
      name: "Original Booker",
      emergencyContactName: "Booker Kin",
      emergencyContactPhone: "0900000000",
      meetingPoint: "SM North EDSA, 5:00 AM",
      awaiting: false,
    });
  });

  it("returns the completed replacement's values for a transferred booking", () => {
    const slotZero: SlotZeroParticipant = {
      full_name: "Real Replacement",
      emergency_contact_name: "Replacement Kin",
      emergency_contact_phone: "0911111111",
      meeting_point: "Trinoma, 4:30 AM",
      completed: true,
    };
    const result = resolveAttendee({ ...booker, status: "transferred" }, slotZero);
    expect(result).toEqual({
      name: "Real Replacement",
      emergencyContactName: "Replacement Kin",
      emergencyContactPhone: "0911111111",
      meetingPoint: "Trinoma, 4:30 AM",
      awaiting: false,
    });
  });

  it("returns an awaiting placeholder (never the booker) when the replacement has not signed", () => {
    const slotZero: SlotZeroParticipant = {
      full_name: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      meeting_point: null,
      completed: false,
    };
    const result = resolveAttendee({ ...booker, status: "transferred" }, slotZero);
    expect(result).toEqual({
      name: "Awaiting replacement details",
      emergencyContactName: "Awaiting replacement details",
      emergencyContactPhone: "Awaiting replacement details",
      meetingPoint: null,
      awaiting: true,
    });
    expect(result.name).not.toContain("Original Booker");
  });

  it("treats a transferred booking with no slot-0 row as awaiting", () => {
    const result = resolveAttendee({ ...booker, status: "transferred" }, undefined);
    expect(result.awaiting).toBe(true);
    expect(result.name).toBe("Awaiting replacement details");
  });
});
