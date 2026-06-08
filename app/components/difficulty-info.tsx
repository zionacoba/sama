"use client";

import { useState, useRef, useEffect } from "react";

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

export function DifficultyInfoButton({ variant }: { variant: "organizer" | "joiner" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const entries = variant === "organizer" ? ORGANIZER : JOINER;

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Difficulty level guide"
        className="inline-flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white p-4 shadow-lg">
          {variant === "organizer" && (
            <p className="mb-3 text-xs text-stone-500">
              Choose the level that honestly matches your trip. When in doubt, go one level higher — it&apos;s better to pleasantly surprise participants than leave them struggling.
            </p>
          )}
          <div className="space-y-3">
            {entries.map(({ level, description, examples }) => (
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
        </div>
      )}
    </div>
  );
}
