"use client";

import { useState, type ReactNode } from "react";

export function FilterDisclosure({
  searchSlot,
  summary,
  activeCount,
  children,
}: {
  searchSlot: ReactNode;
  summary: string;
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {searchSlot}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="trip-filters-panel"
          className="inline-flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2 sm:w-auto"
        >
          <span className="font-semibold">Filters</span>
          {activeCount > 0 && (
            <span className="inline-flex max-w-[12rem] items-center truncate rounded-full bg-trailhead/10 px-2 py-0.5 text-xs font-semibold text-trailhead">
              {summary}
            </span>
          )}
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
            className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div
        id="trip-filters-panel"
        aria-label="Trip filters"
        className={`flex-col gap-2 ${open ? "flex" : "hidden"}`}
      >
        {children}
      </div>
    </div>
  );
}
