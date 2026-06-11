"use client";

import { useActionState, useState } from "react";
import { saveProfile } from "@/app/actions/profile";

export function ProfileForm({
  birthdate,
  emergencyContactName,
  emergencyContactPhone,
}: {
  birthdate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}) {
  const [state, action, pending] = useActionState(saveProfile, null);
  const [birthdateVal, setBirthdateVal] = useState(birthdate ?? "");
  const [ecName, setEcName] = useState(emergencyContactName ?? "");
  const [ecPhone, setEcPhone] = useState(emergencyContactPhone ?? "");

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="birthdate" className="block text-sm font-medium text-stone-700">
          Birthdate
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          Shown to trip organizers for safety and registration records.
        </p>
        <input
          id="birthdate"
          name="birthdate"
          type="date"
          value={birthdateVal}
          onChange={(e) => setBirthdateVal(e.target.value)}
          className="mt-1.5 w-full max-w-xs rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div>
        <label htmlFor="emergency_contact_name" className="block text-sm font-medium text-stone-700">
          Emergency contact name
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          Pre-filled in the booking form and shared with organizers.
        </p>
        <input
          id="emergency_contact_name"
          name="emergency_contact_name"
          type="text"
          value={ecName}
          onChange={(e) => setEcName(e.target.value)}
          placeholder="Full name"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div>
        <label htmlFor="emergency_contact_phone" className="block text-sm font-medium text-stone-700">
          Emergency contact phone
        </label>
        <input
          id="emergency_contact_phone"
          name="emergency_contact_phone"
          type="tel"
          value={ecPhone}
          onChange={(e) => setEcPhone(e.target.value)}
          placeholder="09XX XXX XXXX"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      {state && "error" in state && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state && "success" in state && (
        <p role="status" className="rounded-lg border border-trailhead/30 bg-trailhead-muted px-4 py-3 text-sm text-trailhead">
          Profile saved.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
