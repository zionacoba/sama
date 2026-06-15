"use client";

import { useActionState } from "react";
import { saveUserProfile } from "@/app/actions/profile";

type Props = {
  firstName: string;
  lastName: string;
  nickname: string | null;
  pronouns: string | null;
  address: string | null;
  email: string;
  phone: string | null;
  facebookUrl: string | null;
};

export function ProfileForm({ firstName, lastName, nickname, pronouns, address, email, phone, facebookUrl }: Props) {
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="first_name" className="block text-sm font-medium text-stone-700">
            First name
          </label>
          <input
            id="first_name"
            name="first_name"
            type="text"
            required
            defaultValue={firstName}
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
        </div>
        <div>
          <label htmlFor="last_name" className="block text-sm font-medium text-stone-700">
            Last name
          </label>
          <input
            id="last_name"
            name="last_name"
            type="text"
            required
            defaultValue={lastName}
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
        </div>
      </div>

      <div>
        <label htmlFor="nickname" className="block text-sm font-medium text-stone-700">
          Nickname / preferred name <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <input
          id="nickname"
          name="nickname"
          type="text"
          defaultValue={nickname ?? ""}
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
        <p className="mt-1 text-xs text-stone-500">This is what organizers and the community will call you.</p>
      </div>

      <div>
        <label htmlFor="pronouns" className="block text-sm font-medium text-stone-700">
          Pronouns <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <input
          id="pronouns"
          name="pronouns"
          type="text"
          defaultValue={pronouns ?? ""}
          placeholder="e.g. she/her, he/him, they/them"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
        <p className="mt-1 text-xs text-stone-500">Optional. Only visible to organizers.</p>
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
          placeholder="09XX XXX XXXX"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div>
        <label htmlFor="address" className="block text-sm font-medium text-stone-700">
          Address <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <input
          id="address"
          name="address"
          type="text"
          defaultValue={address ?? ""}
          placeholder="City, Province"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
        <p className="mt-1 text-xs text-stone-500">Optional. Used for trip coordination.</p>
      </div>

      <div>
        <label htmlFor="facebook_url" className="block text-sm font-medium text-stone-700">
          Facebook profile URL <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <input
          id="facebook_url"
          name="facebook_url"
          type="url"
          defaultValue={facebookUrl ?? ""}
          placeholder="https://facebook.com/yourname"
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
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
