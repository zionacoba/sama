import { describe, expect, it } from "vitest";
import { resolveGuardCount, resolveGuardRows } from "@/lib/payout-details-guard";

describe("resolveGuardCount", () => {
  it("returns fetch-error when the count query errored", () => {
    expect(resolveGuardCount(null, { message: "boom" })).toEqual({ kind: "fetch-error" });
  });

  it("returns fetch-error even if a count is present alongside the error", () => {
    expect(resolveGuardCount(3, { message: "boom" })).toEqual({ kind: "fetch-error" });
  });

  it("returns fetch-error when count is null without an error (anomalous for head:true)", () => {
    expect(resolveGuardCount(null, null)).toEqual({ kind: "fetch-error" });
  });

  it("returns count with zero when no rows matched", () => {
    expect(resolveGuardCount(0, null)).toEqual({ kind: "count", count: 0 });
  });

  it("returns count with the positive value when rows matched", () => {
    expect(resolveGuardCount(2, null)).toEqual({ kind: "count", count: 2 });
  });
});

describe("resolveGuardRows", () => {
  it("returns fetch-error when the list select errored", () => {
    expect(resolveGuardRows(null, { message: "boom" })).toEqual({ kind: "fetch-error" });
  });

  it("returns fetch-error even if rows are present alongside the error", () => {
    expect(resolveGuardRows([{ id: 1 }], { message: "boom" })).toEqual({ kind: "fetch-error" });
  });

  it("returns fetch-error when rows is null without an error (anomalous for a list select)", () => {
    expect(resolveGuardRows(null, null)).toEqual({ kind: "fetch-error" });
  });

  it("returns rows with an empty array as a legitimate pass-through", () => {
    expect(resolveGuardRows([], null)).toEqual({ kind: "rows", rows: [] });
  });

  it("returns rows with the populated array", () => {
    expect(resolveGuardRows([{ id: 1 }, { id: 2 }], null)).toEqual({
      kind: "rows",
      rows: [{ id: 1 }, { id: 2 }],
    });
  });
});
