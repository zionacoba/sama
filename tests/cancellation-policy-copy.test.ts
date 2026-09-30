import { describe, expect, it } from "vitest";
import { CANCELLATION_POLICIES } from "@/lib/cancellation-policies";

describe("non-refundable downpayment policy copy", () => {
  const policy = CANCELLATION_POLICIES.non_refundable_downpayment;

  // Sama refunds only what was paid through Sama. A balance paid to the organizer
  // in cash was never Sama's to refund, so the joiner-facing promise must say so.
  it("promises refunds only on what was paid through Sama", () => {
    expect(policy.short).toContain("anything paid through Sama above it is refunded");
    expect(policy.text).toContain("Anything you paid through Sama above the downpayment is refunded.");
    expect(policy.text).toContain("If the organizer cancels the trip, everything you paid through Sama is refunded.");
  });

  it("never promises everything back", () => {
    expect(policy.text).not.toContain("everything back");
    expect(policy.text).not.toContain("everything above it is refunded");
  });
});
