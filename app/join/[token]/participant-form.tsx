"use client";

import { useActionState } from "react";
import { confirmParticipant } from "@/app/actions/participant";

type MeetingPoint = { location: string; time: string };

type Props = {
  token: string;
  meetingPoints: MeetingPoint[];
  waiverText: string;
};

export function ParticipantForm({ token, meetingPoints, waiverText }: Props) {
  const [state, action, pending] = useActionState(confirmParticipant, null);

  if (state && "success" in state) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <h2 className="mt-4 text-lg font-bold text-emerald-900">You&apos;re all set!</h2>
        <p className="mt-2 text-sm text-emerald-700">
          Your details have been saved. See you on the trail!
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {state && "error" in state && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
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
          required
          className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
          Emergency contact
        </p>
        <div>
          <label htmlFor="emergency_contact_name" className="block text-sm font-medium text-stone-700">
            Name
          </label>
          <input
            id="emergency_contact_name"
            name="emergency_contact_name"
            type="text"
            required
            placeholder="Full name"
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
        </div>
        <div>
          <label htmlFor="emergency_contact_phone" className="block text-sm font-medium text-stone-700">
            Phone number
          </label>
          <input
            id="emergency_contact_phone"
            name="emergency_contact_phone"
            type="tel"
            required
            placeholder="+63 9XX XXX XXXX"
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
        </div>
      </div>

      {meetingPoints.length > 0 && (
        <div>
          <label htmlFor="meeting_point" className="block text-sm font-medium text-stone-700">
            Pickup point
          </label>
          <select
            id="meeting_point"
            name="meeting_point"
            required
            className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
          >
            <option value="">Select a pickup point…</option>
            {meetingPoints.map((mp) => (
              <option key={mp.location} value={mp.location}>
                {mp.location}{mp.time ? ` · ${mp.time}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="medical_notes" className="block text-sm font-medium text-stone-700">
          Medical conditions or allergies{" "}
          <span className="text-stone-400">(optional)</span>
        </label>
        <textarea
          id="medical_notes"
          name="medical_notes"
          rows={2}
          placeholder="Any conditions or allergies the organizer should know about?"
          className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-stone-700">Waiver</p>
        <div className="max-h-40 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-relaxed text-stone-600">
          {waiverText}
        </div>
        <label className="mt-3 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="waiver_accepted"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
          <span className="text-xs leading-relaxed text-stone-600">
            I understand the risks of this outdoor activity and agree to participate at my own risk. I have read and agree to the cancellation policy.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Saving…" : "Confirm my spot"}
      </button>
    </form>
  );
}
