import { describe, expect, it } from "vitest";
import { decideRetryAction, liveRefundIds } from "../supabase/functions/_shared/refund-match";

// A PayMongo refund entry as listed on a Payment's attributes.refunds.
const listed = (id: string, amount: unknown, status: unknown = "succeeded") => ({
  id,
  attributes: { status, amount },
});
const NONE: ReadonlySet<string> = new Set<string>();

describe("decideRetryAction", () => {
  it("issues when PayMongo lists no refunds", () => {
    expect(decideRetryAction(15000, [], NONE)).toEqual({ kind: "issue" });
  });

  it("issues when the refund list is missing", () => {
    expect(decideRetryAction(15000, undefined, NONE)).toEqual({ kind: "issue" });
    expect(decideRetryAction(15000, null, NONE)).toEqual({ kind: "issue" });
  });

  it("reconciles against an unclaimed live refund of exactly this amount (a lost done-write heals)", () => {
    expect(decideRetryAction(15000, [listed("ref_a", 15000)], NONE)).toEqual({
      kind: "reconcile",
      refundId: "ref_a",
    });
  });

  it("does not reconcile against a refund another row already holds, so a second refund is issued", () => {
    expect(decideRetryAction(15000, [listed("ref_a", 15000)], new Set(["ref_a"]))).toEqual({ kind: "issue" });
  });

  it("does not reconcile against a live refund of a different amount", () => {
    expect(decideRetryAction(15000, [listed("ref_a", 30000)], NONE)).toEqual({ kind: "issue" });
  });

  it("ignores failed refunds even when the amount matches", () => {
    expect(decideRetryAction(15000, [listed("ref_a", 15000, "failed")], NONE)).toEqual({ kind: "issue" });
  });

  it("picks the unclaimed refund when two of the same amount exist", () => {
    const refunds = [listed("ref_a", 5000), listed("ref_b", 5000)];
    expect(decideRetryAction(5000, refunds, new Set(["ref_a"]))).toEqual({ kind: "reconcile", refundId: "ref_b" });
  });

  it("treats an entry with no status as live, as the cron always has", () => {
    const refunds = [{ id: "ref_a", attributes: { amount: 15000 } }];
    expect(decideRetryAction(15000, refunds, NONE)).toEqual({ kind: "reconcile", refundId: "ref_a" });
  });

  it("holds when a live refund's amount cannot be read", () => {
    for (const amount of [undefined, null, "15000", 150.5, 0, -100]) {
      expect(decideRetryAction(15000, [listed("ref_a", amount)], NONE).kind).toBe("hold");
    }
  });

  it("holds when a live refund has no readable id", () => {
    const refunds = [{ attributes: { status: "succeeded", amount: 15000 } }];
    expect(decideRetryAction(15000, refunds, NONE).kind).toBe("hold");
  });

  it("holds even when the unreadable entry is not the one that would match", () => {
    const refunds = [listed("ref_a", 15000), listed("ref_b", undefined)];
    expect(decideRetryAction(15000, refunds, NONE).kind).toBe("hold");
  });

  it("does not hold for an unreadable refund that failed", () => {
    const refunds = [listed("ref_x", undefined, "failed"), listed("ref_a", 15000)];
    expect(decideRetryAction(15000, refunds, NONE)).toEqual({ kind: "reconcile", refundId: "ref_a" });
  });

  it("holds when the refund list is not a list", () => {
    expect(decideRetryAction(15000, { id: "ref_a" }, NONE).kind).toBe("hold");
  });

  it("control: the old any-non-failed rule claims another row's refund on the same case", () => {
    // The rule the cron used before CP-v120, copied here so this suite proves its
    // double-refund case really separates the two rules.
    const oldRule = (refunds: Array<{ id: string; attributes?: { status?: unknown } }>) =>
      refunds.find((r) => (r?.attributes?.status ?? "") !== "failed");
    const refunds = [listed("ref_a", 15000)];
    expect(oldRule(refunds)?.id).toBe("ref_a");
    expect(decideRetryAction(15000, refunds, new Set(["ref_a"]))).toEqual({ kind: "issue" });
  });
});

describe("liveRefundIds", () => {
  it("returns the readable ids of live refunds only", () => {
    const refunds = [listed("ref_a", 100), listed("ref_b", 100, "failed"), { attributes: { amount: 100 } }];
    expect(liveRefundIds(refunds)).toEqual(["ref_a"]);
  });

  it("returns nothing for a missing or malformed list", () => {
    expect(liveRefundIds(undefined)).toEqual([]);
    expect(liveRefundIds({ id: "ref_a" })).toEqual([]);
  });
});
