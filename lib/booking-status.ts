// Canonical booking-status sets, named by intent. Use these instead of inline
// status-array literals so the meaning of each set is documented in one place
// and call sites that mean the same thing stay in sync.
//
// Note: the refund-queue status sets used by the Deno edge functions
// (["owed","failed","manual","exhausted"] and friends) are a separate domain on
// the refunds table and are intentionally not represented here.

// Bookings that are live from the ORIGINAL booker's point of view: paid or
// committed (confirmed, pending) plus mid-payment holds (payment_pending).
// NOT the full set of slot-consuming bookings: transferred and no_show rows
// also still hold their slot (see SLOT_CONSUMING_STATUSES). Use this for
// actions aimed at the booker relationship (cancel sweep targets, booker
// notifications), not for slot arithmetic.
export const ACTIVE_BOOKING_STATUSES = ["confirmed", "pending", "payment_pending"] as const;

// Every status whose booking currently consumes a slot, derived from the
// decrement/restore machinery rather than intuition:
//   - The ONLY decrement is book_slot_and_create_booking, and every booking is
//     created through it with status payment_pending. So every row starts life
//     holding its slots.
//   - Slots are given back ONLY when a row is cancelled (cancelBooking,
//     cancel_and_restore_slot, cancelTrip, rejectOrganizer, partial cancel for
//     the cancelled portion), rejected (updateBookingStatus), or deleted
//     (createBooking rollback paths).
//   - transferred NEVER restores: the replacement takes the exact slot
//     (markAsTransferred), so the transferred row is the slot's only
//     representation in the bookings table.
//   - no_show NEVER restores: the slot was consumed through the trip date and
//     is never reopened.
// Therefore: everything except cancelled and rejected. Use this set whenever
// computing how many slots a trip has tied up (e.g. recomputing
// remaining_slots or validating a total_slots reduction).
export const SLOT_CONSUMING_STATUSES = ["confirmed", "pending", "payment_pending", "transferred", "no_show"] as const;

// Paid/committed bookings only, excluding mid-payment holds (payment_pending).
// Use when an action only makes sense for a booking someone has actually paid for.
export const SLOT_HOLDING_STATUSES = ["confirmed", "pending"] as const;

// Bookings eligible for payout / treated as having taken place on a past trip.
export const ATTENDED_STATUSES = ["confirmed", "no_show", "transferred"] as const;

// The statuses swept into the cancel-and-refund update when a WHOLE trip is
// cancelled (organizer cancelTrip, admin rejectOrganizer). This is
// ACTIVE_BOOKING_STATUSES plus "transferred": when the trip itself is cancelled,
// a transferred booking must be refunded to the ORIGINAL payer and transitioned
// to "cancelled" so it drops out of ATTENDED_STATUSES payout eligibility.
// Deliberately separate from ACTIVE_BOOKING_STATUSES, which slot-freeing and
// voluntary-cancel paths use and where "transferred" must stay excluded (a
// transferred slot is consumed by the replacement, and a voluntary cancel of a
// transferred booking is never refundable).
export const TRIP_CANCELLATION_REFUND_STATUSES = ["confirmed", "pending", "payment_pending", "transferred"] as const;
