"use client";

type EarningsRow = {
  id: string;
  remittedAt: string;
  netAmount: number;
  bookingCount: number;
  remittanceReference: string | null;
};

function escapeCsv(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ExportEarningsCsvButton({ rows }: { rows: EarningsRow[] }) {
  function handleExport() {
    const headers = ["Date", "Net Amount Received", "Number of Bookings", "Reference"];
    const csvRows = rows.map((p) => [
      escapeCsv(p.remittedAt.slice(0, 10)),
      escapeCsv(p.netAmount),
      escapeCsv(p.bookingCount),
      escapeCsv(p.remittanceReference),
    ].join(","));

    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sama-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
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
