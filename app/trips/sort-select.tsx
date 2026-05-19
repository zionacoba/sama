"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "soonest", label: "Soonest first" },
  { value: "latest", label: "Latest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
] as const;

export function SortSelect({ current }: { current: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sp = new URLSearchParams(searchParams.toString());
    const val = e.target.value;
    if (val === "soonest") sp.delete("sort");
    else sp.set("sort", val);
    const qs = sp.toString();
    router.push(`/trips${qs ? `?${qs}` : ""}`);
  }

  return (
    <select
      value={current}
      onChange={handleChange}
      aria-label="Sort trips"
      className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
