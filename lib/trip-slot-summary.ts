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
