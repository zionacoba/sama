import { describe, expect, it } from "vitest";
import {
  resolvePaidSessionFallback,
  type PaidSessionFallbackInput,
} from "../lib/confirm-fallback-resolver";

// Base row: an unpaid downpayment booking. Individual tests override only the
// keys under test so each case reads as a single-variable change.
const base: PaidSessionFallbackInput = {
  paymentGatewayStatus: null,
  balancePaymentGatewayStatus: null,
  amountDue: 500,
  totalAmount: 2000,
  paidAmountCentavos: 50000,
};

const resolve = (over: Partial<PaidSessionFallbackInput>) =>
  resolvePaidSessionFallback({ ...base, ...over });

describe("resolvePaidSessionFallback: target selection", () => {
  it("both gateway columns null with amounts present targets the initial leg", () => {
    expect(resolve({ paidAmountCentavos: 50000 }).route).toBe("confirm-initial");
  });

  it("initial paid and balance null targets the balance leg", () => {
    // Balance = 2000 - 500 = 1500 pesos => 150000 centavos.
    expect(
      resolve({ paymentGatewayStatus: "paid", paidAmountCentavos: 150000 }).route,
    ).toBe("confirm-balance");
  });

  it("both gateway columns set returns none", () => {
    expect(
      resolve({ paymentGatewayStatus: "paid", balancePaymentGatewayStatus: "paid" }).route,
    ).toBe("none");
  });

  it("both null but amountDue 0 returns none (free-booking guard)", () => {
    expect(resolve({ amountDue: 0, totalAmount: 0, paidAmountCentavos: 0 }).route).toBe("none");
  });

  it("initial paid and balance null but zero balance returns none (fully-downpaid guard)", () => {
    // amountDue === totalAmount => expected balance is 0.
    expect(
      resolve({ paymentGatewayStatus: "paid", amountDue: 2000, totalAmount: 2000 }).route,
    ).toBe("none");
  });

  it("balance null but initial ALSO null with zero amountDue and positive total returns none", () => {
    // Initial target needs amountDue > 0; balance target needs initial paid.
    // Neither holds, so no leg is a candidate.
    expect(
      resolve({ paymentGatewayStatus: null, amountDue: 0, totalAmount: 2000, paidAmountCentavos: 0 }).route,
    ).toBe("none");
  });
});

describe("resolvePaidSessionFallback: amount belt", () => {
  it("exact match on the initial leg confirms", () => {
    expect(resolve({ paidAmountCentavos: 50000 })).toEqual({ route: "confirm-initial" });
  });

  it("exact match on the balance leg confirms", () => {
    expect(
      resolve({ paymentGatewayStatus: "paid", paidAmountCentavos: 150000 }),
    ).toEqual({ route: "confirm-balance" });
  });

  it("off-by-one-centavo on the initial leg holds with amount-mismatch", () => {
    const result = resolve({ paidAmountCentavos: 49999 });
    expect(result).toEqual({ route: "hold", leg: "initial", reason: "amount-mismatch" });
  });

  it("off-by-one-centavo on the balance leg holds with amount-mismatch", () => {
    const result = resolve({ paymentGatewayStatus: "paid", paidAmountCentavos: 150001 });
    expect(result).toEqual({ route: "hold", leg: "balance", reason: "amount-mismatch" });
  });

  it("null paidAmountCentavos holds with amount-unreadable on the targeted leg", () => {
    const result = resolve({ paidAmountCentavos: null });
    expect(result).toEqual({ route: "hold", leg: "initial", reason: "amount-unreadable" });
  });

  it("NaN paidAmountCentavos holds with amount-unreadable on the targeted leg", () => {
    const result = resolve({ paymentGatewayStatus: "paid", paidAmountCentavos: NaN });
    expect(result).toEqual({ route: "hold", leg: "balance", reason: "amount-unreadable" });
  });

  it("Infinity paidAmountCentavos holds with amount-unreadable", () => {
    const result = resolve({ paidAmountCentavos: Infinity });
    expect(result).toEqual({ route: "hold", leg: "initial", reason: "amount-unreadable" });
  });
});

describe("resolvePaidSessionFallback: null coercions", () => {
  it("null amountDue coerces initial expected to 0, so initial is not a target", () => {
    // amountDue null => expectedInitial 0 => initial target excluded; balance
    // needs initial paid, which is not the case here => none.
    expect(
      resolve({ amountDue: null, totalAmount: 2000, paidAmountCentavos: 0 }).route,
    ).toBe("none");
  });

  it("null totalAmount with initial paid coerces balance expected negative, so none", () => {
    // expectedBalance = (null -> 0) - 500 = -500 => not > 0 => none.
    expect(
      resolve({ paymentGatewayStatus: "paid", totalAmount: null, amountDue: 500 }).route,
    ).toBe("none");
  });

  it("both amounts null returns none regardless of paid amount", () => {
    expect(
      resolve({ amountDue: null, totalAmount: null, paidAmountCentavos: 0 }).route,
    ).toBe("none");
  });
});
