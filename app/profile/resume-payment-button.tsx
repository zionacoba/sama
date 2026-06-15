"use client";

import { useState, useTransition } from "react";
import { resumeBookingPayment } from "@/app/actions/booking";

export function ResumePaymentButton({
  bookingId,
  className,
  wrapperClassName,
  label = "Resume payment",
}: {
  bookingId: number;
  className?: string;
  wrapperClassName?: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await resumeBookingPayment(bookingId);
      if ("error" in result) {
        setError(result.error);
      } else {
        window.location.href = result.checkoutUrl;
      }
    });
  }

  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          className ??
          "rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {isPending ? "Loading payment…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
