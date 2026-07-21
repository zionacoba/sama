// Pure decision logic for the webhook-side metadata.bookingId recovery path.
//
// When a checkout_session.payment.paid event arrives but its stored cs_ id was
// never persisted (the best-effort store-write can fail), the booking is still
// recoverable via the bookingId stamped on the session at mint time. This
// function decides, from the booking row's gateway-status and amount columns
// plus the paid amount on the event, which leg (if any) the payment belongs to
// and whether the amount is trustworthy enough to auto-confirm.
//
// It is deliberately dependency-free (no supabase, no sentry) so it can be unit
// tested in isolation. It performs no I/O and no confirmation itself; callers
// act on the returned route.

export type PaidSessionFallbackInput = {
  paymentGatewayStatus: string | null;
  balancePaymentGatewayStatus: string | null;
  amountDue: number | null;
  totalAmount: number | null;
  paidAmountCentavos: number | null;
};

export type PaidSessionFallbackResult =
  | { route: "confirm-initial" }
  | { route: "confirm-balance" }
  | { route: "hold"; leg: "initial" | "balance"; reason: "amount-mismatch" | "amount-unreadable" }
  | { route: "none" };

export function resolvePaidSessionFallback(
  input: PaidSessionFallbackInput,
): PaidSessionFallbackResult {
  const {
    paymentGatewayStatus,
    balancePaymentGatewayStatus,
    amountDue,
    totalAmount,
    paidAmountCentavos,
  } = input;

  // Expected amounts, in pesos, derived from the row alone. The initial leg
  // charges amount_due; the balance leg charges total_amount minus amount_due.
  const expectedInitialPesos = amountDue ?? 0;
  const expectedBalancePesos = (totalAmount ?? 0) - (amountDue ?? 0);

  // Target selection. The initial-paid precondition on the balance target is
  // deliberate: a balance session only exists on an already-confirmed booking.
  // The greater-than-zero peso conditions are deliberate: a free or
  // fully-downpaid leg must never catch a stray event.
  let target: "initial" | "balance";
  if (paymentGatewayStatus === null && expectedInitialPesos > 0) {
    target = "initial";
  } else if (
    paymentGatewayStatus !== null &&
    balancePaymentGatewayStatus === null &&
    expectedBalancePesos > 0
  ) {
    target = "balance";
  } else {
    return { route: "none" };
  }

  const expectedPesos = target === "initial" ? expectedInitialPesos : expectedBalancePesos;

  // Amount belt on the chosen target. Unreadable amount is held, never
  // auto-confirmed.
  if (paidAmountCentavos === null || !Number.isFinite(paidAmountCentavos)) {
    return { route: "hold", leg: target, reason: "amount-unreadable" };
  }

  if (Math.round(expectedPesos * 100) === paidAmountCentavos) {
    return target === "initial" ? { route: "confirm-initial" } : { route: "confirm-balance" };
  }

  return { route: "hold", leg: target, reason: "amount-mismatch" };
}

export type BalanceCancelledRefundInput = {
  status: string | null;
  balancePaymentGatewayStatus: string | null;
  paidAmountCentavos: number | null;
  totalAmount: number | null;
  amountDue: number | null;
};

export type BalanceCancelledRefundResult =
  | { action: "refund"; amountPesos: number }
  | { action: "skip" }
  | { action: "proceed" }
  | { action: "hold" };

// Pure decision for a balance payment that lands on a booking which is no
// longer in a confirmable state. This mirrors the initial leg's cancelled-path
// polarity, adapted to the balance column: it keys on
// balancePaymentGatewayStatus (the balance leg's gateway column), NOT
// payment_gateway_status, because on a balance event the downpayment is by
// definition already paid, so the initial column tells us nothing about whether
// the balance leg was confirmed. A null balance column on a cancelled booking
// means the balance money arrived but was never confirmed, so a refund is owed.
export function resolveBalanceCancelledRefund(
  input: BalanceCancelledRefundInput,
): BalanceCancelledRefundResult {
  const {
    status,
    balancePaymentGatewayStatus,
    paidAmountCentavos,
    totalAmount,
    amountDue,
  } = input;

  if (status === "cancelled" && balancePaymentGatewayStatus === null) {
    // Money arrived on a cancelled booking and the balance was never confirmed.
    // Prefer the amount actually received; fall back to the expected balance
    // computed from the row. If neither yields a positive amount, hold rather
    // than invent a figure.
    if (
      paidAmountCentavos !== null &&
      Number.isFinite(paidAmountCentavos) &&
      paidAmountCentavos > 0
    ) {
      return { action: "refund", amountPesos: paidAmountCentavos / 100 };
    }
    const expectedBalancePesos = (totalAmount ?? 0) - (amountDue ?? 0);
    if (expectedBalancePesos > 0) {
      return { action: "refund", amountPesos: expectedBalancePesos };
    }
    return { action: "hold" };
  }

  if (status === "cancelled" || status === "rejected" || status === "transferred") {
    // Matches the outer status gate but not the refund condition: rejected,
    // transferred, or cancelled with an already-confirmed balance.
    return { action: "skip" };
  }

  return { action: "proceed" };
}
