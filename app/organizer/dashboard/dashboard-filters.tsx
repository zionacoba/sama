"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "full", label: "Full" },
  { value: "past", label: "Past" },
] as const;

type Props = {
  search: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

export function DashboardFilters({ search, status, dateFrom, dateTo }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (updates: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val && val !== "all") sp.set(key, val);
        else sp.delete(key);
      }
      sp.delete("page");
      router.push(`/organizer/dashboard?${sp.toString()}`);
    },
    [router, searchParams],
  );

  const debouncedSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => navigate({ search: value }), 300);
    },
    [navigate],
  );

  const currentStatus = status || "all";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            aria-hidden
          >
            🔍
          </span>
          <input
            key={search}
            type="search"
            defaultValue={search}
            placeholder="Search trips by name…"
            onChange={(e) => debouncedSearch(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-4 text-sm text-stone-900 shadow-sm outline-none placeholder:text-stone-400 focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            defaultValue={dateFrom}
            onChange={(e) => navigate({ date_from: e.target.value })}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
          <span className="shrink-0 text-xs text-stone-400">to</span>
          <input
            type="date"
            defaultValue={dateTo}
            onChange={(e) => navigate({ date_to: e.target.value })}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = currentStatus === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => navigate({ status: opt.value })}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "bg-trailhead text-white shadow-sm"
                  : "border border-stone-200 bg-white text-stone-700 hover:border-trailhead hover:text-trailhead"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
