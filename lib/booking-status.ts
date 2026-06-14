// Canonical booking-status sets, named by intent. Use these instead of inline
// status-array literals so the meaning of each set is documented in one place
// and call sites that mean the same thing stay in sync.
//
// Note: the refund-queue status sets used by the Deno edge functions
// (["owed","failed","manual","exhausted"] and friends) are a separate domain on
// the refunds table and are intentionally not represented here.

// Everything that currently holds a slot, including bookings that are mid-payment
// (payment_pending). Use when freeing or counting every slot a trip has tied up.
export const ACTIVE_BOOKING_STATUSES = ["confirmed", "pending", "payment_pending"] as const;

// Paid/committed bookings only, excluding mid-payment holds (payment_pending).
// Use when an action only makes sense for a booking someone has actually paid for.
export const SLOT_HOLDING_STATUSES = ["confirmed", "pending"] as const;

// Bookings eligible for payout / treated as having taken place on a past trip.
export const ATTENDED_STATUSES = ["confirmed", "no_show"] as const;
