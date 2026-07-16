import { describe, expect, it } from "vitest";
import {
  COMMISSION_RATE_MAX_PERCENT,
  COMMISSION_RATE_MIN_PERCENT,
  DEFAULT_COMMISSION_RATE,
  parseCommissionRatePercent,
  resolveBookingCommissionRate,
} from "@/lib/commission";

describe("commission constants", () => {
  it("pins the application-layer bounds and default", () => {
    expect(COMMISSION_RATE_MIN_PERCENT).toBe(1);
    expect(COMMISSION_RATE_MAX_PERCENT).toBe(10);
    expect(DEFAULT_COMMISSION_RATE).toBe(0.05);
  });
});

describe("parseCommissionRatePercent", () => {
  // The parser accepts exactly two input types: finite numbers, and non-empty
  // strings that Number() parses fully (form values arrive as strings).
  // Everything else returns null.

  it("rejects null, undefined, empty string, and non-numeric input", () => {
    expect(parseCommissionRatePercent(null)).toBeNull();
    expect(parseCommissionRatePercent(undefined)).toBeNull();
    expect(parseCommissionRatePercent("")).toBeNull();
    expect(parseCommissionRatePercent("   ")).toBeNull();
    expect(parseCommissionRatePercent("abc")).toBeNull();
    expect(parseCommissionRatePercent("4abc")).toBeNull();
    expect(parseCommissionRatePercent(NaN)).toBeNull();
    expect(parseCommissionRatePercent(Infinity)).toBeNull();
    expect(parseCommissionRatePercent(true)).toBeNull();
    expect(parseCommissionRatePercent({})).toBeNull();
  });

  it("rejects 0 and values below the 1% minimum", () => {
    expect(parseCommissionRatePercent(0)).toBeNull();
    expect(parseCommissionRatePercent(0.5)).toBeNull();
    expect(parseCommissionRatePercent(-4)).toBeNull();
  });

  it("accepts numbers within [1, 10] inclusive", () => {
    expect(parseCommissionRatePercent(1)).toBe(1);
    expect(parseCommissionRatePercent(4)).toBe(4);
    expect(parseCommissionRatePercent(10)).toBe(10);
  });

  it("accepts decimal percents within bounds, returned unchanged", () => {
    expect(parseCommissionRatePercent(7.5)).toBe(7.5);
    expect(parseCommissionRatePercent("7.5")).toBe(7.5);
  });

  it("rejects values above the 10% maximum, including the old 20% bound", () => {
    expect(parseCommissionRatePercent(11)).toBeNull();
    expect(parseCommissionRatePercent(20)).toBeNull();
    expect(parseCommissionRatePercent("20")).toBeNull();
  });

  it("accepts numeric form strings", () => {
    expect(parseCommissionRatePercent("4")).toBe(4);
    expect(parseCommissionRatePercent("10")).toBe(10);
    expect(parseCommissionRatePercent(" 4 ")).toBe(4);
  });
});

describe("resolveBookingCommissionRate", () => {
  it("fails with fetch-error when the organizer fetch errored", () => {
    expect(resolveBookingCommissionRate(null, { message: "boom" })).toEqual({ failure: "fetch-error" });
  });

  it("fails with fetch-error even if a record is present alongside the error", () => {
    expect(resolveBookingCommissionRate({ commission_rate: 0.04 }, { message: "boom" })).toEqual({ failure: "fetch-error" });
  });

  it("fails with missing-rate when the organizer record is null", () => {
    expect(resolveBookingCommissionRate(null, null)).toEqual({ failure: "missing-rate" });
  });

  it("fails with missing-rate when commission_rate is null or undefined", () => {
    expect(resolveBookingCommissionRate({ commission_rate: null }, null)).toEqual({ failure: "missing-rate" });
    expect(resolveBookingCommissionRate({ commission_rate: undefined }, null)).toEqual({ failure: "missing-rate" });
  });

  it("returns the rate for a valid numeric commission_rate", () => {
    expect(resolveBookingCommissionRate({ commission_rate: 0.04 }, null)).toEqual({ rate: 0.04 });
  });

  it("coerces DB numeric strings with Number()", () => {
    expect(resolveBookingCommissionRate({ commission_rate: "0.04" }, null)).toEqual({ rate: 0.04 });
  });
});
