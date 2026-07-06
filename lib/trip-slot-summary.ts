// Pure computation behind updateTrip's slot-integrity checks. Extracted to
// lib/ so it is unit-testable (app/actions/trip.ts is a "use server" file and
// may only export async server functions).
//
// The caller queries bookings over SLOT_CONSUMING_STATUSES (every status that
// still holds a slot; see lib/booking-status.ts for the derivation) and this
// function splits that one result set into the counters updateTrip needs.
// Rows outside SLOT_CONSUMING_STATUSES (cancelled, rejected) are ignored here
// too, so a wider result set cannot inflate any counter.
// Each counter deliberately uses a different status set:
//   - consumedSlots: SLOT_CONSUMING_STATUSES. Drives the remaining_slots
//     recompute and the "cannot shrink total_slots below what is booked"
//     guard, so it must count every slot the incremental RPC machinery has
//     decremented and not restored, including transferred (the replacement
//     holds the slot) and no_show (never restored).
//   - activeBookingCount / pendingBalanceCount: ACTIVE_BOOKING_STATUSES only,
//     matching their original semantics (booker-facing warnings and the
//     difficulty-change guard talk to the original booker; a transferred
//     row's booker is off the trip and a no_show's trip already happened).
//   - liveBookingCount: ACTIVE_BOOKING_STATUSES plus transferred. Drives the
//     active-to-draft guard: a transferred booking means a replacement is
//     still attending, so the trip must not be hidden as a draft even when no
//     ACTIVE bookings remain. no_show is excluded because it only exists on
//     past trips and does not represent someone expecting the listing.

import { ACTIVE_BOOKING_STATUSES, SLOT_CONSUMING_STATUSES } from "@/lib/booking-status";

export type SlotSummaryBookingRow = {
  status: string;
  slots: number | null;
  amount_due: number | string | null;
  total_amount: number | string | null;
};

export type TripSlotSummary = {
  consumedSlots: number;
  activeBookingCount: number;
  pendingBalanceCount: number;
  liveBookingCount: number;
};

export function summarizeTripSlots(
  bookings: SlotSummaryBookingRow[],
): TripSlotSummary {
  let consumedSlots = 0;
  let activeBookingCount = 0;
  let pendingBalanceCount = 0;
  let liveBookingCount = 0;

  for (const b of bookings) {
    if (!(SLOT_CONSUMING_STATUSES as readonly string[]).includes(b.status)) continue;

    consumedSlots += b.slots ?? 0;

    const isActive = (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(b.status);
    if (isActive) {
      activeBookingCount += 1;
      if (
        b.amount_due != null &&
        b.total_amount != null &&
        Number(b.amount_due) < Number(b.total_amount)
      ) {
        pendingBalanceCount += 1;
      }
    }
    if (isActive || b.status === "transferred") {
      liveBookingCount += 1;
    }
  }

  return { consumedSlots, activeBookingCount, pendingBalanceCount, liveBookingCount };
}

// Whether updateTrip should include remaining_slots in its trips.update() payload.
//
// remaining_slots is maintained incrementally and atomically by the RPC
// machinery (book_slot decrement, restore_slot / cancel_and_restore_slot
// restore). updateTrip reads existing.remaining_slots near the top of the
// function and does substantial other work before writing, so writing that
// value back would clobber any concurrent booking or cancel that landed in the
// window (oversell or capacity leak). The ONLY case where updateTrip legitimately
// owns remaining_slots is when total_slots actually changes on an active trip:
// there it recomputes capacity from live bookings. In every other case
// (draft/template edits, and unchanged-total active edits) it must OMIT the
// column and leave the live value untouched.
//
// (Part 2a: this predicate gates the omit. The changed-total branch still writes
// a JS-recomputed value; part 2b replaces that with an atomic SQL delta RPC so
// even the capacity-change write is race-safe.)
export function shouldWriteRemainingSlots(args: {
  isDraft: boolean;
  isTemplate: boolean;
  newTotalSlots: number;
  existingTotalSlots: number;
}): boolean {
  const { isDraft, isTemplate, newTotalSlots, existingTotalSlots } = args;
  if (isDraft || isTemplate) return false;
  return newTotalSlots !== existingTotalSlots;
}
