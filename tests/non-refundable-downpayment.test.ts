import { describe, expect, it } from "vitest";
import { calculateRefundAmount } from "@/lib/cancellation-policies";
import { computeRefundSplit } from "@/lib/booking-finance";
import {
  NON_REFUNDABLE_DOWNPAYMENT as NRD,
  cancelledSlotsShare,
  keptDownpaymentAmount,
  keptDownpaymentCredit,
  splitRefundForPolicy,
  usesKeptDownpaymentCredit,
} from "@/lib/non-refundable-downpayment";

// Worked example throughout: a 1,500 trip with a 500 downpayment and a 5%
// commission of 75, stamped on the full price at booking.
type SplitBooking = Parameters<typeof computeRefundSplit>[0];
const booking = (over: Record<string, unknown>) =>
  ({
    payment_option: "downpayment",
    total_amount: 1500,
    amount_due: 500,
    balance_payment_gateway_status: null,
    balance_paymongo_payment_id: null,
    ...over,
  }) as unknown as SplitBooking;

describe("keptDownpaymentAmount", () => {
  it("is the downpayment payer's amount_due", () => {
    expect(keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: 500, totalAmount: 1500, slots: 1, tripMinDownpayment: 800 })).toBe(500);
  });
  it("is the trip's minimum downpayment times slots for a full payer", () => {
    expect(keptDownpaymentAmount({ paymentOption: "full", amountDue: 3000, totalAmount: 3000, slots: 2, tripMinDownpayment: 500 })).toBe(1000);
    expect(keptDownpaymentAmount({ paymentOption: "full", amountDue: 1500, totalAmount: 1500, slots: 1, tripMinDownpayment: "500.00" })).toBe(500);
  });
  it("caps a full payer's kept amount at the total, as createBooking does", () => {
    expect(keptDownpaymentAmount({ paymentOption: "full", amountDue: 400, totalAmount: 400, slots: 1, tripMinDownpayment: 500 })).toBe(400);
  });
  it("returns null when the downpayment cannot be worked out", () => {
    expect(keptDownpaymentAmount({ paymentOption: "full", amountDue: 1500, totalAmount: 1500, slots: 1, tripMinDownpayment: null })).toBeNull();
    expect(keptDownpaymentAmount({ paymentOption: "full", amountDue: 1500, totalAmount: 1500, slots: 0, tripMinDownpayment: 500 })).toBeNull();
    expect(keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: null, totalAmount: 1500, slots: 1, tripMinDownpayment: 500 })).toBeNull();
    expect(keptDownpaymentAmount({ paymentOption: null, amountDue: 500, totalAmount: 1500, slots: 1, tripMinDownpayment: 500 })).toBeNull();
  });
  it("caps a booking stored as a downpayment but charged in full at the minimum downpayment times slots", () => {
    expect(keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: 1500, totalAmount: 1500, slots: 1, tripMinDownpayment: 500 })).toBe(500);
    expect(keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: 3000, totalAmount: 3000, slots: 2, tripMinDownpayment: "500.00" })).toBe(1000);
  });
  it("keeps a downpayment payer's amount_due when the trip minimum is unusable", () => {
    expect(keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: 500, totalAmount: 1500, slots: 1, tripMinDownpayment: null })).toBe(500);
  });
});

describe("splitRefundForPolicy", () => {
  it("refunds the online balance first under this policy", () => {
    const paidTwice = booking({ balance_payment_gateway_status: "paid", balance_paymongo_payment_id: "pay_balance" });
    expect(splitRefundForPolicy(NRD, paidTwice, 1000)).toEqual({ downpaymentRefund: 0, balanceRefund: 1000 });
  });
  it("puts the whole refund on the one payment of a full payer", () => {
    const fullPayer = booking({ payment_option: "full", amount_due: 1500 });
    expect(splitRefundForPolicy(NRD, fullPayer, 1000)).toEqual({ downpaymentRefund: 1000, balanceRefund: 0 });
  });
  it("sends the remainder to the downpayment leg only when the refund exceeds the balance", () => {
    const paidTwice = booking({ balance_payment_gateway_status: "paid", balance_paymongo_payment_id: "pay_balance" });
    expect(splitRefundForPolicy(NRD, paidTwice, 1200)).toEqual({ downpaymentRefund: 200, balanceRefund: 1000 });
  });
  it("uses no balance leg when the balance payment id is missing, like computeRefundSplit", () => {
    const noId = booking({ balance_payment_gateway_status: "paid", balance_paymongo_payment_id: null });
    expect(splitRefundForPolicy(NRD, noId, 1000)).toEqual({ downpaymentRefund: 1000, balanceRefund: 0 });
  });
  it("passes a null refund through as manual review", () => {
    expect(splitRefundForPolicy(NRD, booking({}), null)).toEqual({ downpaymentRefund: null, balanceRefund: 0 });
  });
  it("leaves every other policy on the existing proportional split", () => {
    const paidTwice = booking({ balance_payment_gateway_status: "paid", balance_paymongo_payment_id: "pay_balance" });
    expect(splitRefundForPolicy("strict", paidTwice, 750)).toEqual(computeRefundSplit(paidTwice, 750));
  });
});

