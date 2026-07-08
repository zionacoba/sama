import { describe, expect, it } from "vitest";
import {
  ESCALATION_THRESHOLD_HOURS,
  shouldEscalate,
} from "../supabase/functions/_shared/reconcile-escalation";

// The strand-forever bound escalates a payment_pending booking whose PayMongo
// link has been unreachable for at or beyond ESCALATION_THRESHOLD_HOURS.
describe("shouldEscalate", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const now = 1_700_000_000_000; // fixed epoch ms; no Date.now() so the test is deterministic
  const iso = (ms: number) => new Date(ms).toISOString();

  it("does not escalate when the booking has never failed as unreachable (null)", () => {
    expect(shouldEscalate(null, now)).toBe(false);
    expect(shouldEscalate(undefined, now)).toBe(false);
  });

  it("does not escalate a booking that has been failing under the threshold", () => {
    const firstFailed = iso(now - 5.5 * HOUR_MS); // 5h30m ago, under 6h
    expect(shouldEscalate(firstFailed, now)).toBe(false);
  });

  it("escalates a booking that has been failing over the threshold", () => {
    const firstFailed = iso(now - 7 * HOUR_MS); // 7h ago, over 6h
    expect(shouldEscalate(firstFailed, now)).toBe(true);
  });

  it("escalates exactly at the boundary (elapsed == threshold)", () => {
    const firstFailed = iso(now - ESCALATION_THRESHOLD_HOURS * HOUR_MS); // exactly 6h ago
    expect(shouldEscalate(firstFailed, now)).toBe(true);
  });

  it("does not escalate one millisecond before the boundary", () => {
    const firstFailed = iso(now - (ESCALATION_THRESHOLD_HOURS * HOUR_MS - 1));
    expect(shouldEscalate(firstFailed, now)).toBe(false);
  });

  it("accepts a Date instance as well as an ISO string", () => {
    expect(shouldEscalate(new Date(now - 7 * HOUR_MS), now)).toBe(true);
    expect(shouldEscalate(new Date(now - 1 * HOUR_MS), now)).toBe(false);
  });

  it("does not escalate on an unparseable timestamp", () => {
    expect(shouldEscalate("not-a-date", now)).toBe(false);
  });

  it("respects a custom threshold argument", () => {
    const firstFailed = iso(now - 3 * HOUR_MS); // 3h ago
    expect(shouldEscalate(firstFailed, now, 2)).toBe(true);
    expect(shouldEscalate(firstFailed, now, 4)).toBe(false);
  });
});
