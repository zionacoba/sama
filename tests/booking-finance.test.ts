import { describe, expect, it } from "vitest";
import {
  amountJoinerPaid,
  amountSamaHolds,
  computeAppliedNet,
  computeRefundSplit,
  isPayoutEligible,
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
});
