"use client";

import { useActionState } from "react";
import { updateOrganizerProfile } from "@/app/actions/organizer";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";
const labelClass = "block text-sm font-medium text-stone-700";

type OrganizerData = {
  display_name: string | null;
  full_name: string;
  phone: string;
  bio: string;
  photo_url: string | null;
};

export function ProfileForm({ organizer }: { organizer: OrganizerData }) {
  const [state, action, pending] = useActionState(updateOrganizerProfile, null);

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="display_name" className={labelClass}>
          Display name
        </label>
        <p className="mt-0.5 text-xs text-stone-500">Your public-facing name — club, brand, or trail name.</p>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          defaultValue={organizer.display_name ?? ""}
          className={inputClass}
          placeholder="e.g. Summit Seekers PH, Pekeng Mountaineer"
        />
      </div>

      <div>
        <label htmlFor="full_name" className={labelClass}>
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={organizer.full_name}
          className={inputClass}
          placeholder="Juan dela Cruz"
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={organizer.phone}
          className={inputClass}
          placeholder="+63 9XX XXX XXXX"
        />
      </div>

      <div>
        <label htmlFor="bio" className={labelClass}>
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          required
          rows={5}
          defaultValue={organizer.bio}
          className={`${inputClass} resize-none`}
          placeholder="Tell adventurers about your experience…"
        />
      </div>

      <div>
        <label htmlFor="photo_url" className={labelClass}>
          Profile photo URL <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <input
          id="photo_url"
          name="photo_url"
          type="url"
          defaultValue={organizer.photo_url ?? ""}
          className={inputClass}
          placeholder="https://…"
        />
      </div>

      <div className="flex items-center justify-end gap-4 border-t border-stone-100 pt-4">
        <a href="/organizer/dashboard" className="text-sm font-medium text-stone-600 transition hover:text-stone-900">
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
