import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  amountJoinerPaid,
  amountSamaHolds,
  computeAppliedNet,
  computeRefundSplit,
  isPayoutEligible,
  manilaDateOf,
  payoutTimingGate,
  shouldRefundOnReject,
} from "@/lib/booking-finance";

// Helper to build the minimal booking shape these functions read. Defaults to a
// fully-paid full-payment booking; override per case.
function booking(over: Partial<Parameters<typeof computeRefundSplit>[0]> = {}) {
  return {
    payment_option: "full",
    amount_due: 10000,
    total_amount: 10000,
    balance_payment_gateway_status: null,
    balance_paymongo_payment_id: null,
    ...over,
  };
}

describe("amountJoinerPaid / amountSamaHolds", () => {
  it("fully-paid full-payment booking returns total_amount", () => {
    const b = booking({ payment_option: "full", amount_due: 10000, total_amount: 10000 });
    expect(amountJoinerPaid(b)).toBe(10000);
    expect(amountSamaHolds(b)).toBe(10000);
  });

  it("downpayment-only (balance not paid online) returns amount_due", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: null,
    });
    expect(amountJoinerPaid(b)).toBe(3000);
    expect(amountSamaHolds(b)).toBe(3000);
  });

  it("downpayment with balance paid online returns full total_amount", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: "paid",
    });
    expect(amountJoinerPaid(b)).toBe(10000);
    expect(amountSamaHolds(b)).toBe(10000);
  });

  it("downpayment-only with null amount_due coerces to 0 (no NaN)", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: null,
      total_amount: 10000,
      balance_payment_gateway_status: null,
    });
    expect(amountJoinerPaid(b)).toBe(0);
    expect(amountSamaHolds(b)).toBe(0);
  });

  it("free booking (total 0) returns 0", () => {
    const b = booking({ payment_option: "full", amount_due: 0, total_amount: 0 });
    expect(amountJoinerPaid(b)).toBe(0);
    expect(amountSamaHolds(b)).toBe(0);
  });

  it("string amounts (as Supabase numeric can arrive) are coerced", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: "3000",
      total_amount: "10000",
      balance_payment_gateway_status: null,
    });
    expect(amountJoinerPaid(b)).toBe(3000);
  });
});

describe("isPayoutEligible — transferred bookings pay out to the organizer", () => {
  it("transferred booking paid online IS payout-eligible", () => {
    expect(
      isPayoutEligible({
        status: "transferred",
        payment_gateway_status: "paid",
        total_amount: 10000,
      }),
    ).toBe(true);
  });

  it("transferred downpayment booking pays out only the downpayment Sama holds", () => {
    // Balance was never collected online (balance_payment_gateway_status null),
    // so amountSamaHolds must be the downpayment (amount_due), not the full
    // total — we never pay out a balance Sama did not collect.
    const b = {
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: null,
    };
    expect(
      isPayoutEligible({
        status: "transferred",
        payment_gateway_status: "paid",
        total_amount: b.total_amount,
      }),
    ).toBe(true);
    expect(amountSamaHolds(b)).toBe(3000);
  });
});

