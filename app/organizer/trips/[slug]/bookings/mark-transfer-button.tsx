"use client";

import { useState, useTransition } from "react";
import { markAsTransferred } from "@/app/actions/booking";

export function MarkTransferButton({
  bookingId,
  participantName,
}: {
  bookingId: number;
  participantName: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await markAsTransferred(bookingId, email);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setEmail("");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[40px] lg:min-h-0 rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
      >
        Mark as Transferred
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-bold text-stone-900">Mark booking as transferred</h2>
            <p className="mt-2 text-sm text-stone-600">
              This will transfer <strong>{participantName}</strong>&apos;s booking to the person taking their slot. The slot stays assigned to the replacement.{" "}
              <strong>No refund will be processed through Sama.</strong> Settle payment directly between the original participant and their replacement. The participant will be notified.
            </p>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wide">
                Transferee email <span className="font-normal normal-case text-stone-500">(optional — for your records)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="new.participant@email.com"
                className="mt-1.5 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-trailhead focus:outline-none focus:ring-2 focus:ring-trailhead/20"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => { setOpen(false); setEmail(""); setError(null); }}
                className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSubmit}
                className="flex-1 rounded-xl bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Saving…" : "Confirm Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