describe("cancelledSlotsShare", () => {
  it("gives the cancelled slots their share of a whole-booking amount", () => {
    expect(cancelledSlotsShare(1000, 1, 2)).toBe(500);
    expect(cancelledSlotsShare(150, 2, 3)).toBe(50);
  });
  it("always adds back to the whole with the remaining share", () => {
    const whole = 100;
    const remaining = Math.round(whole * (2 / 3) * 100) / 100;
    expect(Math.round((cancelledSlotsShare(whole, 2, 3) + remaining) * 100) / 100).toBe(whole);
  });
});

describe("keptDownpaymentCredit", () => {
  it("is the kept downpayment minus the commission (the 425 example)", () => {
    expect(keptDownpaymentCredit(500, 75)).toBe(425);
    expect(keptDownpaymentCredit(500, "75.00")).toBe(425);
  });
  it("never goes below zero", () => {
    expect(keptDownpaymentCredit(50, 75)).toBe(0);
  });
  it("returns null when either figure is unusable", () => {
    expect(keptDownpaymentCredit(null, 75)).toBeNull();
    expect(keptDownpaymentCredit(500, null)).toBeNull();
    expect(keptDownpaymentCredit(500, -1)).toBeNull();
  });
});

describe("usesKeptDownpaymentCredit", () => {
  it("is true only under this policy, paid, and before the booking enters a payout", () => {
    expect(usesKeptDownpaymentCredit({ policy: NRD, paymentGatewayStatus: "paid", payoutStatus: "unpaid" })).toBe(true);
    expect(usesKeptDownpaymentCredit({ policy: NRD, paymentGatewayStatus: "paid", payoutStatus: null })).toBe(true);
  });
  it("is false for an unpaid booking, so no credit is written for money never received", () => {
    expect(usesKeptDownpaymentCredit({ policy: NRD, paymentGatewayStatus: null, payoutStatus: "unpaid" })).toBe(false);
  });
  it("is false once the booking is in a payout, which already carries its money", () => {
    expect(usesKeptDownpaymentCredit({ policy: NRD, paymentGatewayStatus: "paid", payoutStatus: "included" })).toBe(false);
    expect(usesKeptDownpaymentCredit({ policy: NRD, paymentGatewayStatus: "paid", payoutStatus: "remitted" })).toBe(false);
  });
  it("is false for every other policy", () => {
    expect(usesKeptDownpaymentCredit({ policy: "strict", paymentGatewayStatus: "paid", payoutStatus: "unpaid" })).toBe(false);
  });
});

describe("the worked example end to end", () => {
  it("downpayment payer: nothing back, organizer credited 425", () => {
    const kept = keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: 500, totalAmount: 1500, slots: 1, tripMinDownpayment: 500 });
    expect(calculateRefundAmount(NRD, 500, 20, kept)).toBe(0);
    expect(keptDownpaymentCredit(kept, 75)).toBe(425);
  });
  it("full payer: 1,000 back, organizer credited 425", () => {
    const kept = keptDownpaymentAmount({ paymentOption: "full", amountDue: 1500, totalAmount: 1500, slots: 1, tripMinDownpayment: 500 });
    expect(calculateRefundAmount(NRD, 1500, 20, kept)).toBe(1000);
    expect(keptDownpaymentCredit(kept, 75)).toBe(425);
  });
  it("partial cancel of one of two downpayment slots: nothing back, organizer credited 425", () => {
    const kept = keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: 1000, totalAmount: 3000, slots: 2, tripMinDownpayment: 500 });
    const full = calculateRefundAmount(NRD, 1000, 20, kept);
    expect(full).toBe(0);
    expect(keptDownpaymentCredit(cancelledSlotsShare(kept as number, 1, 2), cancelledSlotsShare(150, 1, 2))).toBe(425);
  });
  it("stored as a downpayment but charged in full (booked after the cutoff): 1,000 back, organizer credited 425", () => {
    const kept = keptDownpaymentAmount({ paymentOption: "downpayment", amountDue: 1500, totalAmount: 1500, slots: 1, tripMinDownpayment: 500 });
    expect(calculateRefundAmount(NRD, 1500, 20, kept)).toBe(1000);
    expect(keptDownpaymentCredit(kept, 75)).toBe(425);
    expect(splitRefundForPolicy(NRD, booking({ amount_due: 1500 }), 1000)).toEqual({ downpaymentRefund: 1000, balanceRefund: 0 });
  });
});
