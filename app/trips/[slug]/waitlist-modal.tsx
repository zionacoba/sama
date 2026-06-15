"use client";

import { useRef, useState, useTransition } from "react";
import { joinWaitlist } from "@/app/actions/waitlist";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";

type Props = {
  tripId: number;
  tripSlug: string;
  tripTitle: string;
  defaultName: string;
  defaultEmail: string;
  isOnWaitlist: boolean;
  compact?: boolean;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm text-stone-900 outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";

export function WaitlistModal({
  tripId,
  tripSlug,
  tripTitle,
  defaultName,
  defaultEmail,
  isOnWaitlist: initialOnWaitlist,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(initialOnWaitlist);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [slots, setSlots] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, open, { onClose: () => setOpen(false) });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await joinWaitlist({ tripId, tripSlug, fullName, email, phone, slots });
      if ("error" in result) {
        setError(result.error);
      } else {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setOpen(false);
          setJoined(true);
        }, 2500);
      }
    });
  }

  if (joined) {
    if (compact) {
      return (
        <p className="text-sm font-semibold text-emerald-700">On waitlist ✓</p>
      );
    }
    return (
      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="font-semibold text-emerald-800">You&apos;re on the waitlist!</p>
        <p className="mt-1 text-sm text-emerald-700">We&apos;ll email you if a slot opens up.</p>
      </div>
    );
  }

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
        >
          Join Waitlist
        </button>
      ) : (
        <div className="mt-10 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-6 text-center">
          <p className="font-semibold text-stone-700">This trip is full.</p>
          <p className="mt-1 text-sm text-stone-500">
            Join the waitlist and we&apos;ll notify you if a slot opens up.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
          >
            Join Waitlist
          </button>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 id="waitlist-modal-title" className="text-lg font-bold text-stone-900">Join the waitlist</h2>
                <p className="mt-0.5 text-sm text-stone-500">{tripTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="ml-4 shrink-0 text-stone-400 transition hover:text-stone-600"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {showSuccess ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                <p className="font-semibold text-emerald-800">You&apos;re on the waitlist!</p>
                <p className="mt-1 text-sm text-emerald-700">We&apos;ll email you if a slot opens up.</p>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </p>
              )}

              <div>
                <label htmlFor="waitlist-full-name" className="block text-sm font-medium text-stone-700">Full name</label>
                <input
                  id="waitlist-full-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="waitlist-email" className="block text-sm font-medium text-stone-700">Email</label>
                <input
                  id="waitlist-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="waitlist-phone" className="block text-sm font-medium text-stone-700">
                  Phone <span className="font-normal text-stone-500">(optional)</span>
                </label>
                <input
                  id="waitlist-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="09XX XXX XXXX"
                />
              </div>

              <div>
                <label htmlFor="waitlist-slots" className="block text-sm font-medium text-stone-700">Slots needed</label>
                <input
                  id="waitlist-slots"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={slots}
                  onChange={(e) => setSlots(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-trailhead py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Joining…" : "Join Waitlist"}
              </button>
            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
