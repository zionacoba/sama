// Pure computation behind getTripCancelSummary, the preview shown in the
// cancel-trip confirmation dialog. Extracted to lib/ so it is unit-testable
// (app/actions/trip.ts is a "use server" file and may only export async server
// functions).
//
// The caller queries the SAME booking set cancelTrip sweeps
// (TRIP_CANCELLATION_REFUND_STATUSES); this function must mirror what
// cancelTrip then does with each row, using the same helpers, so the numbers
// the organizer confirms against equal what actually happens:
//   - Refund basis: amountJoinerPaid split via computeRefundSplit. The
//     downpayment leg is issued only when paymongo_payment_id exists;
//     computeRefundSplit already gates the balance leg on an online balance
//     payment with its own payment id.
//   - Manual vs automatic: processPayMongoRefund short-circuits QR Ph
//     (payment_method === "qrph") to requiresManualProcessing, so QR Ph
//     bookings land on cancelTrip's manual list; everything else with a
//     payment id is refunded automatically.
//   - Lost pending earnings: ATTENDED statuses (within the swept set:
//     confirmed and transferred) with payout_status "unpaid", valued at
//     amountSamaHolds minus platform_commission. Same predicate and basis as
//     the organizer dashboard's pending-earnings list.
// An automatic refund can still fail at cancel time (PayMongo API error) and
// fall back to manual handling; that is not knowable in a preview, so
// paymongoCount is "will be attempted automatically".

import { amountJoinerPaid, amountSamaHolds, computeRefundSplit } from "@/lib/booking-finance";
import { ATTENDED_STATUSES } from "@/lib/booking-status";

export type CancelSummaryBookingRow = {
  status: string;
  payout_status: string | null;
  paymongo_payment_id: string | null;
  balance_paymongo_payment_id: string | null;
  payment_method: string | null;
  payment_option: string | null;
  amount_due: number | string | null;
  total_amount: number | string | null;
  balance_payment_gateway_status: string | null;
  platform_commission: number | string | null;
};

export type TripCancelSummary = {
  bookingCount: number;
  paymongoCount: number;
  manualCount: number;
  noPaymentCount: number;
  refundTotal: number;
  pendingEarningsNet: number;
};

export function computeTripCancelSummary(
  bookings: CancelSummaryBookingRow[],
): TripCancelSummary {
  let paymongoCount = 0;
  let manualCount = 0;
  let noPaymentCount = 0;
  let refundTotal = 0;
  let pendingEarningsNet = 0;

  for (const b of bookings) {
    const refundAmount = amountJoinerPaid(b);
    const { downpaymentRefund, balanceRefund } = computeRefundSplit(b, refundAmount);

    // What cancelTrip will actually issue for this booking (automatically or
    // via the manual list): the downpayment leg only when a PayMongo payment
    // id was recorded, plus the (already-gated) online-balance leg.
    const issued =
      (b.paymongo_payment_id ? downpaymentRefund ?? 0 : 0) + balanceRefund;
    refundTotal = Math.round((refundTotal + issued) * 100) / 100;

    // Per-booking refund classification. A booking with nothing refundable
    // online (free trip, or a payment_pending hold that was never paid) gets
    // no refund at all, so it belongs in neither refund bucket.
    if (issued <= 0) {
      noPaymentCount += 1;
    } else if (b.payment_method === "qrph") {
      manualCount += 1;
    } else {
      paymongoCount += 1;
    }

    // Earnings the organizer loses: bookings that count as pending earnings
    // on the dashboard (ATTENDED status, not yet included in a payout) stop
    // being payout-eligible once the sweep moves them to "cancelled".
    if (
      (ATTENDED_STATUSES as readonly string[]).includes(b.status) &&
      b.payout_status === "unpaid"
    ) {
      // Gross is what Sama actually received online; for downpayment bookings
      // whose balance was collected in cash, that's only the downpayment.
      const gross = amountSamaHolds(b);
      // platform_commission is the full commission, already deducted from the
      // downpayment. No pro-rating.
      const commission = Number(b.platform_commission ?? 0);
      const net = Math.round((gross - commission) * 100) / 100;
      pendingEarningsNet = Math.round((pendingEarningsNet + net) * 100) / 100;
    }
  }

  return {
    bookingCount: bookings.length,
    paymongoCount,
    manualCount,
    noPaymentCount,
    refundTotal,
    pendingEarningsNet,
  };
}
