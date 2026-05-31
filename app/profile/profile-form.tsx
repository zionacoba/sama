"use client";

import { useActionState, useState } from "react";
import { saveUserProfile } from "@/app/actions/profile";

type Props = {
  fullName: string;
  email: string;
  phone: string | null;
  facebookUrl: string | null;
};

export function ProfileForm({ fullName, email, phone, facebookUrl }: Props) {
  const [fbValue, setFbValue] = useState(facebookUrl ?? "");
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

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-stone-700">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={phone ?? ""}
          placeholder="+63 9xx xxx xxxx"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div>
        <label htmlFor="facebook_url" className="block text-sm font-medium text-stone-700">
          Facebook profile URL <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <input
          id="facebook_url"
          name="facebook_url"
          type="url"
          value={fbValue}
          onChange={(e) => setFbValue(e.target.value)}
          placeholder="https://facebook.com/yourname"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
        {fbValue && !fbValue.startsWith("https://facebook.com/") && !fbValue.startsWith("https://www.facebook.com/") && (
          <p className="mt-1 text-xs text-amber-600">Should start with https://facebook.com/ or https://www.facebook.com/</p>
        )}
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
