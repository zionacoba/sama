import { describe, expect, it } from "vitest";
import {
  computeTripCancelSummary,
  type CancelSummaryBookingRow,
} from "@/lib/trip-cancel-summary";
import { TRIP_CANCELLATION_REFUND_STATUSES } from "@/lib/booking-status";

// Helper: a fully-paid confirmed GCash booking, the most common row shape.
// Tests override just the fields under test.
function row(overrides: Partial<CancelSummaryBookingRow>): CancelSummaryBookingRow {
  return {
    status: "confirmed",
    payout_status: "unpaid",
    paymongo_payment_id: "pay_123",
    balance_paymongo_payment_id: null,
    payment_method: "gcash",
    payment_option: "full",
    amount_due: 1000,
    total_amount: 1000,
    balance_payment_gateway_status: null,
    platform_commission: 50,
    ...overrides,
  };
}

describe("computeTripCancelSummary", () => {
  it("pins the swept status set the summary must cover (cancelTrip's set)", () => {
    expect([...TRIP_CANCELLATION_REFUND_STATUSES]).toEqual([
      "confirmed",
      "pending",
      "payment_pending",
      "transferred",
    ]);
  });

  it("counts a transferred booking in every figure, like cancelTrip processes it", () => {
    const summary = computeTripCancelSummary([
      row({}),
      row({ status: "transferred" }),
    ]);
    expect(summary.bookingCount).toBe(2);
    expect(summary.paymongoCount).toBe(2);
    expect(summary.manualCount).toBe(0);
    expect(summary.noPaymentCount).toBe(0);
    // Both are refunded in full to the original payer.
    expect(summary.refundTotal).toBe(2000);
    // Both are ATTENDED + unpaid, so both are pending earnings the organizer loses.
    expect(summary.pendingEarningsNet).toBe(1900);
  });

  it("classifies QR Ph bookings as manual, matching processPayMongoRefund's short-circuit", () => {
    const summary = computeTripCancelSummary([
      row({ payment_method: "qrph" }),
      row({ status: "transferred", payment_method: "qrph" }),
      row({}),
    ]);
    expect(summary.paymongoCount).toBe(1);
    expect(summary.manualCount).toBe(2);
    // Manual (QR Ph) refunds are still owed to the participant, so they stay
    // in the previewed refund total.
    expect(summary.refundTotal).toBe(3000);
  });

  it("puts never-paid and free bookings in noPaymentCount with no refund", () => {
    const summary = computeTripCancelSummary([
      // payment_pending hold: no payment id, nothing issued by cancelTrip.
      row({ status: "payment_pending", paymongo_payment_id: null, payment_method: null }),
      // Free-trip booking: confirmed with no payment and zero amounts.
      row({ paymongo_payment_id: null, payment_method: null, amount_due: 0, total_amount: 0, platform_commission: 0 }),
    ]);
    expect(summary.bookingCount).toBe(2);
    expect(summary.paymongoCount).toBe(0);
    expect(summary.manualCount).toBe(0);
    expect(summary.noPaymentCount).toBe(2);
    expect(summary.refundTotal).toBe(0);
    // The free confirmed booking is ATTENDED + unpaid but nets zero earnings.
    expect(summary.pendingEarningsNet).toBe(0);
  });

  it("refunds a pending (paid, awaiting approval) booking but excludes it from earnings", () => {
    const summary = computeTripCancelSummary([
      row({ status: "pending", payment_option: "downpayment", amount_due: 300 }),
    ]);
    // cancelTrip refunds amountJoinerPaid: the downpayment only, since the
    // balance was not paid online.
    expect(summary.refundTotal).toBe(300);
    expect(summary.paymongoCount).toBe(1);
    // pending is not an ATTENDED status: it was never payout-eligible, so no
    // pending earnings are lost.
    expect(summary.pendingEarningsNet).toBe(0);
  });

  it("uses amountJoinerPaid + computeRefundSplit for a downpayment booking with an online balance", () => {
    const summary = computeTripCancelSummary([
      row({
        payment_option: "downpayment",
        amount_due: 300,
        total_amount: 1000,
        balance_payment_gateway_status: "paid",
        balance_paymongo_payment_id: "pay_bal",
      }),
    ]);
    // Balance paid online means the joiner paid the full 1000 through Sama and
    // gets it all back (300 downpayment leg + 700 balance leg).
    expect(summary.refundTotal).toBe(1000);
    // Gross held is the full total, so lost earnings are 1000 - 50 commission.
    expect(summary.pendingEarningsNet).toBe(950);
  });

  it("excludes bookings already included in a payout from pendingEarningsNet", () => {
    const summary = computeTripCancelSummary([
      row({ payout_status: "included" }),
      row({ status: "transferred", payout_status: "remitted" }),
    ]);
    // Still counted and refunded...
    expect(summary.bookingCount).toBe(2);
    expect(summary.refundTotal).toBe(2000);
    // ...but neither is pending earnings (they are in a payout already; the
    // clawback for those is handled by cancelTrip's reconciliation/deductions,
    // not by this preview).
    expect(summary.pendingEarningsNet).toBe(0);
  });

  it("keeps the three refund buckets summing to bookingCount", () => {
    const summary = computeTripCancelSummary([
      row({}),
      row({ payment_method: "qrph" }),
      row({ status: "payment_pending", paymongo_payment_id: null }),
      row({ status: "transferred" }),
    ]);
    expect(
      summary.paymongoCount + summary.manualCount + summary.noPaymentCount,
    ).toBe(summary.bookingCount);
  });
});
