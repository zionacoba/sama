"use client";

import { resolveAttendee } from "@/lib/attendee";

type BookingRow = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  slots: number;
  meeting_point: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string;
  created_at: string;
};

type ParticipantRow = {
  slot_number: number;
  full_name: string | null;
  completed: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  meeting_point: string | null;
};

function escapeCsv(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ExportCsvButton({
  bookings,
  participantsRecord,
  tripTitle,
  tripDate,
}: {
  bookings: BookingRow[];
  participantsRecord: Record<string, ParticipantRow[]>;
  tripTitle: string;
  tripDate: string;
}) {
  function handleExport() {
    const headers = [
      "Full name",
      "Email",
      "Phone",
      "Slots",
      "Pickup point",
      "Emergency contact name",
      "Emergency contact phone",
      "Status",
      "Booking date",
    ];

    const rows = bookings.map((b) => {
      // Route the attendee identity (name / emergency contact / pickup) through
      // the shared helper so a transferred booking exports the real replacement,
      // not the original booker.
      const slotZero = participantsRecord[String(b.id)]?.find((p) => p.slot_number === 0);
      const attendee = resolveAttendee(b, slotZero);
      return [
        escapeCsv(attendee.name),
        // A transferred booking's real attendee is the replacement, and /join
        // collects no replacement email, so the booker's email is not the
        // attendee's. Emit a blank cell (not a text label) to keep the column
        // machine-readable. Mirrors the on-screen fix in 531f0bf.
        escapeCsv(b.status === "transferred" ? "" : b.email),
        escapeCsv(b.phone),
        escapeCsv(b.slots),
        escapeCsv(attendee.meetingPoint),
        escapeCsv(attendee.emergencyContactName),
        escapeCsv(attendee.emergencyContactPhone),
        escapeCsv(b.status),
        escapeCsv(new Date(b.created_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })),
      ];
    });

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = tripTitle.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
    const date = tripDate.slice(0, 10);
    a.href = url;
    a.download = `${slug}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-600 transition hover:border-trailhead hover:text-trailhead"
    >
      Export CSV
    </button>
  );
}
