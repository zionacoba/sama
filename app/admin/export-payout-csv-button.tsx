"use client";

import { exportPayoutHistoryCSV } from "@/app/actions/admin";

export function ExportPayoutCsvButton() {
  async function handleExport() {
    const csv = await exportPayoutHistoryCSV();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sama-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
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
