"use client";

import { useActionState, useState } from "react";
import { submitReview } from "@/app/actions/review";

type Props = {
  tripId: number;
  tripSlug: string;
  bookingId: number;
};

export function BookingReviewForm({ tripId, tripSlug, bookingId }: Props) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(submitReview, null);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);

  if (state && "success" in state) {
    return <p className="mt-auto pt-1 text-xs text-stone-400">Review submitted ✓</p>;
  }

  if (!open) {
    return (
      <div className="mt-auto pt-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex rounded-lg border border-trailhead px-3.5 py-1.5 text-xs font-semibold text-trailhead transition hover:bg-trailhead hover:text-white"
        >
          Leave a Review
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 border-t border-stone-100 pt-3">
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="trip_slug" value={tripSlug} />
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />

      {state && "error" in state && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {state.error}
        </p>
      )}

      <div>
        <p className="text-xs font-medium text-stone-700">Rating</p>
        <div className="mt-1 flex gap-0.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} star${star !== 1 ? "s" : ""}`}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              className="text-2xl leading-none transition-transform hover:scale-110 focus:outline-none"
            >
              <span className={star <= (hovered || rating) ? "text-amber-400" : "text-stone-200"}>
                ★
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor={`review-comment-${bookingId}`} className="block text-xs font-medium text-stone-700">
          Comment
        </label>
        <textarea
          id={`review-comment-${bookingId}`}
          name="body"
          required
          rows={3}
          placeholder="Share your experience…"
          className="mt-1 w-full resize-none rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:border-stone-400"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending || rating === 0}
          className="rounded-lg bg-trailhead px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
  );
}
