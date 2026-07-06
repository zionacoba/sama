// Pure row builder for the organizer roster CSV export: one row per
// participant, not per booking. Lives in lib/ (not the client button) so the
// per-participant expansion and its null handling are unit-testable. The
// booking-level anchor row (slot 0, i.e. the booker) routes through
// resolveAttendee so a transferred booking exports the replacement, never the
// original booker. Every sensitive field can be null (incomplete /join, deleted
// account, or the 90-day post-trip purge) and must export as a blank cell.

import { resolveAttendee } from "@/lib/attendee";

export type CsvBooking = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  slots: number;
  meeting_point: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  status: string;
  created_at: string;
};

export type CsvParticipant = {
  slot_number: number;
  full_name: string | null;
  completed: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  meeting_point: string | null;
};

export const CSV_HEADERS = [
  "Full name",
  "Email",
  "Phone",
  "Slots",
  "Pickup point",
  "Emergency contact name",
  "Emergency contact phone",
  "Medical notes",
  "Status",
  "Booking date",
];

export function escapeCsv(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvRows(
  bookings: CsvBooking[],
  participantsRecord: Record<string, CsvParticipant[]>,
): string[][] {
  return bookings.flatMap((b) => {
    const participants = participantsRecord[String(b.id)] ?? [];
    const slotZero = participants.find((p) => p.slot_number === 0);
    // Route the attendee identity (name / emergency contact / pickup) through
    // the shared helper so a transferred booking exports the real replacement,
    // not the original booker.
    const attendee = resolveAttendee(b, slotZero);
    const bookingDate = new Date(b.created_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });

    // The bookings row is canonical for the booker's medical notes. A
    // transferred booking's medical belongs to the replacement (slot-0 row) and
    // exists only once they complete /join; never fall back to the booker's.
    const anchorMedical =
      b.status === "transferred" ? (slotZero?.completed ? slotZero.medical_notes : null) : b.medical_notes;

    const anchorRow = [
      escapeCsv(attendee.name),
      // A transferred booking's real attendee is the replacement, and /join
      // collects no replacement email or phone, so the booker's contact details
      // are not the attendee's. Emit blank cells (not a text label) to keep the
      // columns machine-readable. Mirrors the on-screen fix in 531f0bf.
      escapeCsv(b.status === "transferred" ? "" : b.email),
      escapeCsv(b.status === "transferred" ? "" : b.phone),
      escapeCsv(b.slots),
      escapeCsv(attendee.meetingPoint),
      escapeCsv(attendee.emergencyContactName),
      escapeCsv(attendee.emergencyContactPhone),
      escapeCsv(anchorMedical),
      escapeCsv(b.status),
      escapeCsv(bookingDate),
    ];

    // Slots 1+ get their own rows. Email and phone exist only at booking level,
    // so those cells stay blank rather than repeating the booker's (the same
    // machine-readable-blank precedent as the transferred email above). Slots is
    // emitted only on the anchor row so summing the column still yields the
    // trip headcount. A participant who has not completed /join has all-null
    // fields, which export as blanks; the name falls back to the same
    // "Participant N" label the dashboard uses.
    const participantRows = participants
      .filter((p) => p.slot_number !== 0)
      .map((p) => [
        escapeCsv(p.full_name ?? `Participant ${p.slot_number + 1}`),
        "",
        "",
        "",
        escapeCsv(p.meeting_point),
        escapeCsv(p.emergency_contact_name),
        escapeCsv(p.emergency_contact_phone),
        escapeCsv(p.medical_notes),
        escapeCsv(b.status),
        escapeCsv(bookingDate),
      ]);

    return [anchorRow, ...participantRows];
  });
}
