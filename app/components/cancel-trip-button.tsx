"use client";

import { useRef, useState, useTransition } from "react";
import { cancelTrip, getTripCancelSummary } from "@/app/actions/trip";
import { formatPeso } from "@/lib/format";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";

type CancelSummary = {
  bookingCount: number;
  paymongoCount: number;
  manualCount: number;
  pendingEarningsNet: number;
};

type Props = {
  tripSlug: string;
  tripTitle: string;
};

const fmtPHP = (n: number) => formatPeso(n);

export function CancelTripButton({ tripSlug, tripTitle }: Props) {
  const [summary, setSummary] = useState<CancelSummary | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  function closeConfirm() {
    if (isPending) return;
    setShowConfirm(false);
    setConfirmText("");
  }

  useFocusTrap(dialogRef, showConfirm, { onClose: closeConfirm });

  async function handleOpenDialog() {
    setError(null);
    setConfirmText("");
    setIsLoadingSummary(true);
    try {
      const result = await getTripCancelSummary(tripSlug);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSummary(result);
      setShowConfirm(true);
    } catch {
      setError("Something went wrong loading the cancellation details. Please try again.");
    } finally {
      setIsLoadingSummary(false);
    }
  }

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

  const n = summary?.bookingCount ?? 0;
  const hasBookings = n > 0;

  return (
    <>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <button
        type="button"
        onClick={handleOpenDialog}
        disabled={isLoadingSummary}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoadingSummary ? "Loading…" : "Cancel trip"}
      </button>

      {showConfirm && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-trip-title"
            className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
          >
            <h2 id="cancel-trip-title" className="text-base font-bold text-stone-900">Cancel this trip?</h2>

            {hasBookings ? (
              <div className="mt-3 space-y-3 text-sm text-stone-600">
                <p>
                  This will cancel{" "}
                  <strong className="text-stone-800">{n} booking{n !== 1 ? "s" : ""}</strong>:
                </p>
                <ul className="ml-4 list-disc space-y-1">
                  {summary.paymongoCount > 0 && (
                    <li>
                      <strong className="text-stone-800">{summary.paymongoCount}</strong> will be automatically refunded
                    </li>
                  )}
                  {summary.manualCount > 0 && (
                    <li>
                      <strong className="text-stone-800">{summary.manualCount}</strong> require manual refund (cash/QR Ph — you may need to follow up)
                    </li>
                  )}
                </ul>
                {summary.pendingEarningsNet > 0 && (
                  <p>
                    Your pending earnings of{" "}
                    <strong className="text-stone-800">{fmtPHP(summary.pendingEarningsNet)}</strong>{" "}
                    for this trip will not be paid out.
                  </p>
                )}
                <p>All bookers will be notified by email. This cannot be undone.</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-600">
                This trip has no bookings. This cannot be undone.
              </p>
            )}

            <p id="cancel-trip-instruction" className="mt-4 text-sm text-stone-600">
              Type <strong className="text-stone-800 select-none">CANCEL</strong> to confirm.
            </p>
            <label htmlFor="cancel-trip-confirm" className="sr-only">
              Type CANCEL to confirm
            </label>
            <input
              id="cancel-trip-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type CANCEL to confirm"
              aria-describedby="cancel-trip-instruction"
              className="mt-2 block w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={isPending}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-60"
              >
                Keep trip
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || confirmText !== "CANCEL"}
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
