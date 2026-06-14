import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { formatBookingRef } from "@/lib/format";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

type CreatePaymentLinkInput = {
  bookingId: number;
  amount: number;
  description: string;
};

type CreatePaymentLinkResult =
  | { checkoutUrl: string; linkId: string }
  | { error: string };

export async function createPaymentLink({
  bookingId,
  amount,
  description,
}: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult> {
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

  const pmRes = await fetch("https://api.paymongo.com/v1/links", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: centavos,
          description,
          remarks: `Booking #${ref}`,
          redirect: {
            success: `${SITE_URL}/payment/success?bookingId=${bookingId}`,
            failed: `${SITE_URL}/payment/failed?bookingId=${bookingId}`,
          },
        },
      },
    }),
  });

  if (!pmRes.ok) {
    const err = await pmRes.json().catch(() => ({}));
    console.error("[paymongo] link creation failed:", pmRes.status, JSON.stringify(err));
    return { error: "Payment provider error" };
  }

  const pmData = await pmRes.json();
  const linkId: string = pmData.data.id;
  const checkoutUrl: string = pmData.data.attributes.checkout_url;

  return { checkoutUrl, linkId };
}
