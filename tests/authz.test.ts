import { describe, expect, it } from "vitest";
import { organizerOwns } from "@/lib/authz";

// Security-critical: a missing/empty id must NEVER authorize. These tests guard
// the auth-bypass shape (null/undefined treated as a match) that was fixed.
describe("organizerOwns", () => {
  it("matching ids authorize", () => {
    expect(organizerOwns("org_1", "org_1")).toBe(true);
  });

  it("non-matching ids do not authorize", () => {
    expect(organizerOwns("org_1", "org_2")).toBe(false);
  });

  it("null/undefined on either side never authorizes", () => {
    expect(organizerOwns(null, "org_1")).toBe(false);
    expect(organizerOwns("org_1", null)).toBe(false);
    expect(organizerOwns(undefined, "org_1")).toBe(false);
    expect(organizerOwns("org_1", undefined)).toBe(false);
    expect(organizerOwns(null, null)).toBe(false);
    expect(organizerOwns(undefined, undefined)).toBe(false);
  });

  it("empty strings never authorize", () => {
    expect(organizerOwns("", "")).toBe(false);
    expect(organizerOwns("", "org_1")).toBe(false);
    expect(organizerOwns("org_1", "")).toBe(false);
  });

  it("whitespace-padded matching ids authorize (trimmed)", () => {
    expect(organizerOwns("  org_1  ", "org_1")).toBe(true);
    expect(organizerOwns("org_1", "\torg_1\n")).toBe(true);
  });

  it("a whitespace-only id never authorizes", () => {
    // Whitespace-only ids trim to "" and must never authorize, not even against
    // another whitespace-only string (they must not be treated as equal empties).
    expect(organizerOwns("   ", "org_1")).toBe(false);
    expect(organizerOwns("   ", "  ")).toBe(false);
  });
});
