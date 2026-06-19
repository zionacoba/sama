"use client";

import { useState, useTransition } from "react";
import { markAsNoShow } from "@/app/actions/booking";

export function MarkNoShowButton({
  bookingId,
  participantName,
}: {
  bookingId: number;
  participantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await markAsNoShow(bookingId);
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
        onClick={() => setOpen(true)}
        className="min-h-[40px] lg:min-h-0 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-500 transition hover:border-stone-400 hover:text-stone-700"
      >
        Mark as no show
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-stone-900">Mark as no show</h2>
            <p className="mt-2 text-sm text-stone-600">
              Mark <strong>{participantName}</strong>&apos;s booking as a no show.
              The organizer will still be paid for this booking.{" "}
              <strong>This action cannot be undone.</strong>
            </p>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => { setOpen(false); setError(null); }}
                className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirm}
                className="flex-1 rounded-xl bg-stone-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
