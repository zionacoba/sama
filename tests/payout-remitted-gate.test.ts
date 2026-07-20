import { describe, expect, it } from "vitest";
import { resolvePayoutRemittedGate } from "@/lib/payout-remitted-gate";

describe("resolvePayoutRemittedGate", () => {
  it("returns fetch-error when the bookings fetch errored", () => {
    expect(resolvePayoutRemittedGate(null, { message: "boom" })).toEqual({ kind: "fetch-error" });
  });

  it("returns fetch-error even if remitted rows are present alongside the error", () => {
    expect(resolvePayoutRemittedGate([{ id: 1 }], { message: "boom" })).toEqual({ kind: "fetch-error" });
  });

  it("returns missing-data when rows is null and there is no error", () => {
    expect(resolvePayoutRemittedGate(null, null)).toEqual({ kind: "missing-data" });
  });

  it("returns missing-data when rows is undefined and there is no error", () => {
    expect(resolvePayoutRemittedGate(undefined, null)).toEqual({ kind: "missing-data" });
  });

  it("returns payout-remitted when at least one remitted booking row is present", () => {
    expect(resolvePayoutRemittedGate([{ id: 1 }], null)).toEqual({ kind: "payout-remitted" });
  });

  it("returns clear when the rows array is empty", () => {
    expect(resolvePayoutRemittedGate([], null)).toEqual({ kind: "clear" });
  });
});
