"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { publishTrip } from "@/app/actions/trip";
import { ShareButton } from "@/app/components/share-button";
import { CancelTripButton } from "@/app/components/cancel-trip-button";
import { formatPeso } from "@/lib/format";

export type OrganizerTrip = {
  id: string | number;
  slug: string;
  title: string;
  activity_type: string | null;
  difficulty: string;
  date_start: string;
  price: number;
  total_slots: number;
  remaining_slots: number;
  status: string;
  is_template: boolean | null;
  template_id: string | null;
};

export type TripCounts = { pending: number; confirmed: number };

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

export function formatPrice(price: number) {
  return formatPeso(price);
}

export function tripBadge(status: string, dateStart: string, remainingSlots: number) {
  if (status === "cancelled") return { label: "Cancelled", cls: "bg-red-100 text-red-700" };
  if (status === "draft") return { label: "Draft", cls: "bg-stone-100 text-stone-500" };
  const now = new Date().toISOString().slice(0, 10);
  if (dateStart < now) return { label: "Past", cls: "bg-stone-100 text-stone-500" };
  if (remainingSlots === 0) return { label: "Full", cls: "bg-amber-100 text-amber-700" };
  return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
}

export function TripRow({ trip: initialTrip, counts }: { trip: OrganizerTrip; counts: TripCounts }) {
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const status = optimisticStatus ?? initialTrip.status;
  const badge = tripBadge(status, initialTrip.date_start, initialTrip.remaining_slots);
  const slotsBooked = initialTrip.total_slots - initialTrip.remaining_slots;
  const today = new Date().toISOString().slice(0, 10);
  const canCancel = status === "active" && initialTrip.date_start >= today;
  const totalBookings = counts.pending + counts.confirmed;
  const isDraft = status === "draft";
  const isCancelled = status === "cancelled";

  function handlePublish() {
    setError(null);
    setOptimisticStatus("active");
    startTransition(async () => {
      const result = await publishTrip(initialTrip.slug);
      if ("error" in result) {
        setOptimisticStatus(null);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="font-semibold text-stone-900">{initialTrip.title}</span>
          {counts.pending > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {counts.pending} pending
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-stone-500">
          {formatDate(initialTrip.date_start)} · {formatPrice(initialTrip.price)} · {slotsBooked}/{initialTrip.total_slots} slots filled
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {isDraft ? (
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPending}
            className="rounded-lg bg-trailhead px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Publishing…" : "Publish"}
          </button>
        ) : (
          <Link
            href={`/organizer/trips/${initialTrip.slug}/bookings`}
            className="rounded-lg bg-trailhead px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-trailhead-dark"
          >
            View bookings
          </Link>
        )}
        {!isCancelled && (
          <Link
            href={`/organizer/trips/${initialTrip.slug}/edit`}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
          >
            Edit
          </Link>
        )}
        {!isCancelled && (
          <ShareButton
            url={`/trips/${initialTrip.slug}`}
            title={initialTrip.title}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
          />
        )}
        {canCancel && (
          <CancelTripButton
            tripSlug={initialTrip.slug}
            tripTitle={initialTrip.title}
          />
        )}
      </div>
    </div>
  );
}

export function TripRunRow({ run: initialRun, idx }: { run: OrganizerTrip; idx: number }) {
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const status = optimisticStatus ?? initialRun.status;
  const badge = tripBadge(status, initialRun.date_start, initialRun.remaining_slots);
  const slotsBooked = initialRun.total_slots - initialRun.remaining_slots;
  const isDraft = status === "draft";

  function handlePublish() {
    setError(null);
    setOptimisticStatus("active");
    startTransition(async () => {
      const result = await publishTrip(initialRun.slug);
      if ("error" in result) {
        setOptimisticStatus(null);
        setError(result.error);
      }
    });
  }

  return (
    <div className={`flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between ${idx !== 0 ? "border-t border-stone-100" : ""} bg-stone-50`}>
      <div className="ml-4 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
          <span className="text-sm font-medium text-stone-700">{formatDate(initialRun.date_start)}</span>
          <span className="text-xs text-stone-500">{formatPrice(initialRun.price)} · {slotsBooked}/{initialRun.total_slots} slots filled</span>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2 sm:ml-0">
        {isDraft ? (
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPending}
            className="rounded-lg bg-trailhead px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Publishing…" : "Publish"}
          </button>
        ) : (
          <Link
            href={`/organizer/trips/${initialRun.slug}/bookings`}
            className="rounded-lg bg-trailhead px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-trailhead-dark"
          >
            View bookings
          </Link>
        )}
        <Link
          href={`/organizer/trips/${initialRun.slug}/edit`}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
        >
          Edit
        </Link>
        <ShareButton
          url={`/trips/${initialRun.slug}`}
          title={initialRun.title}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
        />
      </div>
    </div>
  );
}
