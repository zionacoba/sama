"use client";

import { useTransition } from "react";
import { updateBookingStatus } from "@/app/actions/booking";

export function BookingActions({ bookingId }: { bookingId: number }) {
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(() => {
      updateBookingStatus(bookingId, "confirmed");
    });
  }

  function handleReject() {
    startTransition(() => {
      updateBookingStatus(bookingId, "rejected");
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleConfirm}
        disabled={pending}
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={handleReject}
        disabled={pending}
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  );
}
