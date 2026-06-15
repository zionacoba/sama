"use client";

import { useState, useTransition } from "react";
import { markPayoutRemittedAction, type PendingPayout } from "@/app/actions/admin";
import { formatPeso } from "@/lib/format";

function formatCreatedAt(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function formatDestination(dest: PendingPayout["payoutDestination"]): string | null {
  if (!dest) return null;
  if (dest.payout_method === "gcash" && dest.gcash_number) {
    return `GCash ${dest.gcash_number}${dest.gcash_name ? ` (${dest.gcash_name})` : ""}`;
  }
  if (dest.payout_method === "bank_transfer" && dest.bank_account_number) {
    return `${dest.bank_name ?? "Bank"} ${dest.bank_account_number}${dest.bank_account_name ? ` (${dest.bank_account_name})` : ""}`;
  }
  return null;
}

export function PendingPayoutCard({ payout }: { payout: PendingPayout }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [networkError, setNetworkError] = useState<string | null>(null);
  const destLine = formatDestination(payout.payoutDestination);

  function handleConfirm(formData: FormData) {
    setNetworkError(null);
    startTransition(async () => {
      try {
        await markPayoutRemittedAction(formData);
      } catch {
        setNetworkError("Something went wrong. Please try again.");
        setConfirming(false);
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 shadow-sm">
      {payout.needsReconciliation && (
        <div className="border-b border-amber-300 bg-amber-100 px-5 py-3 text-sm font-medium text-amber-900">
          ⚠️ One or more bookings in this payout were cancelled after the payout was created. Review before remitting.
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-100 px-5 py-4">
        <div>
          <p className="font-semibold text-stone-900">{payout.organizerName}</p>
          <p className="text-sm text-stone-500">{payout.organizerEmail}</p>
          {destLine && (
            <p className="mt-0.5 text-sm font-medium text-stone-700">→ {destLine}</p>
          )}
          {!destLine && (
            <p className="mt-0.5 text-sm text-red-600">⚠ No destination on record — verify before sending</p>
          )}
          <p className="mt-1 text-xs text-stone-500">Created {formatCreatedAt(payout.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-trailhead">{formatPeso(payout.netAmount)}</p>
          <p className="text-xs text-stone-500">
            {payout.bookingCount} booking{payout.bookingCount !== 1 ? "s" : ""} · {formatPeso(payout.totalAmount)} gross · {formatPeso(payout.platformCommission)} commission
          </p>
        </div>
      </div>
      {networkError && (
        <p role="alert" className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {networkError}
        </p>
      )}
      <form action={handleConfirm} className="flex flex-wrap items-end gap-3 px-5 py-4">
        <input type="hidden" name="payoutId" value={payout.id} />
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-stone-600">Reference number *</label>
          <input
            type="text"
            name="remittanceReference"
            required
            placeholder="GCash ref / bank transfer ref"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/20"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-stone-600">Notes (optional)</label>
          <input
            type="text"
            name="notes"
            placeholder="Any additional notes"
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/20"
          />
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Mark as Remitted
          </button>
        ) : (
          <div className="w-full rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="font-semibold text-stone-900">Mark as remitted?</p>
            <p className="mt-1 text-sm text-stone-600">
              Confirm you have sent {formatPeso(payout.netAmount)} to {payout.organizerName}{destLine ? ` via ${destLine}` : ""}. This cannot be undone.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "Sending…" : "Confirm"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
