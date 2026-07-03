import { describe, expect, it } from "vitest";
import { decideCreditReversal } from "../lib/organizer-credits";

// Design pass fixtures: D=2000 B=3000 T=5000, credit=3000 (the balance owed to the
// organizer once the downpayment was already paid out). balanceRefundedToJoiner is
// p x B for the applicable refund tier: 3000 (100%), 1500 (50%), 0 (none).
const CREDIT = 3000;

describe("decideCreditReversal", () => {
  it("pending, refund 3000 -> void", () => {
    expect(decideCreditReversal("pending", CREDIT, 3000, false)).toEqual({ kind: "void" });
  });

  it("pending, refund 1500 -> shrink retained 1500", () => {
    expect(decideCreditReversal("pending", CREDIT, 1500, false)).toEqual({ kind: "shrink", retained: 1500 });
  });

  it("pending, refund 0 -> shrink retained 3000", () => {
    expect(decideCreditReversal("pending", CREDIT, 0, false)).toEqual({ kind: "shrink", retained: 3000 });
  });

  it("applied + payout remitted, refund 3000 -> void-and-offset 3000", () => {
    expect(decideCreditReversal("applied", CREDIT, 3000, true)).toEqual({ kind: "void-and-offset", amount: 3000 });
  });

  it("applied + payout remitted, refund 1500 -> void-and-offset 1500", () => {
    expect(decideCreditReversal("applied", CREDIT, 1500, true)).toEqual({ kind: "void-and-offset", amount: 1500 });
  });

  it("applied + payout remitted, refund 0 -> void", () => {
    expect(decideCreditReversal("applied", CREDIT, 0, true)).toEqual({ kind: "void" });
  });

  it("applied + payout NOT remitted, any refund -> document", () => {
    expect(decideCreditReversal("applied", CREDIT, 3000, false)).toEqual({ kind: "document" });
    expect(decideCreditReversal("applied", CREDIT, 1500, false)).toEqual({ kind: "document" });
    expect(decideCreditReversal("applied", CREDIT, 0, false)).toEqual({ kind: "document" });
  });

  it("null status -> none", () => {
    expect(decideCreditReversal(null, CREDIT, 3000, false)).toEqual({ kind: "none" });
    expect(decideCreditReversal(undefined, CREDIT, 1500, true)).toEqual({ kind: "none" });
  });
});
