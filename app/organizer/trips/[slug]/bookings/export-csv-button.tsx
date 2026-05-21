"use client";

type BookingRow = {
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

function escapeCsv(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ExportCsvButton({
  bookings,
  tripTitle,
  tripDate,
}: {
  bookings: BookingRow[];
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

    const rows = bookings.map((b) => [
      escapeCsv(b.full_name),
      escapeCsv(b.email),
      escapeCsv(b.phone),
      escapeCsv(b.slots),
      escapeCsv(b.meeting_point),
      escapeCsv(b.emergency_contact_name),
      escapeCsv(b.emergency_contact_phone),
      escapeCsv(b.status),
      escapeCsv(new Date(b.created_at).toLocaleDateString("en-PH")),
    ]);

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
