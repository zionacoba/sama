"use client";

import { useState, useTransition } from "react";
import { respondToReview } from "@/app/actions/review";

export function RespondToReviewForm({
  reviewId,
  currentResponse,
}: {
  reviewId: number;
  currentResponse: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentResponse);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await respondToReview(reviewId, value);
      if ("error" in result) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-xs font-medium text-stone-400 underline-offset-2 transition hover:text-trailhead hover:underline"
      >
        {currentResponse ? "Edit response" : "Reply"}
      </button>
    );
  }

  return (
    <div className="mt-3">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Write your response…"
        className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-trailhead focus:outline-none"
      />
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="rounded-lg bg-trailhead px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-trailhead-dark disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save response"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => { setOpen(false); setValue(currentResponse); setError(null); }}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-400 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
