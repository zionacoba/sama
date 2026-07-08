import { describe, expect, it } from "vitest";
import { formatBookingRef, formatPeso } from "@/lib/format";

describe("formatPeso", () => {
  it("formats whole pesos with no centavos and grouped thousands", () => {
    expect(formatPeso(0)).toBe("₱0");
    expect(formatPeso(50)).toBe("₱50");
    expect(formatPeso(1000)).toBe("₱1,000");
    expect(formatPeso(1234567)).toBe("₱1,234,567");
  });

  it("rounds away centavos rather than displaying them", () => {
    expect(formatPeso(1000.49)).toBe("₱1,000");
    expect(formatPeso(1000.5)).toBe("₱1,001");
  });
});

describe("formatBookingRef", () => {
  it("renders an 8-char zero-padded uppercase hex ref", () => {
    expect(formatBookingRef(42)).toBe("0000002A");
    expect(formatBookingRef(1)).toBe("00000001");
    expect(formatBookingRef(0)).toBe("00000000");
  });

  it("is deterministic for the same id", () => {
    expect(formatBookingRef(255)).toBe(formatBookingRef(255));
    expect(formatBookingRef(255)).toBe("000000FF");
  });

  it("keeps the last 8 hex digits for very large ids", () => {
    // 0x1234567890 -> last 8 hex digits "34567890"
    expect(formatBookingRef(0x1234567890)).toBe("34567890");
  });

  it("accepts bigint ids", () => {
    expect(formatBookingRef(BigInt(42))).toBe("0000002A");
  });
});
