"use client";

import { useActionState, useState } from "react";
import { saveEmergencyContact } from "@/app/actions/profile";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/20";

export function EmergencyContactPrompt() {
  const [skipped, setSkipped] = useState(false);
  const [state, action, pending] = useActionState(saveEmergencyContact, null);

  if (skipped || (state && "success" in state)) return null;

  return (
    <div className="mt-8 w-full rounded-2xl border border-stone-200 bg-stone-50 px-5 py-5 text-left">
      <h2 className="text-sm font-semibold text-stone-900">
        Save an emergency contact for future bookings
      </h2>
      <p className="mt-1 text-xs text-stone-500">
        Your organizer may need to reach someone in case of an emergency. You only need to do this once.
      </p>

      {state && "error" in state && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {state.error}
        </p>
      )}

      <form action={action} className="mt-4 space-y-3">
        <div>
          <label htmlFor="ec-name" className="mb-1 block text-xs font-medium text-stone-700">
            Contact name
          </label>
          <input
            id="ec-name"
            name="emergency_contact_name"
            type="text"
            required
            placeholder="e.g. Maria Santos"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="ec-phone" className="mb-1 block text-xs font-medium text-stone-700">
            Contact phone
          </label>
          <input
            id="ec-phone"
            name="emergency_contact_phone"
            type="tel"
            required
            placeholder="09XX XXX XXXX"
            className={inputClass}
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="text-sm text-stone-400 underline-offset-4 hover:text-stone-600 hover:underline"
          >
            Skip for now
          </button>
        </div>
      </form>
    </div>
  );
}
