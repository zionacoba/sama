"use client";

import { useState, useTransition } from "react";
import { joinWaitlist } from "@/app/actions/waitlist";

type Props = {
  tripId: number;
  tripSlug: string;
  tripTitle: string;
  defaultName: string;
  defaultEmail: string;
  isOnWaitlist: boolean;
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
}: Props) {
  const [open, setOpen] = useState(false);
  const [joined, setJoined] = useState(initialOnWaitlist);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [slots, setSlots] = useState(1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await joinWaitlist({ tripId, tripSlug, fullName, email, phone, slots });
      if ("error" in result) {
        setError(result.error);
      } else {
        setJoined(true);
        setOpen(false);
      }
    });
  }

  if (joined) {
    return (
      <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-center">
        <p className="font-semibold text-emerald-800">You&apos;re on the waitlist!</p>
        <p className="mt-1 text-sm text-emerald-700">We&apos;ll email you if a slot opens up.</p>
      </div>
    );
  }

  return (
    <>
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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900">Join the waitlist</h2>
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

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-stone-700">Full name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700">
                  Phone <span className="font-normal text-stone-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                  placeholder="+63 9XX XXX XXXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700">Slots needed</label>
                <input
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
          </div>
        </div>
      )}
    </>
  );
}
