"use client";

import { useState, useTransition } from "react";
import { partialCancelBooking } from "@/app/actions/booking";

export function PartialCancelButton({
  bookingId,
  totalSlots,
  pricePerSlot,
  refundRatio,
}: {
  bookingId: number;
  totalSlots: number;
  pricePerSlot: number;
  refundRatio: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [slotsToCancel, setSlotsToCancel] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n);

  const refundPreview =
    refundRatio !== null
      ? Math.round((slotsToCancel / totalSlots) * refundRatio * pricePerSlot * totalSlots * 100) / 100
      : null;

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await partialCancelBooking(bookingId, slotsToCancel);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setSlotsToCancel(1); setError(null); setOpen(true); }}
        className="mt-1 w-fit text-xs font-medium text-stone-400 underline-offset-2 transition hover:text-amber-600 hover:underline"
      >
        Cancel some slots
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !isPending) setOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-stone-900">Cancel some slots</h2>
            <p className="mt-2 text-sm text-stone-600">
              How many slots would you like to cancel?
            </p>
            <div className="mt-4 flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={totalSlots - 1}
                value={slotsToCancel}
                onChange={(e) => setSlotsToCancel(Math.min(Math.max(1, parseInt(e.target.value) || 1), totalSlots - 1))}
                className="w-20 rounded-xl border border-stone-200 px-3 py-2 text-center text-sm font-semibold focus:border-trailhead focus:outline-none"
              />
              <span className="text-sm text-stone-500">of {totalSlots} slots</span>
            </div>
            {refundPreview !== null && (
              <p className="mt-3 rounded-xl bg-stone-50 px-4 py-2.5 text-sm text-stone-700">
                Estimated refund: <strong>{fmt(refundPreview)}</strong>
              </p>
            )}
            {refundPreview === null && (
              <p className="mt-3 rounded-xl bg-stone-50 px-4 py-2.5 text-sm text-stone-500">
                Refund eligibility depends on the cancellation policy.
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 disabled:opacity-60"
              >
                Keep all slots
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirm}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Cancelling…" : `Cancel ${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
