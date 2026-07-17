import { describe, expect, it } from "vitest";
import { resolveCancellationCascade } from "@/lib/cancellation-cascade";

describe("resolveCancellationCascade", () => {
  it("fails with fetch-error when the update errored", () => {
    expect(resolveCancellationCascade(null, { message: "boom" })).toEqual({ failure: "fetch-error" });
  });

  it("fails with fetch-error even if rows are present alongside the error", () => {
    expect(resolveCancellationCascade([{ id: 1 }], { message: "boom" })).toEqual({ failure: "fetch-error" });
  });

  it("fails with missing-data when rows are null and there is no error", () => {
    expect(resolveCancellationCascade(null, null)).toEqual({ failure: "missing-data" });
  });

  it("fails with missing-data when rows are undefined and there is no error", () => {
    expect(resolveCancellationCascade(undefined, null)).toEqual({ failure: "missing-data" });
  });

  it("passes an empty array: a trip with nothing cancellable is a legitimate result", () => {
    expect(resolveCancellationCascade([], null)).toEqual({ rows: [] });
  });

  it("passes populated rows through untouched with every column intact", () => {
    const rows = [
      { id: 7, full_name: "Ana", email: "ana@example.com", payout_id: "po-1", payout_status: "remitted" },
      { id: 8, full_name: "Ben", email: "ben@example.com", payout_id: null, payout_status: null },
    ];
    const result = resolveCancellationCascade(rows, null);
    expect(result).toEqual({ rows });
    if ("rows" in result) {
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].payout_id).toBe("po-1");
      expect(result.rows[1].email).toBe("ben@example.com");
    }
  });
});
