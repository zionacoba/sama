"use client";

import { useState, useTransition } from "react";
import { updatePayoutReference } from "@/app/actions/admin";

export function EditRemittanceReferenceButton({
  payoutId,
  currentReference,
}: {
  payoutId: string;
  currentReference: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(currentReference ?? "");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updatePayoutReference(formData);
      } catch {
        // redirect throws, so catch is a no-op
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="ml-1.5 text-xs font-medium text-trailhead underline-offset-2 hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="inline-flex items-center gap-1">
      <input type="hidden" name="payoutId" value={payoutId} />
      <input
        type="text"
        name="remittanceReference"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        autoFocus
        className="w-36 rounded border border-stone-300 px-1.5 py-0.5 text-xs text-stone-900 focus:border-trailhead focus:outline-none"
      />
      <button
        type="submit"
        disabled={isPending || !value.trim()}
        className="rounded bg-trailhead/10 px-1.5 py-0.5 text-xs font-semibold text-trailhead hover:bg-trailhead/20 disabled:opacity-50"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => { setEditing(false); setValue(currentReference ?? ""); }}
        className="text-xs text-stone-400 hover:text-stone-700"
      >
        Cancel
      </button>
    </form>
  );
}
