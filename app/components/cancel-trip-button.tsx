"use client";

import { useState, useTransition } from "react";
import { cancelTrip } from "@/app/actions/trip";

type Props = {
  tripSlug: string;
  tripTitle: string;
  totalBookings: number;
};

export function CancelTripButton({ tripSlug, tripTitle, totalBookings }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelTrip(tripSlug);
      if (result?.error) {
        setError(result.error);
        setShowConfirm(false);
      }
    });
  }

  return (
    <>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <button
        type="button"
        onClick={() => { setShowConfirm(true); setConfirmText(""); }}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
      >
        Cancel trip
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-stone-900">Cancel trip?</h2>
            <p className="mt-2 text-sm text-stone-600">
              {totalBookings > 0
                ? `This will cancel all ${totalBookings} booking${totalBookings !== 1 ? "s" : ""} and notify every booker. This cannot be undone.`
                : "This trip has no bookings. This cannot be undone."}
            </p>
            <p className="mt-3 text-sm text-stone-600">
              Type <strong className="text-stone-800 select-none">{tripTitle}</strong> to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type trip title to confirm"
              className="mt-2 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                disabled={isPending}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-60"
              >
                Keep trip
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || confirmText !== tripTitle}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "Cancelling..." : "Yes, cancel trip"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
