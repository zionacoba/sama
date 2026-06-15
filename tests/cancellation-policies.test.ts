import { describe, expect, it } from "vitest";
import { calculateRefundAmount } from "@/lib/cancellation-policies";

// Core refund-by-policy math. We test the exact day boundaries where the refund
// tier changes (just inside vs just outside), plus the full/partial/no-refund
// cases and edge inputs. Amounts assert the real numbers the function returns.
const PAID = 10000;

describe("calculateRefundAmount", () => {
  describe("flexible (full >=7, 50% >=3, else 0)", () => {
    it("full refund at and above the 7-day threshold", () => {
      expect(calculateRefundAmount("flexible", PAID, 8)).toBe(10000);
      expect(calculateRefundAmount("flexible", PAID, 7)).toBe(10000);
    });
    it("drops to 50% just inside the 7-day threshold", () => {
      expect(calculateRefundAmount("flexible", PAID, 6)).toBe(5000);
    });
    it("50% at and above the 3-day threshold", () => {
      expect(calculateRefundAmount("flexible", PAID, 3)).toBe(5000);
    });
    it("no refund just inside the 3-day threshold", () => {
      expect(calculateRefundAmount("flexible", PAID, 2)).toBe(0);
    });
  });

  describe("moderate (full >=14, 50% >=7, else 0)", () => {
    it("full refund at the 14-day threshold", () => {
      expect(calculateRefundAmount("moderate", PAID, 14)).toBe(10000);
    });
    it("50% just inside 14 days", () => {
      expect(calculateRefundAmount("moderate", PAID, 13)).toBe(5000);
    });
    it("50% at the 7-day threshold", () => {
      expect(calculateRefundAmount("moderate", PAID, 7)).toBe(5000);
    });
    it("no refund just inside 7 days", () => {
      expect(calculateRefundAmount("moderate", PAID, 6)).toBe(0);
    });
  });

  describe("strict (full >=30, 50% >=7, else 0)", () => {
    it("full refund at the 30-day threshold", () => {
      expect(calculateRefundAmount("strict", PAID, 30)).toBe(10000);
    });
    it("50% just inside 30 days", () => {
      expect(calculateRefundAmount("strict", PAID, 29)).toBe(5000);
    });
    it("50% at the 7-day threshold", () => {
      expect(calculateRefundAmount("strict", PAID, 7)).toBe(5000);
    });
    it("no refund just inside 7 days", () => {
      expect(calculateRefundAmount("strict", PAID, 6)).toBe(0);
    });
  });

  describe("custom and unknown policies", () => {
    it("returns null for custom (manual review)", () => {
      expect(calculateRefundAmount("custom", PAID, 30)).toBeNull();
    });
    it("returns null for an unrecognized policy", () => {
      expect(calculateRefundAmount("whatever", PAID, 30)).toBeNull();
    });
  });

  describe("edge inputs", () => {
    it("day-of (0 days) yields no refund", () => {
      expect(calculateRefundAmount("flexible", PAID, 0)).toBe(0);
    });
    it("negative/past days are clamped to 0 (no refund, never negative)", () => {
      expect(calculateRefundAmount("flexible", PAID, -5)).toBe(0);
      expect(calculateRefundAmount("strict", PAID, -100)).toBe(0);
    });
    it("rounds the 50% tier to two decimals for odd amounts", () => {
      // 1001 * 0.5 = 500.5, already two decimals
      expect(calculateRefundAmount("flexible", 1001, 5)).toBe(500.5);
      // 1000.01 * 0.5 = 500.005 -> rounds to 500.01
      expect(calculateRefundAmount("flexible", 1000.01, 5)).toBe(500.01);
    });
  });
});
