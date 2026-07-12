import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { formatBookingRef } from "@/lib/format";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

type CreatePaymentCheckoutInput = {
  bookingId: number;
  amount: number;
  description: string;
};

// `linkId` now carries a PayMongo checkout session id (cs_...) rather than a
// link id; the field name is kept so callers and the payment_id /
// balance_payment_id columns are untouched.
type CreatePaymentCheckoutResult =
  | { checkoutUrl: string; linkId: string }
  | { error: string };

export async function createPaymentCheckout({
  bookingId,
  amount,
  description,
}: CreatePaymentCheckoutInput): Promise<CreatePaymentCheckoutResult> {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    console.error("[paymongo] PAYMONGO_SECRET_KEY not configured");
    return { error: "Payment service unavailable" };
  }

  const admin = createSupabaseAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) {
    return { error: "Booking not found" };
  }

  const centavos = Math.round(amount * 100);
  const ref = formatBookingRef(bookingId);
  const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");

  const pmRes = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            { name: description, amount: centavos, currency: "PHP", quantity: 1 },
          ],
          payment_method_types: ["gcash", "paymaya", "qrph"],
          description,
          reference_number: String(ref),
          success_url: `${SITE_URL}/payment/success?bookingId=${bookingId}`,
          cancel_url: `${SITE_URL}/payment/failed?bookingId=${bookingId}`,
          send_email_receipt: true,
          metadata: { bookingId: String(bookingId) },
        },
      },
    }),
  });

  if (!pmRes.ok) {
    const err = await pmRes.json().catch(() => ({}));
    console.error("[paymongo] checkout session creation failed:", pmRes.status, JSON.stringify(err));
    return { error: "Payment provider error" };
  }

  const pmData = await pmRes.json();
  const linkId: string = pmData.data.id;
  const checkoutUrl: string = pmData.data.attributes.checkout_url;

  return { checkoutUrl, linkId };
}
