import { describe, expect, it } from "vitest";
import {
  summarizeTripSlots,
  type SlotSummaryBookingRow,
} from "@/lib/trip-slot-summary";
import { SLOT_CONSUMING_STATUSES } from "@/lib/booking-status";

// Helper: a paid single-slot confirmed booking, the most common row shape.
// Tests override just the fields under test.
function row(overrides: Partial<SlotSummaryBookingRow>): SlotSummaryBookingRow {
  return {
    status: "confirmed",
    slots: 1,
    amount_due: 1000,
    total_amount: 1000,
    ...overrides,
  };
}

describe("summarizeTripSlots", () => {
  it("pins the slot-consuming set: everything except cancelled and rejected", () => {
    expect([...SLOT_CONSUMING_STATUSES]).toEqual([
      "confirmed",
      "pending",
      "payment_pending",
      "transferred",
      "no_show",
    ]);
  });

  it("counts confirmed, transferred, and no_show slots; excludes cancelled and rejected", () => {
    const { consumedSlots } = summarizeTripSlots([
      row({ status: "confirmed", slots: 2 }),
      row({ status: "transferred" }),
      row({ status: "no_show", slots: 3 }),
      row({ status: "cancelled", slots: 5 }),
      row({ status: "rejected", slots: 4 }),
    ]);
    expect(consumedSlots).toBe(6);
  });

  it("counts payment_pending holds as consumed (decremented at creation, not yet restored)", () => {
    const { consumedSlots } = summarizeTripSlots([
      row({ status: "payment_pending", slots: 2 }),
      row({ status: "pending" }),
    ]);
    expect(consumedSlots).toBe(3);
  });

  it("shrink guard: consumedSlots exceeds the active-only sum when a transfer exists, blocking a reduction the old count would allow", () => {
    // total_slots 10, 9 confirmed + 1 transferred. The old ACTIVE-only count
    // said 9 booked, letting the organizer shrink to 9 and mask an oversell.
    const summary = summarizeTripSlots([
      row({ slots: 9 }),
      row({ status: "transferred" }),
    ]);
    expect(summary.consumedSlots).toBe(10);
    const requestedTotalSlots = 9;
    expect(requestedTotalSlots < summary.consumedSlots).toBe(true);
  });

  it("a trip whose only booking is transferred still has a live booking, so it cannot be drafted", () => {
    const summary = summarizeTripSlots([row({ status: "transferred" })]);
    expect(summary.activeBookingCount).toBe(0);
    expect(summary.liveBookingCount).toBe(1);
  });

  it("no_show does not count as live (past trip), but active statuses and transferred do", () => {
    const summary = summarizeTripSlots([
      row({ status: "no_show" }),
      row({ status: "confirmed" }),
      row({ status: "payment_pending" }),
      row({ status: "transferred" }),
    ]);
    expect(summary.liveBookingCount).toBe(3);
  });

  it("activeBookingCount and pendingBalanceCount keep their ACTIVE-only semantics", () => {
    const summary = summarizeTripSlots([
      // Active with an outstanding balance: counted by both.
      row({ status: "confirmed", amount_due: 400, total_amount: 1000 }),
      // Active, fully paid: active only.
      row({ status: "pending" }),
      // Transferred with an outstanding balance: neither (settles off-platform).
      row({ status: "transferred", amount_due: 400, total_amount: 1000 }),
      // No-show with an outstanding balance: neither.
      row({ status: "no_show", amount_due: 400, total_amount: 1000 }),
    ]);
    expect(summary.activeBookingCount).toBe(2);
    expect(summary.pendingBalanceCount).toBe(1);
  });

  it("treats null slots as 0 and compares numeric-string amounts numerically", () => {
    const summary = summarizeTripSlots([
      row({ slots: null }),
      row({ status: "pending", slots: 2, amount_due: "500.00", total_amount: "1000.00" }),
    ]);
    expect(summary.consumedSlots).toBe(2);
    expect(summary.pendingBalanceCount).toBe(1);
  });

  it("returns all zeroes for no bookings", () => {
    expect(summarizeTripSlots([])).toEqual({
      consumedSlots: 0,
      activeBookingCount: 0,
      pendingBalanceCount: 0,
      liveBookingCount: 0,
    });
  });
});
