import { describe, expect, it } from "vitest";
import { decideCreditVoid } from "../lib/organizer-credits";

describe("decideCreditVoid", () => {
  it("no active credit -> none", () => {
    expect(decideCreditVoid(null, "remitted")).toBe("none");
    expect(decideCreditVoid(undefined, "included")).toBe("none");
  });

  it("pending credit -> voided, no offset (never paid out), regardless of payout_status", () => {
    expect(decideCreditVoid("pending", "remitted")).toBe("voided");
    expect(decideCreditVoid("pending", "included")).toBe("voided");
    expect(decideCreditVoid("pending", "unpaid")).toBe("voided");
    expect(decideCreditVoid("pending", null)).toBe("voided");
  });

  it("applied credit + payout_status 'remitted' -> voided only (remitted deduction already recovers the balance)", () => {
    expect(decideCreditVoid("applied", "remitted")).toBe("voided");
  });

  it("applied credit + payout_status not 'remitted' -> voided-and-offset (nothing else recovers it)", () => {
    expect(decideCreditVoid("applied", "included")).toBe("voided-and-offset");
    expect(decideCreditVoid("applied", "unpaid")).toBe("voided-and-offset");
    expect(decideCreditVoid("applied", null)).toBe("voided-and-offset");
    expect(decideCreditVoid("applied", undefined)).toBe("voided-and-offset");
  });
});
