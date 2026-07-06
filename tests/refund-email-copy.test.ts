import { describe, expect, it } from "vitest";
import { classifyRefundResult, MANUAL_REFUND_FOLLOWUP } from "@/lib/refund-email-copy";

describe("classifyRefundResult", () => {
  it("classifies a successful automatic refund as success", () => {
    expect(classifyRefundResult({ success: true })).toBe("success");
    expect(classifyRefundResult({ success: true, refundId: "ref_123" })).toBe("success");
  });

  it("classifies a QR Ph manual refund as manual, not failed", () => {
    expect(
      classifyRefundResult({
        success: false,
        requiresManualProcessing: true,
        error: "QR Ph payments require manual refund",
      }),
    ).toBe("manual");
  });

  it("classifies a genuine API failure as failed", () => {
    expect(classifyRefundResult({ success: false, error: "Refund failed" })).toBe("failed");
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
