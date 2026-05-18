"use client";

import { useActionState, useState } from "react";
import { submitReview } from "@/app/actions/review";

type ReviewFormProps = {
  tripId: number;
  tripSlug: string;
  defaultName: string;
};

export function ReviewForm({ tripId, tripSlug, defaultName }: ReviewFormProps) {
  const [state, action, pending] = useActionState(submitReview, null);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="trip_slug" value={tripSlug} />
      <input type="hidden" name="rating" value={rating} />

      {state?.error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="review-name" className="block text-sm font-medium text-stone-700">
          Your name
        </label>
        <input
          id="review-name"
          name="full_name"
          type="text"
          required
          defaultValue={defaultName}
          className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-stone-700">Rating</p>
        <div className="mt-1.5 flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star !== 1 ? "s" : ""}`}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="text-3xl leading-none transition-transform hover:scale-110 focus:outline-none"
            >
              <span
                className={
                  star <= (hovered || rating) ? "text-amber-400" : "text-stone-200"
                }
              >
                ★
              </span>
            </button>
          ))}
        </div>
        {rating === 0 && state?.error && (
          <p className="mt-1 text-xs text-red-600">Please select a rating.</p>
        )}
      </div>

      <div>
        <label htmlFor="review-body" className="block text-sm font-medium text-stone-700">
          Review
        </label>
        <textarea
          id="review-body"
          name="body"
          required
          rows={4}
          placeholder="Share your experience on this trip…"
          className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <button
        type="submit"
        disabled={pending || rating === 0}
        className="rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
