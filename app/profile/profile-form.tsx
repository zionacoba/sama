"use client";

import { useActionState } from "react";
import { saveUserProfile } from "@/app/actions/profile";

type Props = {
  fullName: string;
  email: string;
};

export function ProfileForm({ fullName, email }: Props) {
  const [state, action, pending] = useActionState(saveUserProfile, null);

  return (
    <form action={action} className="space-y-4">
      {state && "error" in state && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state && "success" in state && (
        <p role="status" className="rounded-lg border border-trailhead/30 bg-trailhead-muted px-3 py-2 text-sm text-trailhead">
          Profile updated.
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
          required
          defaultValue={fullName}
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-stone-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          readOnly
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-400 outline-none cursor-not-allowed"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
