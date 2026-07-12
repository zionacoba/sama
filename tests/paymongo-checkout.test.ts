import { describe, expect, it } from "vitest";
import {
  deriveCheckoutPaymentStatus,
  filterPaidPayments,
  hasPaidPayment,
} from "../lib/paymongo-checkout";

// A checkout session has no paid/unpaid status of its own (status is only
// "active" | "expired"); paid-ness is derived from the payments array. These
// shapes mirror the PayMongo payment resource: bare or wrapped under `data`.
const paidPayment = (id = "pay_paid") => ({
  id,
  type: "payment",
  attributes: { status: "paid", source: { type: "gcash" } },
});

const failedPayment = (id = "pay_failed") => ({
  id,
  type: "payment",
  attributes: { status: "failed", source: { type: "gcash" } },
});

const wrapped = (payment: unknown) => ({ data: payment });

describe("deriveCheckoutPaymentStatus", () => {
  it("keeps an active session with no payments as active (not paid)", () => {
    expect(deriveCheckoutPaymentStatus("active", [])).toBe("active");
    expect(deriveCheckoutPaymentStatus("active", undefined)).toBe("active");
  });

  it("keeps an active session with only non-paid payments as active", () => {
    expect(deriveCheckoutPaymentStatus("active", [failedPayment()])).toBe("active");
  });

  it("derives paid for an active session containing a paid payment", () => {
    expect(deriveCheckoutPaymentStatus("active", [paidPayment()])).toBe("paid");
  });

  it("derives paid even when a failed attempt precedes the paid payment", () => {
    expect(deriveCheckoutPaymentStatus("active", [failedPayment(), paidPayment()])).toBe("paid");
  });

  it("keeps an expired session with no paid payment as expired", () => {
    expect(deriveCheckoutPaymentStatus("expired", [])).toBe("expired");
    expect(deriveCheckoutPaymentStatus("expired", [failedPayment()])).toBe("expired");
  });

  it("derives paid for an expired session whose payments include a paid one", () => {
    // A session expires after checkout completes; the payment still counts.
    expect(deriveCheckoutPaymentStatus("expired", [paidPayment()])).toBe("paid");
  });

  it("passes a null session status through when nothing is paid", () => {
    expect(deriveCheckoutPaymentStatus(null, [])).toBeNull();
  });

  it("handles payments wrapped under a data key", () => {
    expect(deriveCheckoutPaymentStatus("active", [wrapped(paidPayment())])).toBe("paid");
    expect(deriveCheckoutPaymentStatus("active", [wrapped(failedPayment())])).toBe("active");
  });
});

describe("filterPaidPayments", () => {
  it("returns only the paid payments, preserving their original shape", () => {
    const paid = paidPayment();
    const result = filterPaidPayments([failedPayment(), paid]);
    expect(result).toEqual([paid]);
  });

  it("returns an empty array for undefined or empty input", () => {
    expect(filterPaidPayments(undefined)).toEqual([]);
    expect(filterPaidPayments([])).toEqual([]);
  });

  it("ignores malformed entries instead of throwing", () => {
    expect(filterPaidPayments([null, 42, "junk", { attributes: null }])).toEqual([]);
  });
});

describe("hasPaidPayment", () => {
  it("is true only when a paid payment exists", () => {
    expect(hasPaidPayment([paidPayment()])).toBe(true);
    expect(hasPaidPayment([failedPayment()])).toBe(false);
    expect(hasPaidPayment(undefined)).toBe(false);
  });
});
