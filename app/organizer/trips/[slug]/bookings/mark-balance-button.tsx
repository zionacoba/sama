"use client";

import { useState, useTransition } from "react";
import { markBalanceCollected } from "@/app/actions/booking";

export function MarkBalanceButton({
  bookingId,
  participantName,
  balanceAmount,
}: {
  bookingId: number;
  participantName: string;
  balanceAmount: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await markBalanceCollected(bookingId);
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
        className="min-h-[40px] lg:min-h-0 rounded-lg border border-trailhead/30 px-2 py-1 text-xs font-medium text-trailhead transition hover:bg-trailhead-muted whitespace-nowrap"
      >
        Mark Balance Collected
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-stone-900">Confirm balance collected</h2>
            <p className="mt-3 text-sm text-stone-600">
              Confirm that you have collected the{" "}
              <strong>{balanceAmount} balance</strong> from{" "}
              <strong>{participantName}</strong>?
            </p>
            <p className="mt-2 text-xs text-stone-500">
              This records the balance as collected in cash. The corresponding payout will be included in your next scheduled remittance — it does not trigger an immediate transfer.
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
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirm}
                className="flex-1 rounded-xl bg-trailhead px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Yes, Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
