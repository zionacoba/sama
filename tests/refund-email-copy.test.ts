import { describe, expect, it } from "vitest";
import {
  classifyRefundResult,
  MANUAL_REFUND_FOLLOWUP,
  cancellationRefundLine,
  type CancellationEmailBooking,
} from "@/lib/refund-email-copy";
import type { RefundResult } from "@/lib/paymongo-refund";

describe("classifyRefundResult", () => {
  it("classifies a successful automatic refund as success", () => {
    expect(classifyRefundResult({ success: true })).toBe("success");
    const withRefundId: RefundResult = { success: true, refundId: "ref_123" };
    expect(classifyRefundResult(withRefundId)).toBe("success");
  });

  it("classifies a QR Ph manual refund as manual, not failed", () => {
    const manualResult: RefundResult = {
      success: false,
      requiresManualProcessing: true,
      error: "QR Ph payments require manual refund",
    };
    expect(classifyRefundResult(manualResult)).toBe("manual");
  });

  it("classifies a genuine API failure as failed", () => {
    const failedResult: RefundResult = { success: false, error: "Refund failed" };
    expect(classifyRefundResult(failedResult)).toBe("failed");
    expect(classifyRefundResult({ success: false })).toBe("failed");
  });

  it("treats a missing result (no refund attempted or recorded) as failed", () => {
    expect(classifyRefundResult(null)).toBe("failed");
    expect(classifyRefundResult(undefined)).toBe("failed");
  });

  it("prefers success over a stray requiresManualProcessing flag", () => {
    expect(classifyRefundResult({ success: true, requiresManualProcessing: true })).toBe("success");
  });
});

describe("MANUAL_REFUND_FOLLOWUP", () => {
  it("matches the Terms: 3 to 5 business days, proactive, no action needed", () => {
    expect(MANUAL_REFUND_FOLLOWUP).toContain("3 to 5 business days");
    expect(MANUAL_REFUND_FOLLOWUP).toContain("Our team will arrange it");
    expect(MANUAL_REFUND_FOLLOWUP).toContain("No action is needed from you");
    // The Terms promise WE contact the payer; the copy must never tell them to email in.
    expect(MANUAL_REFUND_FOLLOWUP).not.toMatch(/email|contact us/i);
  });
});

describe("cancellationRefundLine", () => {
  const fmt = (n: number) => `PHP ${n.toFixed(2)}`;

  // A fully-paid online booking (full payment, no balance leg): total_amount is
  // what the joiner paid; a downpayment leg exists to refund against.
  const paidBooking: CancellationEmailBooking = {
    payment_option: "full",
    amount_due: 5000,
    total_amount: 5000,
    balance_payment_gateway_status: null,
    paymongo_payment_id: "pay_123",
    balance_paymongo_payment_id: null,
  };

  it("never-paid payment_pending hold gets the neutral line, NO refund promise", () => {
    // Amounts are set at booking creation, but no PayMongo payment id exists on
    // either leg, so cancelTrip issues nothing.
    const neverPaid: CancellationEmailBooking = {
      payment_option: "full",
      amount_due: 5000,
      total_amount: 5000,
      balance_payment_gateway_status: null,
      paymongo_payment_id: null,
      balance_paymongo_payment_id: null,
    };
    const line = cancellationRefundLine(neverPaid, { initial: null, balance: null }, fmt);
    expect(line).not.toMatch(/refund/i);
    expect(line).not.toContain("5000");
    expect(line).toContain("hello@sama.com.ph");
  });

  it("GCash-paid booking (automatic refund succeeded) gets the success copy", () => {
    const line = cancellationRefundLine(
      paidBooking,
      { initial: { success: true }, balance: null },
      fmt,
    );
    expect(line).toContain("has been processed and will reflect within 24 hours");
    expect(line).toContain("PHP 5000.00");
  });

  it("QR Ph-paid booking (manual refund) gets the manual copy", () => {
    const line = cancellationRefundLine(
      paidBooking,
      { initial: { success: false, requiresManualProcessing: true }, balance: null },
      fmt,
    );
    expect(line).toContain("It is being processed manually");
    expect(line).toContain(MANUAL_REFUND_FOLLOWUP);
    expect(line).toContain("PHP 5000.00");
  });

  it("real payer whose automatic refund ERRORED gets the email-us copy, NOT the never-paid line", () => {
    const line = cancellationRefundLine(
      paidBooking,
      { initial: { success: false, error: "PayMongo API error" }, balance: null },
      fmt,
    );
    // The refund IS owed (a payment exists), so it must still promise the refund
    // and route to email, distinct from the never-paid neutral line.
    expect(line).toContain("You will receive a full refund");
    expect(line).toContain("to process your refund within 3 to 5 business days");
    expect(line).toContain("PHP 5000.00");
    // Prove the two formerly-shared cases are now distinct where it matters.
    expect(line).not.toBe(
      cancellationRefundLine(
        { ...paidBooking, paymongo_payment_id: null },
        { initial: null, balance: null },
        fmt,
      ),
    );
  });
});
