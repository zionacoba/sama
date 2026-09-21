import { describe, expect, it } from "vitest";
import { autoConfirms } from "@/lib/booking-approval";

describe("autoConfirms", () => {
  it("auto-confirms when the trip explicitly requires no approval", () => {
    expect(autoConfirms(false)).toBe(true);
  });

  it("holds for review when the trip requires approval", () => {
    expect(autoConfirms(true)).toBe(false);
  });

  it("fails toward review when the value is null", () => {
    expect(autoConfirms(null)).toBe(false);
  });

  it("fails toward review when the value is undefined", () => {
    expect(autoConfirms(undefined)).toBe(false);
  });
});
