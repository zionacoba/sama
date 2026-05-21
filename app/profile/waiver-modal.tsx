"use client";

import { useState } from "react";

export function WaiverModal({
  tripTitle,
  fullName,
  agreedAt,
  waiverText,
}: {
  tripTitle: string;
  fullName: string;
  agreedAt: string;
  waiverText: string;
}) {
  const [open, setOpen] = useState(false);

  const formatted = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(agreedAt));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-stone-400 underline-offset-4 hover:text-trailhead hover:underline"
      >
        View waiver
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-stone-900">Waiver — {tripTitle}</h2>
                <p className="mt-0.5 text-xs text-stone-500">
                  Agreed by <strong>{fullName}</strong> on {formatted}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-stone-100 bg-stone-50 px-4 py-3 text-sm text-stone-700 whitespace-pre-wrap">
              {waiverText}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-trailhead-dark"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
