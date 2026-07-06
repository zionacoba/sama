"use client";

import { buildCsvRows, CSV_HEADERS } from "@/lib/roster-csv";
import type { CsvBooking, CsvParticipant } from "@/lib/roster-csv";

export function ExportCsvButton({
  bookings,
  participantsRecord,
  tripTitle,
  tripDate,
}: {
  bookings: CsvBooking[];
  participantsRecord: Record<string, CsvParticipant[]>;
  tripTitle: string;
  tripDate: string;
}) {
  function handleExport() {
    // One row per participant (booker anchor row plus a row per additional
    // slot); row construction and its null handling live in lib/roster-csv.ts
    // so they are unit-tested.
    const rows = buildCsvRows(bookings, participantsRecord);
    const csv = [CSV_HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n");
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
