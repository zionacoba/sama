"use client";

import { useActionState } from "react";
import { applyToBeOrganizer } from "@/app/actions/organizer";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";
const labelClass = "block text-sm font-medium text-stone-700";

const ACTIVITY_TYPES = ["Hiking", "Freediving", "Beach & Island"] as const;

export function ApplyForm({
  defaultFullName,
  defaultPhone,
  defaultPersonalFacebookUrl,
}: {
  defaultFullName?: string | null;
  defaultPhone?: string | null;
  defaultPersonalFacebookUrl?: string | null;
}) {
  const [state, action, pending] = useActionState(applyToBeOrganizer, null);

  if (state && "success" in state) {
    return (
      <div className="text-center">
        <p className="text-4xl">⏳</p>
        <h2 className="mt-4 text-xl font-bold text-stone-900">Application submitted!</h2>
        <p className="mt-2 text-sm text-stone-600">
          We&apos;ll review it and get back to you within a few days.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {"error" in (state ?? {}) && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {(state as { error: string }).error}
        </p>
      )}

      <p className="text-sm text-stone-600 mb-2">
        This takes about 5 minutes. I personally review every application and will be in touch within a few days.
      </p>
      <p className="text-xs text-stone-500 mb-4">Fields marked with <span className="text-red-500">*</span> are required.</p>

      <div>
        <label htmlFor="full_name" className={labelClass}>
          Full name <span className="text-red-500">*</span>
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          defaultValue={defaultFullName ?? undefined}
          className={inputClass}
          placeholder="Juan dela Cruz"
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone number <span className="text-red-500">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          defaultValue={defaultPhone ?? undefined}
          className={inputClass}
          placeholder="09XX XXX XXXX"
        />
      </div>

      <div>
        <label htmlFor="display_name" className={labelClass}>
          Your organizer name <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500">The name joiners will see on your trips and profile. Can be your own name, a club name, or a trail name.</p>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          className={inputClass}
          placeholder="e.g. Summit Seekers PH, Pekeng Mountaineer"
        />
      </div>

      <div>
        <label htmlFor="bio" className={labelClass}>
          Bio <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          Tell us about your experience organizing outdoor trips.
        </p>
        <textarea
          id="bio"
          name="bio"
          required
          rows={4}
          className={`${inputClass} resize-none`}
          placeholder="I've been guiding hikes in Benguet for 5 years…"
        />
      </div>

      <div>
        <p className={labelClass}>Activity types you run <span className="text-red-500">*</span></p>
        <div className="mt-2 space-y-2">
          {ACTIVITY_TYPES.map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="activity_types"
                value={type}
                className="h-4 w-4 rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30"
              />
              <span className="text-sm text-stone-700">{type}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="years_of_experience" className={labelClass}>
          Years of experience <span className="text-red-500">*</span>
        </label>
        <input
          id="years_of_experience"
          name="years_of_experience"
          type="number"
          required
          min={1}
          className={inputClass}
          placeholder="5"
        />
      </div>

      <div>
        <label htmlFor="trips_per_month" className={labelClass}>
          On average, how many trips do you organize per month? <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500 flex items-start gap-1">
          <span>ℹ</span>
          <span>This is just an estimate. No minimum required — we welcome organizers at all activity levels.</span>
        </p>
        <select
          id="trips_per_month"
          name="trips_per_month"
          required
          className={inputClass}
          defaultValue=""
        >
          <option value="" disabled>Select an option</option>
          <option value="less_than_1">Less than 1 (occasional, a few times a year)</option>
          <option value="1_to_2">1 to 2 per month</option>
          <option value="3_to_5">3 to 5 per month</option>
          <option value="6_to_10">6 to 10 per month</option>
          <option value="more_than_10">More than 10 per month</option>
        </select>
      </div>

      <div>
        <label htmlFor="operating_locations" className={labelClass}>
          Where do you usually run your trips? <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500 flex items-start gap-1">
          <span>ℹ</span>
          <span>No need to be exhaustive — just give us a sense of where you operate and the types of destinations you cover.</span>
        </p>
        <textarea
          id="operating_locations"
          name="operating_locations"
          required
          rows={3}
          className={`${inputClass} resize-none`}
          placeholder="e.g. Batangas for freediving, Mt. Pulag and Mt. Batulao for hiking, occasionally Cebu and Palawan"
        />
      </div>

      <div>
        <p className={`${labelClass} mb-2`}>
          Emergency / First Aid certified? <span className="font-normal text-stone-400">(optional)</span>
        </p>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="emergency_certified"
            className="mt-0.5 h-4 w-4 rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
          <span className="text-sm text-stone-600">
            I have a Basic Life Support or First Aid certification
          </span>
        </label>
      </div>

      <div>
        <label htmlFor="personal_facebook_url" className={labelClass}>
          Personal Facebook profile <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500">Private. Only used by Sama to contact you directly and add you to organizer group chats.</p>
        <input
          id="personal_facebook_url"
          name="personal_facebook_url"
          type="url"
          required
          defaultValue={defaultPersonalFacebookUrl ?? undefined}
          className={inputClass}
          placeholder="https://facebook.com/yourname"
        />
      </div>

      <div>
        <label htmlFor="organizer_facebook_url" className={labelClass}>
          Facebook Page for your trips <span className="text-red-500">*</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500">Public. This is the link joiners will use to contact you from your trip pages. If you don&apos;t have a separate organizer page, your personal profile link is fine.</p>
        <input
          id="organizer_facebook_url"
          name="organizer_facebook_url"
          type="url"
          required
          className={inputClass}
          placeholder="https://facebook.com/yourpage"
        />
      </div>

      <div>
        <label htmlFor="instagram" className={labelClass}>
          Instagram <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500">Your personal or organizer Instagram. Optional.</p>
        <input
          id="instagram"
          name="instagram"
          type="text"
          className={inputClass}
          placeholder="@yourhandle or https://instagram.com/yourhandle"
        />
      </div>

      <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="terms_agreed"
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 accent-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
          <span className="text-xs leading-relaxed text-stone-600">
            I agree to Sama&apos;s{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-trailhead">Terms of Service</a>
            {" "}and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-trailhead">Privacy Policy</a>. <span className="text-red-500">*</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="accuracy_confirmed"
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 accent-trailhead focus:ring-2 focus:ring-trailhead/30"
          />
          <span className="text-xs leading-relaxed text-stone-600">
            I confirm that all information provided is accurate and that I am authorized to organize outdoor trips in the Philippines. <span className="text-red-500">*</span>
          </span>
        </label>
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
