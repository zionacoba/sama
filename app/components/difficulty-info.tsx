"use client";

import React, { useState, useRef, useEffect } from "react";

function badgeClass(level: string) {
  return level === "Beginner"
    ? "bg-emerald-100 text-emerald-800"
    : level === "Intermediate"
      ? "bg-amber-100 text-amber-900"
      : level === "Advanced"
        ? "bg-orange-100 text-orange-900"
        : "bg-red-100 text-red-800";
}

type Entry = { level: string; description: string; examples?: string };

const ORGANIZER: Entry[] = [
  {
    level: "Beginner",
    description:
      "No prior experience needed. Well-marked trails, minimal elevation gain (under 500m), 2–5 hours total. Suitable for first-timers and casual walkers. Bookings are auto-confirmed.",
    examples: "Mt. Romelo, Masungi Georeserve, Mt. Tagapo",
  },
  {
    level: "Intermediate",
    description:
      "Some hiking experience recommended. Moderate elevation gain (500m–1,200m), uneven terrain, 5–10 hours or multi-day with camping. Good fitness required. Bookings are auto-confirmed.",
    examples: "Mt. Batulao, Mt. Ulap, Osmeña Peak",
  },
  {
    level: "Advanced",
    description:
      "Prior hiking experience required. Significant elevation gain (1,200m+), technical sections, 8+ hours or multi-day. High fitness level needed. Each booking requires your manual approval.",
    examples: "Mt. Pulag (Akiki trail), Mt. Apo, Mt. Halcon",
  },
];

const JOINER: Entry[] = [
  {
    level: "Beginner",
    description:
      "Easy trails, minimal elevation, 2–5 hours. Great for first-timers. Booking is instant once you pay.",
  },
  {
    level: "Intermediate",
    description:
      "Moderate climb, uneven terrain, 5–10 hours or overnight. You should be comfortable hiking with a pack. Booking is instant once you pay.",
  },
  {
    level: "Advanced",
    description:
      "Technical trails, significant elevation, 8+ hours or multi-day. High fitness required. Your booking will be reviewed and approved by the organizer before it's confirmed.",
  },
];

export function RecurringTemplateInfoButton() {
  const [open, setOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({ left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("touchstart", onOutside);
    }
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  function handleToggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const TOOLTIP_W = 320; // w-80
      const MARGIN = 16;
      const overflow = rect.left + TOOLTIP_W - (window.innerWidth - MARGIN);
      const left = overflow > 0 ? -overflow : 0;
      setTooltipStyle({ left: Math.max(left, -(rect.left - MARGIN)) });
    }
    setOpen((v) => !v);
  }

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        aria-label="How recurring templates work"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-stone-400 hover:text-stone-600 transition-colors"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-[15px] w-[15px] select-none items-center justify-center rounded-full border border-current text-[9px] font-bold leading-none"
        >
          i
        </span>
      </button>

      {open && (
        <div className="absolute top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white p-4 shadow-lg" style={tooltipStyle}>
          <p className="mb-3 text-xs font-semibold text-stone-700">
            Use a template if you run this trip regularly — like every month or every weekend.
          </p>
          <p className="mb-2 text-xs text-stone-500">Here&apos;s how it works:</p>
          <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-stone-600">
            <li>Save this as a template (no date needed)</li>
            <li>From your dashboard, create a &ldquo;run&rdquo; each time you want to list a new date</li>
            <li>Each run inherits all your trip details — just add the date, price, and slots</li>
          </ol>
          <p className="text-xs text-stone-400">
            Templates never appear on the public listing. Only runs do.
          </p>
        </div>
      )}
    </div>
  );
}

type DifficultyInfoProps =
  | { variant: "organizer"; difficulty?: never; compact?: boolean }
  | { variant: "joiner"; difficulty: string; compact?: boolean };

export function DifficultyInfoButton({ variant, difficulty, compact }: DifficultyInfoProps) {
  const [open, setOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({ left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", onOutside);
      document.addEventListener("touchstart", onOutside);
    }
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);

  function handleToggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const TOOLTIP_W = 256; // w-64
      const MARGIN = 16;
      const overflow = rect.left + TOOLTIP_W - (window.innerWidth - MARGIN);
      const left = overflow > 0 ? -overflow : 0;
      setTooltipStyle({ left: Math.max(left, -(rect.left - MARGIN)) });
    }
    setOpen((v) => !v);
  }

  const joinerEntry = variant === "joiner"
    ? JOINER.find((e) => e.level === difficulty) ?? null
    : null;

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Difficulty level guide"
        className={`inline-flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors ${compact ? "" : "min-h-[44px] min-w-[44px]"}`}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-[15px] w-[15px] select-none items-center justify-center rounded-full border border-current text-[9px] font-bold leading-none"
        >
          i
        </span>
      </button>

      {open && (
        <div className="absolute top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white p-4 shadow-lg" style={tooltipStyle}>
          {variant === "organizer" ? (
            <>
              <p className="mb-3 text-xs text-stone-500">
                Choose the level that honestly matches your trip. When in doubt, go one level higher — it&apos;s better to pleasantly surprise participants than leave them struggling.
              </p>
              <div className="space-y-3">
                {ORGANIZER.map(({ level, description, examples }) => (
                  <div key={level}>
                    <span
                      className={`mb-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass(level)}`}
                    >
                      {level}
                    </span>
                    <p className="text-xs text-stone-600">{description}</p>
                    {examples && (
                      <p className="mt-0.5 text-xs text-stone-400">Examples: {examples}</p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : joinerEntry ? (
            <>
              <span
                className={`mb-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass(joinerEntry.level)}`}
              >
                {joinerEntry.level}
              </span>
              <p className="text-xs text-stone-600">{joinerEntry.description}</p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
