import { describe, it, expect } from "vitest";
import { remittedRefundDeductionAmount, decideCreditReversal } from "../lib/organizer-credits";

// The deduction written when a joiner is refunded after the booking's payout was
// remitted. Only the downpayment share is clawed back by it; the balance share is
// reversed against the organizer's credit (decideCreditReversal), so the two must
// never both charge the organizer for the balance.
describe("remittedRefundDeductionAmount", () => {
  it("deducts only the downpayment share when a refund spans both payments", () => {
    expect(remittedRefundDeductionAmount(600, 1000)).toBe(600);
  });

  it("keeps a real zero when the whole refund came from the balance", () => {
    expect(remittedRefundDeductionAmount(0, 1000)).toBe(0);
  });

  it("deducts the whole refund when it came wholly from the downpayment", () => {
    expect(remittedRefundDeductionAmount(1000, 1000)).toBe(1000);
  });

  it("falls back to the whole refund when the downpayment share is missing", () => {
    expect(remittedRefundDeductionAmount(null, 1000)).toBe(1000);
  });
});

describe("a partial cancel after a remit, with a balance credit still waiting", () => {
  it("charges the downpayment share once and leaves the organizer the rest of the credit", () => {
    // Half the slots cancelled: 1000 refunded, 400 of it from the downpayment and
    // 600 from a 1200 balance credit that has not been paid out yet.
    expect(remittedRefundDeductionAmount(400, 1000)).toBe(400);
    expect(decideCreditReversal("pending", 1200, 600, false)).toEqual({ kind: "shrink", retained: 600 });
  });
});