describe("computeRefundSplit", () => {
  it("downpayment + balance paid online splits proportionally and sums to refund", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: "paid",
      balance_paymongo_payment_id: "pay_balance",
    });
    // amountPaid = 10000, balanceAmount = 7000, full refund 10000
    const split = computeRefundSplit(b, 10000);
    expect(split.balanceRefund).toBe(7000);
    expect(split.downpaymentRefund).toBe(3000);
    expect((split.downpaymentRefund ?? 0) + split.balanceRefund).toBe(10000);
  });

  it("downpayment-only with no online balance sends all refund to downpayment", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: null,
      balance_paymongo_payment_id: null,
    });
    // amountPaid = 3000 (cash balance never refunded by Sama)
    const split = computeRefundSplit(b, 3000);
    expect(split.balanceRefund).toBe(0);
    expect(split.downpaymentRefund).toBe(3000);
  });

  it("partial refund splits proportionally and still sums to the refund", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: "paid",
      balance_paymongo_payment_id: "pay_balance",
    });
    // 50% refund of 10000 paid: balanceAmount/amountPaid = 7000/10000
    const split = computeRefundSplit(b, 5000);
    expect(split.balanceRefund).toBe(3500);
    expect(split.downpaymentRefund).toBe(1500);
    expect((split.downpaymentRefund ?? 0) + split.balanceRefund).toBe(5000);
  });

  it("divide-by-zero guard: amountPaid 0 yields no NaN/Infinity", () => {
    const b = booking({
      payment_option: "full",
      amount_due: 0,
      total_amount: 0,
      balance_payment_gateway_status: "paid",
      balance_paymongo_payment_id: "pay_balance",
    });
    const split = computeRefundSplit(b, 0);
    expect(split.balanceRefund).toBe(0);
    expect(split.downpaymentRefund).toBe(0);
    expect(Number.isFinite(split.balanceRefund)).toBe(true);
    expect(Number.isFinite(split.downpaymentRefund ?? 0)).toBe(true);
  });

  it("refundAmount null yields downpaymentRefund null, balanceRefund 0", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: "paid",
      balance_paymongo_payment_id: "pay_balance",
    });
    const split = computeRefundSplit(b, null);
    expect(split.downpaymentRefund).toBeNull();
    expect(split.balanceRefund).toBe(0);
  });

  it("no balance payment id means balance is never refunded online", () => {
    const b = booking({
      payment_option: "downpayment",
      amount_due: 3000,
      total_amount: 10000,
      balance_payment_gateway_status: "paid",
      balance_paymongo_payment_id: null,
    });
    const split = computeRefundSplit(b, 10000);
    expect(split.balanceRefund).toBe(0);
    expect(split.downpaymentRefund).toBe(10000);
  });
});

describe("computeAppliedNet", () => {
  it("one deduction fits, the other does not: applies the first, skips (rolls over) the second, not floored to 0", () => {
    // The assessment's motivating example: display used to floor
    // max(0, 100 - 160) = 0, but the apply path greedily applies only the
    // first 80 (fits) and skips the second (doesn't fit into the remaining 20).
    const result = computeAppliedNet(100, [
      { id: "d1", amount: 80 },
      { id: "d2", amount: 80 },
    ]);
    expect(result.net).toBe(20);
    expect(result.appliedDeductionIds).toEqual(["d1"]);
    expect(result.skippedDeductionIds).toEqual(["d2"]);
  });

  it("all deductions fit: applies all, net is the exact remainder", () => {
    const result = computeAppliedNet(100, [
      { id: "d1", amount: 30 },
      { id: "d2", amount: 20 },
    ]);
    expect(result.net).toBe(50);
    expect(result.appliedDeductionIds).toEqual(["d1", "d2"]);
    expect(result.skippedDeductionIds).toEqual([]);
  });

  it("no deductions fit: all skipped, net is unchanged", () => {
    const result = computeAppliedNet(50, [
      { id: "d1", amount: 80 },
      { id: "d2", amount: 60 },
    ]);
    expect(result.net).toBe(50);
    expect(result.appliedDeductionIds).toEqual([]);
    expect(result.skippedDeductionIds).toEqual(["d1", "d2"]);
  });

  it("exact fit: applies the deduction down to net 0", () => {
    const result = computeAppliedNet(100, [{ id: "d1", amount: 100 }]);
    expect(result.net).toBe(0);
    expect(result.appliedDeductionIds).toEqual(["d1"]);
    expect(result.skippedDeductionIds).toEqual([]);
  });

  it("string amounts (as Supabase numeric can arrive) are coerced", () => {
    const result = computeAppliedNet(100, [{ id: "d1", amount: "40" }]);
    expect(result.net).toBe(60);
    expect(result.appliedDeductionIds).toEqual(["d1"]);
  });

  it("credits-only: net is bookingsNet plus credits, all credits applied", () => {
    const result = computeAppliedNet(100, [], [{ id: "c1", amount: 50 }]);
    expect(result.net).toBe(150);
    expect(result.appliedCreditIds).toEqual(["c1"]);
    expect(result.appliedDeductionIds).toEqual([]);
    expect(result.skippedDeductionIds).toEqual([]);
  });

  it("credit + deduction net as one balance: base 150, deduction 120 fits, net 30", () => {
    // Credits add first (100 + 50 = 150), then the deduction applies greedily
    // against the credit-inflated base, so a 120 deduction that would NOT fit in
    // 100 alone fits in 150 and leaves 30.
    const result = computeAppliedNet(
      100,
      [{ id: "d1", amount: 120 }],
      [{ id: "c1", amount: 50 }],
    );
    expect(result.net).toBe(30);
    expect(result.appliedDeductionIds).toEqual(["d1"]);
    expect(result.skippedDeductionIds).toEqual([]);
    expect(result.appliedCreditIds).toEqual(["c1"]);
  });

  it("credit present but deduction still does not fit: deduction skipped, credit always applied", () => {
    // Base is 100 + 20 = 120; a 200 deduction does not fit and rolls over, but
    // the credit is still applied (credits only add, they never skip).
    const result = computeAppliedNet(
      100,
      [{ id: "d1", amount: 200 }],
      [{ id: "c1", amount: 20 }],
    );
    expect(result.net).toBe(120);
    expect(result.appliedDeductionIds).toEqual([]);
    expect(result.skippedDeductionIds).toEqual(["d1"]);
    expect(result.appliedCreditIds).toEqual(["c1"]);
  });

  it("string credit amounts are coerced", () => {
    const result = computeAppliedNet(100, [], [{ id: "c1", amount: "25" }]);
    expect(result.net).toBe(125);
    expect(result.appliedCreditIds).toEqual(["c1"]);
  });
});

