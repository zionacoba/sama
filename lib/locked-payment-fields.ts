// The payment type and minimum downpayment the trip edit form shows, and
// submits, when the downpayment lock applies (organizer terms 1.4, section 8;
// isDownpaymentLocked in lib/trip-slot-summary.ts).
//
// A locked form must submit exactly what the untouched form submits, so that
// updateTrip's downpaymentLockRefusesSave sees no change and the save goes
// through. The untouched form sends:
//   - payment_type: its select's starting value, "downpayment" when the trip
//     stores "downpayment" and "full" for anything else;
//   - min_downpayment: only when that value is "downpayment" (the input is not
//     rendered otherwise), as the stored amount, or "" when none is stored.
// The form's payment-type state starts from initialPaymentType, and a locked
// form's hidden fields carry lockedPaymentFieldValues, so both come from here.

export type PaymentFieldsTrip = {
  payment_type: string | null;
  min_downpayment: number | null;
};

export function initialPaymentType(trip: PaymentFieldsTrip): "full" | "downpayment" {
  return trip.payment_type === "downpayment" ? "downpayment" : "full";
}

// minDownpayment is null when the untouched form sends no min_downpayment field
// at all, so a locked form renders no hidden field for it either.
export function lockedPaymentFieldValues(trip: PaymentFieldsTrip): {
  paymentType: "full" | "downpayment";
  minDownpayment: string | null;
} {
  const paymentType = initialPaymentType(trip);
  if (paymentType !== "downpayment") return { paymentType, minDownpayment: null };
  return { paymentType, minDownpayment: trip.min_downpayment == null ? "" : String(trip.min_downpayment) };
}
