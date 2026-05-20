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

  const inputClass = "rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30";

  return (
    <>
      <span className="shrink-0 text-xs font-medium text-stone-500">Dates</span>
      <input
        type="date"
        value={dateFrom ?? ""}
        onChange={(e) => navigate({ date_from: e.target.value })}
        className={inputClass}
      />
      <span className="shrink-0 text-xs text-stone-400">–</span>
      <input
        type="date"
        value={dateTo ?? ""}
        onChange={(e) => navigate({ date_to: e.target.value })}
        className={inputClass}
      />
      {(dateFrom || dateTo) && (
        <button
          type="button"
          onClick={() => navigate({ date_from: "", date_to: "" })}
          className="shrink-0 text-xs text-stone-400 underline-offset-4 hover:text-stone-600 hover:underline"
        >
          Clear
        </button>
      )}
      <select
        value={sort}
        onChange={(e) =>
          navigate({ sort: e.target.value === "soonest" ? "" : e.target.value })
        }
        aria-label="Sort trips"
        className={inputClass}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