describe("shouldRefundOnReject", () => {
  it("paid reject (amount + payment id) refunds", () => {
    expect(shouldRefundOnReject(2000, "pay_123")).toBe(true);
  });

  it("free trip (amount 0, no payment id) does not refund", () => {
    expect(shouldRefundOnReject(0, null)).toBe(false);
  });

  it("paid amount but no payment id does not refund", () => {
    expect(shouldRefundOnReject(2000, null)).toBe(false);
  });

  it("null amount with a payment id does not refund", () => {
    expect(shouldRefundOnReject(null, "pay_123")).toBe(false);
  });

  it("zero amount with a payment id does not refund", () => {
    expect(shouldRefundOnReject(0, "pay_123")).toBe(false);
  });
});

describe("addCalendarDays", () => {
  it("adds days across a month boundary", () => {
    expect(addCalendarDays("2026-06-30", 2)).toBe("2026-07-02");
  });

  it("adds one day across the end of January", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("adds days across a year boundary", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("subtracts days (negative n)", () => {
    expect(addCalendarDays("2026-03-01", -7)).toBe("2026-02-22");
  });

  it("is unaffected by any local DST transition (pure UTC calendar math)", () => {
    // US DST ends 2026-11-01; a naive local-time shift could land back on the
    // same wall-clock day. UTC-midnight math must still advance exactly one day.
    expect(addCalendarDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("manilaDateOf", () => {
  it("returns the Manila calendar date for a same-day UTC instant", () => {
    expect(manilaDateOf("2026-06-30T02:00:00Z")).toBe("2026-06-30");
  });

  it("rolls forward to the next Manila day for a late UTC instant (+8)", () => {
    // 20:00 UTC is 04:00 next day in Manila.
    expect(manilaDateOf("2026-06-30T20:00:00Z")).toBe("2026-07-01");
  });
});

describe("payoutTimingGate", () => {
  // Minimal booking shape the gate reads. created_at times use T02:00:00Z so the
  // Manila date equals the date part regardless of the +8 offset. Defaults to a
  // downpayment booking, balance not paid online, future trip 2026-07-20.
  function tooking(
    over: {
      payment_option?: string | null;
      balance_payment_gateway_status?: string | null;
      created_at?: string;
      dateStart?: string | null;
    } = {},
  ) {
    const { dateStart = "2026-07-20", ...rest } = over;
    return {
      payment_option: "downpayment",
      balance_payment_gateway_status: null,
      created_at: "2026-06-30T02:00:00Z",
      trip: dateStart == null ? null : { date_start: dateStart },
      ...rest,
    };
  }

  it("Lane A: created 3 days ago, future trip -> payable pre-trip-cleared", () => {
    // created 2026-06-30 (Manila), today 2026-07-03, future trip 2026-07-20.
    const b = tooking({ created_at: "2026-06-30T02:00:00Z", dateStart: "2026-07-20" });
    const r = payoutTimingGate(b, "2026-07-03");
    expect(r).toEqual({ payable: true, reason: "pre-trip-cleared" });
  });

  it("Lane A: created today, future trip -> not payable (not-cleared)", () => {
    const b = tooking({ created_at: "2026-07-03T02:00:00Z", dateStart: "2026-07-20" });
    const r = payoutTimingGate(b, "2026-07-03");
    expect(r).toEqual({ payable: false, reason: "not-cleared" });
  });

  it("Lane A boundary: created exactly 2 calendar days ago -> payable", () => {
    // created 2026-07-01, today 2026-07-03 -> +2 days = 2026-07-03 <= today.
    const b = tooking({ created_at: "2026-07-01T02:00:00Z", dateStart: "2026-07-20" });
    const r = payoutTimingGate(b, "2026-07-03");
    expect(r).toEqual({ payable: true, reason: "pre-trip-cleared" });
  });

  it("Lane B boundary: created exactly 7 days before trip is NOT late (goes to Lane A)", () => {
    // trip 2026-07-20, cutoff = 2026-07-13. created 2026-07-13 is not > cutoff, so
    // not late. today 2026-07-16 clears it -> pre-trip-cleared, proving the exactly
    // -7-days case is treated as pre-trip, not post-trip-late.
    const b = tooking({ created_at: "2026-07-13T02:00:00Z", dateStart: "2026-07-20" });
    const r = payoutTimingGate(b, "2026-07-16");
    expect(r).toEqual({ payable: true, reason: "pre-trip-cleared" });
  });

  it("Lane B: created 6 days before trip (less than 7) is late -> not payable pre-trip", () => {
    // trip 2026-07-20, cutoff 2026-07-13, created 2026-07-14 > cutoff -> late.
    const b = tooking({ created_at: "2026-07-14T02:00:00Z", dateStart: "2026-07-20" });
    const r = payoutTimingGate(b, "2026-07-16");
    expect(r).toEqual({ payable: false, reason: "trip-not-past" });
  });

  it("Lane B: same late booking after the trip -> payable post-trip-late", () => {
    const b = tooking({ created_at: "2026-07-14T02:00:00Z", dateStart: "2026-07-20" });
    const r = payoutTimingGate(b, "2026-07-25");
    expect(r).toEqual({ payable: true, reason: "post-trip-late" });
  });

  it("Lane C: balance paid online, future trip -> not payable (trip-not-past)", () => {
    const b = tooking({
      balance_payment_gateway_status: "paid",
      created_at: "2026-06-30T02:00:00Z",
      dateStart: "2026-07-20",
    });
    const r = payoutTimingGate(b, "2026-07-03");
    expect(r).toEqual({ payable: false, reason: "trip-not-past" });
  });

  it("Lane C: balance paid online, past trip -> payable post-trip-balance", () => {
    const b = tooking({
      balance_payment_gateway_status: "paid",
      created_at: "2026-06-30T02:00:00Z",
      dateStart: "2026-07-20",
    });
    const r = payoutTimingGate(b, "2026-07-25");
    expect(r).toEqual({ payable: true, reason: "post-trip-balance" });
  });

  it("Lane C wins over Lane A: balance paid online blocks an otherwise-cleared pre-trip booking", () => {
    // Cleared by Lane A math (created 3 days ago) but balance paid online, so the
    // whole booking must wait post-trip. Future trip -> not payable.
    const b = tooking({
      balance_payment_gateway_status: "paid",
      created_at: "2026-06-30T02:00:00Z",
      dateStart: "2026-07-20",
    });
    const r = payoutTimingGate(b, "2026-07-03");
    expect(r).toEqual({ payable: false, reason: "trip-not-past" });
  });

  it("no trip -> not payable (no-trip)", () => {
    const b = tooking({ dateStart: null });
    const r = payoutTimingGate(b, "2026-07-03");
    expect(r).toEqual({ payable: false, reason: "no-trip" });
  });
});
