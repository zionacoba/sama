import { describe, expect, it } from "vitest";
import { initialPaymentType, lockedPaymentFieldValues } from "../lib/locked-payment-fields";

describe("initialPaymentType", () => {
  it("starts a downpayment trip on downpayment", () => {
    expect(initialPaymentType({ payment_type: "downpayment", min_downpayment: 500 })).toBe("downpayment");
  });

  it("starts every other trip on full payment", () => {
    expect(initialPaymentType({ payment_type: "full", min_downpayment: null })).toBe("full");
    expect(initialPaymentType({ payment_type: null, min_downpayment: null })).toBe("full");
    expect(initialPaymentType({ payment_type: "something-else", min_downpayment: 500 })).toBe("full");
  });
});

describe("lockedPaymentFieldValues", () => {
  it("sends the stored downpayment as the number input would", () => {
    expect(lockedPaymentFieldValues({ payment_type: "downpayment", min_downpayment: 500 })).toEqual({
      paymentType: "downpayment",
      minDownpayment: "500",
    });
  });

  it("keeps a decimal amount exactly as stored", () => {
    expect(lockedPaymentFieldValues({ payment_type: "downpayment", min_downpayment: 512.5 })).toEqual({
      paymentType: "downpayment",
      minDownpayment: "512.5",
    });
  });

  it("sends an empty amount when a downpayment trip stores none", () => {
    expect(lockedPaymentFieldValues({ payment_type: "downpayment", min_downpayment: null })).toEqual({
      paymentType: "downpayment",
      minDownpayment: "",
    });
  });

  it("sends no amount field on a full-payment trip", () => {
    expect(lockedPaymentFieldValues({ payment_type: "full", min_downpayment: 500 })).toEqual({
      paymentType: "full",
      minDownpayment: null,
    });
  });

  it("sends no amount field when no payment type is stored", () => {
    expect(lockedPaymentFieldValues({ payment_type: null, min_downpayment: null })).toEqual({
      paymentType: "full",
      minDownpayment: null,
    });
  });

  it("always matches the form's starting payment type", () => {
    for (const payment_type of ["downpayment", "full", null, "other"]) {
      const trip = { payment_type, min_downpayment: 300 };
      expect(lockedPaymentFieldValues(trip).paymentType).toBe(initialPaymentType(trip));
    }
  });
});
