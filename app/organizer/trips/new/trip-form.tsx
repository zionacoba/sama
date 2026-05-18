"use client";

import { useActionState } from "react";
import { createTrip } from "@/app/actions/trip";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";

const labelClass = "block text-sm font-medium text-stone-700";

export function TripForm() {
  const [state, action, pending] = useActionState(createTrip, null);

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      {/* Title */}
      <div>
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          className={inputClass}
          placeholder="Mt. Pulag Summit Hike"
        />
      </div>

      {/* Activity type + Difficulty */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="activity_type" className={labelClass}>
            Activity type
          </label>
          <select id="activity_type" name="activity_type" required className={inputClass}>
            <option value="">Select activity…</option>
            <option value="Hiking">Hiking</option>
            <option value="Camping">Camping</option>
            <option value="Freediving">Freediving</option>
            <option value="Island Hopping">Island Hopping</option>
            <option value="Surfing">Surfing</option>
          </select>
        </div>
        <div>
          <label htmlFor="difficulty" className={labelClass}>
            Difficulty
          </label>
          <select id="difficulty" name="difficulty" required className={inputClass}>
            <option value="">Select difficulty…</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
            <option value="Expert">Expert</option>
          </select>
        </div>
      </div>

      {/* Destination */}
      <div>
        <label htmlFor="destination" className={labelClass}>
          Destination
        </label>
        <input
          id="destination"
          name="destination"
          type="text"
          required
          className={inputClass}
          placeholder="Mt. Pulag, Benguet"
        />
      </div>

      {/* Date + Price + Slots */}
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor="date_start" className={labelClass}>
            Date
          </label>
          <input
            id="date_start"
            name="date_start"
            type="date"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="price" className={labelClass}>
            Price per person (PHP)
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="0"
            step="1"
            required
            className={inputClass}
            placeholder="2500"
          />
        </div>
        <div>
          <label htmlFor="total_slots" className={labelClass}>
            Total slots
          </label>
          <input
            id="total_slots"
            name="total_slots"
            type="number"
            min="1"
            step="1"
            required
            className={inputClass}
            placeholder="20"
          />
        </div>
      </div>

      {/* Meeting point */}
      <div>
        <label htmlFor="meeting_point" className={labelClass}>
          Meeting point
        </label>
        <input
          id="meeting_point"
          name="meeting_point"
          type="text"
          required
          className={inputClass}
          placeholder="Km. 61, Halsema Highway, Bokod"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          className={`${inputClass} resize-none`}
          placeholder="Describe the trip experience, highlights, and what participants can expect…"
        />
      </div>

      {/* What's included */}
      <div>
        <label htmlFor="includes" className={labelClass}>
          What&apos;s included
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          List items separated by new lines (e.g. Guide fee, Camping gear, Meals)
        </p>
        <textarea
          id="includes"
          name="includes"
          rows={4}
          className={`${inputClass} mt-1.5 resize-none`}
          placeholder={"Guide fee\nCamping gear\nBreakfast and dinner"}
        />
      </div>

      {/* What to bring */}
      <div>
        <label htmlFor="what_to_bring" className={labelClass}>
          What to bring
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          List items separated by new lines (e.g. Sleeping bag, Rain jacket, Headlamp)
        </p>
        <textarea
          id="what_to_bring"
          name="what_to_bring"
          rows={4}
          className={`${inputClass} mt-1.5 resize-none`}
          placeholder={"Sleeping bag\nRain jacket\nHeadlamp\nExtra clothes"}
        />
      </div>

      <div className="flex items-center justify-end gap-4 border-t border-stone-100 pt-6">
        <a
          href="/organizer/dashboard"
          className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Creating trip…" : "Create trip"}
        </button>
      </div>
    </form>
  );
}
