"use client";

import { useState, useTransition } from "react";
import { approveOrganizer } from "@/app/actions/admin";
import {
  COMMISSION_RATE_MIN_PERCENT,
  COMMISSION_RATE_MAX_PERCENT,
  parseCommissionRatePercent,
} from "@/lib/commission";

export function OrganizerApproveButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  const [rateInput, setRateInput] = useState("");
  // Non-null once the admin has clicked Approve with a valid rate; holds the
  // exact percent that Confirm will send.
  const [confirmingRate, setConfirmingRate] = useState<number | null>(null);

  function handleApproveSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = parseCommissionRatePercent(rateInput);
    if (parsed === null) return;
    setConfirmingRate(parsed);
  }

  function handleCancel() {
    setConfirmingRate(null);
    setRateInput("");
  }

  function handleConfirm() {
    if (confirmingRate === null) return;
    startTransition(async () => {
      await approveOrganizer(id, confirmingRate);
    });
  }

  if (confirmingRate !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-stone-700">
          You are approving <span className="font-semibold">{name}</span> at{" "}
          <span className="font-semibold">{confirmingRate}%</span> commission. This rate locks into
          their bookings permanently.
        </p>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Approving…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition hover:border-stone-400 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleApproveSubmit} className="flex items-center gap-1">
      <input
        type="number"
        value={rateInput}
        onChange={(e) => setRateInput(e.target.value)}
        required
        min={COMMISSION_RATE_MIN_PERCENT}
        max={COMMISSION_RATE_MAX_PERCENT}
        step={1}
        placeholder="%"
        aria-label="Commission rate percent"
        className="w-14 rounded border border-stone-200 px-1.5 py-1 text-xs text-stone-900 focus:border-trailhead focus:outline-none"
      />
      <span className="text-xs text-stone-500">%</span>
      <button
        type="submit"
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
      >
        Approve
      </button>
    </form>
  );
}
