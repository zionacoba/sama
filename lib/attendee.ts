// Pure display helper: answers "who is actually attending this booking?"
//
// For a transferred booking the original booker's row (b.*) no longer reflects
// who shows up on trip day: the repurposed slot-0 participant row carries the
// replacement's details once they complete /join. This helper centralizes the
// original-vs-replacement decision so the bookings list, CSV export, and pickup
// grouping all agree. It is display-only and never mutates anything.

export type AttendeeBooking = {
  status: string;
  full_name: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  meeting_point: string | null;
};

export type SlotZeroParticipant = {
  full_name: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  meeting_point: string | null;
  completed: boolean;
};

export type AttendeeIdentity = {
  name: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  meetingPoint: string | null;
  awaiting: boolean;
};

const AWAITING = "Awaiting replacement details";

export function resolveAttendee(
  b: AttendeeBooking,
  slotZero: SlotZeroParticipant | null | undefined,
): AttendeeIdentity {
  // Non-transferred bookings are unchanged: the booking row is the attendee.
  if (b.status !== "transferred") {
    return {
      name: b.full_name,
      emergencyContactName: b.emergency_contact_name,
      emergencyContactPhone: b.emergency_contact_phone,
      meetingPoint: b.meeting_point,
      awaiting: false,
    };
  }

  // Transferred + replacement has completed /join: show the real replacement.
  if (slotZero?.completed && slotZero.full_name) {
    return {
      name: slotZero.full_name,
      emergencyContactName: slotZero.emergency_contact_name,
      emergencyContactPhone: slotZero.emergency_contact_phone,
      meetingPoint: slotZero.meeting_point,
      awaiting: false,
    };
  }

  // Transferred but the replacement has not signed yet: never fall back to the
  // original booker's identity.
  return {
    name: AWAITING,
    emergencyContactName: AWAITING,
    emergencyContactPhone: AWAITING,
    meetingPoint: null,
    awaiting: true,
  };
}
