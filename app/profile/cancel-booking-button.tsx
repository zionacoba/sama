"use client";

import { useState, useTransition } from "react";
import { cancelBooking } from "@/app/actions/booking";
import { formatPeso } from "@/lib/format";

export function CancelBookingButton({
  bookingId,
  tripTitle,
  tripDate,
  refundAmount,
  paymentMethod,
}: {
  bookingId: number;
  tripTitle: string;
  tripDate: string;
  refundAmount: number | null;
  paymentMethod: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelBooking(bookingId);
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
        className="mt-1 w-fit text-xs font-medium text-stone-400 underline-offset-2 transition hover:text-red-500 hover:underline"
      >
        Cancel booking
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-stone-900">Cancel your booking?</h2>
            <p className="mt-3 text-sm text-stone-600">
              Are you sure you want to cancel your booking for{" "}
              <strong>{tripTitle}</strong> on {tripDate}?
            </p>
            <p className="mt-3 text-sm text-stone-600">
              {refundAmount != null && refundAmount > 0
                ? (paymentMethod === "gcash" || paymentMethod === "paymaya")
                  ? <>You will receive a <strong>{formatPeso(refundAmount)}</strong> refund to your e-wallet, typically within 24 hours.</>
                  : <>You will receive a <strong>{formatPeso(refundAmount)}</strong> refund, processed manually by our team within 3 to 5 business days.</>
                : "No refund is available based on the cancellation policy."
              }
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
                Keep Booking
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleCancel}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Cancelling…" : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
