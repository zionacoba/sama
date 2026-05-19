"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "soonest", label: "Soonest first" },
  { value: "latest", label: "Latest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
] as const;

export function TripFilters({
  sort,
  dateFrom,
  dateTo,
}: {
  sort: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(updates: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val) sp.set(key, val);
      else sp.delete(key);
    }
    const qs = sp.toString();
    router.push(`/trips${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-stone-500">Dates</span>
        <input
          type="date"
          value={dateFrom ?? ""}
          onChange={(e) => navigate({ date_from: e.target.value })}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
        <span className="text-xs text-stone-400">to</span>
        <input
          type="date"
          value={dateTo ?? ""}
          onChange={(e) => navigate({ date_to: e.target.value })}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => navigate({ date_from: "", date_to: "" })}
            className="text-xs text-stone-400 underline-offset-4 hover:text-stone-600 hover:underline"
          >
            Clear dates
          </button>
        )}
      </div>

      <select
        value={sort}
        onChange={(e) =>
          navigate({ sort: e.target.value === "soonest" ? "" : e.target.value })
        }
        aria-label="Sort trips"
        className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
