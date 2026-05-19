"use client";

import { useActionState } from "react";
import { saveProfile } from "@/app/actions/profile";

export function ProfileForm({ birthdate }: { birthdate: string | null }) {
  const [state, action, pending] = useActionState(saveProfile, null);

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
          defaultValue={birthdate ?? ""}
          className="mt-1.5 w-full max-w-xs rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
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
