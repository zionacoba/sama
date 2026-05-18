"use client";

import { useActionState } from "react";
import { applyToBeOrganizer } from "@/app/actions/organizer";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";

export function ApplyForm() {
  const [state, action, pending] = useActionState(applyToBeOrganizer, null);

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-stone-700">
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          className={inputClass}
          placeholder="Juan dela Cruz"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-stone-700">
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          className={inputClass}
          placeholder="+63 9XX XXX XXXX"
        />
      </div>

      <div>
        <label htmlFor="bio" className="block text-sm font-medium text-stone-700">
          Bio
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          Tell us about your experience organizing outdoor trips.
        </p>
        <textarea
          id="bio"
          name="bio"
          required
          rows={5}
          className={`${inputClass} resize-none`}
          placeholder="I've been guiding hikes in Benguet for 5 years…"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
