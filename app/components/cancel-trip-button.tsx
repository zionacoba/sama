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

  function handleConfirm() {
    startTransition(async () => {
      await cancelTrip(tripSlug);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
      >
        Cancel trip
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-stone-900">Cancel trip?</h2>
            <p className="mt-2 text-sm text-stone-600">
              Are you sure you want to cancel <strong>{tripTitle}</strong>?
              {totalBookings > 0
                ? ` All ${totalBookings} booking${totalBookings !== 1 ? "s" : ""} will be cancelled and bookers will be notified.`
                : " This trip has no bookings."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-60"
              >
                Keep trip
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
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
