import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const maxDuration = 60;
import { confirmPaidBooking, confirmPaidBalance, extractPaymentDetails } from "@/lib/confirm-paid-booking";
import { filterPaidPayments } from "@/lib/paymongo-checkout";
import { sendAdminAlert } from "@/lib/admin-alert";
import { escapeHtml } from "@/lib/escape-html";

function verifySignature(rawBody: string, sigHeader: string, secret: string): boolean {
  const parts = sigHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const testSig = parts.find((p) => p.startsWith("te="))?.slice(3);
  const liveSig = parts.find((p) => p.startsWith("li="))?.slice(3);

  // PayMongo signs with one secret per endpoint and populates te= for a test
  // webhook or li= for a live one, leaving the other empty. Verify against
  // whichever is present so the same secret + HMAC works in both modes.
  const sig = testSig && testSig.length ? testSig : liveSig;

  if (!timestamp || !sig) return false;

  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] PAYMONGO_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sigHeader = req.headers.get("paymongo-signature");
  if (!sigHeader) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  if (!verifySignature(rawBody, sigHeader, webhookSecret)) {
    console.warn("[webhook] paymongo signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventData = event.data as Record<string, unknown> | undefined;
  const attrs = eventData?.attributes as Record<string, unknown> | undefined;
  const eventType = attrs?.type as string | undefined;

  // checkout_session.payment.paid is the Checkout Sessions replacement for
  // link.payment.paid. The link branch is kept intact as transition insurance
  // for payments still completing on pre-migration links; removing it is a
  // later cleanup commit.
  if (eventType !== "link.payment.paid" && eventType !== "checkout_session.payment.paid") {
    return NextResponse.json({ received: true });
  }

  try {
    if (eventType === "link.payment.paid") {
      await handleLinkPaymentPaid(attrs!);
    } else {
      await handleCheckoutSessionPaymentPaid(attrs!);
    }
  } catch (err) {
    console.error(`[webhook] handler error for ${eventType}:`, err);
    const droppedLinkData = attrs!.data as Record<string, unknown> | undefined;
    Sentry.captureException(err, {
      extra: {
        context: "paymongo-webhook-dropped",
        linkId: (droppedLinkData?.id as string | undefined) ?? "unknown",
      },
    });
    // A paid event was dropped (money was taken but the booking is unconfirmed).
    // Alert an operator so they can look up the PayMongo link or checkout
    // session and confirm manually. This covers both the initial-payment and
    // balance-payment paths, which share this single handler and catch.
    const linkData = attrs!.data as Record<string, unknown> | undefined;
    const linkId = (linkData?.id as string | undefined) ?? "unknown";
    await sendAdminAlert(
      "Action needed: PayMongo paid webhook dropped, booking unconfirmed",
      `
            <p>A PayMongo <strong>${escapeHtml(eventType)}</strong> webhook failed to process. Payment was taken but the booking was not confirmed, and PayMongo will not retry.</p>
            <p><strong>PayMongo resource ID:</strong> ${escapeHtml(linkId)}</p>
            <p><strong>Error:</strong> ${escapeHtml(String(err))}</p>
            <p>Look up the link in the PayMongo dashboard and confirm the booking manually.</p>
          `,
    );
    // Return 200 to prevent PayMongo retries — this needs manual review.
    return NextResponse.json({ received: true, warning: "handler error" });
  }

  return NextResponse.json({ received: true });
}

async function handleLinkPaymentPaid(attrs: Record<string, unknown>) {
  const linkData = attrs.data as Record<string, unknown> | undefined;
  const linkId = linkData?.id as string | undefined;
  const linkAttrs = linkData?.attributes as Record<string, unknown> | undefined;

  if (!linkId) {
    console.error("[webhook] link.payment.paid: missing link ID in event");
    return;
  }

  // Extract payment method and transaction ID from the payments array on the link.
  const { paymentMethod, paymentTransactionId } = extractPaymentDetails(
    linkAttrs?.payments as unknown[] | undefined,
  );

  // Confirm the booking via the shared, idempotent helper. The helper applies
  // every guard the webhook used to apply inline (idempotency, no-resurrect,
  // refund alert, status transition, emails, revalidation).
  const result = await confirmPaidBooking(linkId, paymentMethod, paymentTransactionId);

  if (result.outcome === "not_found") {
    // No initial-payment booking matched this link — it may be a balance payment.
    // The shared helper applies the same idempotency guard, updates the three
    // balance columns, sends the same participant + organizer emails, and
    // revalidates the same paths the webhook used to inline here.
    const balanceResult = await confirmPaidBalance(linkId, paymentTransactionId);
    if (balanceResult.outcome === "not_found") {
      console.error("[webhook] no booking found for link (initial or balance):", linkId);
    }
  }
}

// checkout_session.payment.paid mirrors link.payment.paid: the event's
// attributes.data carries the checkout session resource (id "cs_...") whose
// attributes.payments array holds the payment resources. The session id is
// what createPaymentCheckout stores in bookings.payment_id /
// balance_payment_id, so it routes through the same confirm chain as a link id.
async function handleCheckoutSessionPaymentPaid(attrs: Record<string, unknown>) {
  const sessionData = attrs.data as Record<string, unknown> | undefined;
  const sessionId = sessionData?.id as string | undefined;
  const sessionAttrs = sessionData?.attributes as Record<string, unknown> | undefined;

  // A paid event we cannot parse means money was taken and the booking cannot
  // be confirmed; returning silently would suppress the Sentry capture and
  // admin alert in the caller's catch block, which exist precisely for this case.
  if (!sessionId) {
    throw new Error("checkout_session.payment.paid event missing session id: payload shape mismatch");
  }

  // Extract payment method and transaction ID, preferring a paid payment so a
  // failed attempt earlier in the array can never supply the details.
  const payments = sessionAttrs?.payments as unknown[] | undefined;
  const paidPayments = filterPaidPayments(payments);
  const { paymentMethod, paymentTransactionId, paidAmountCentavos } = extractPaymentDetails(
    paidPayments.length > 0 ? paidPayments : payments,
  );

  // metadata.bookingId is stamped on the session at mint time
  // (createPaymentCheckout). It is the recovery key when a paid event's cs_ id
  // was never stored on the booking row, so the confirm chain can still resolve
  // the booking and route the payment to the correct leg.
  const sessionMetadata = sessionAttrs?.metadata as Record<string, unknown> | undefined;
  const metadataBookingId = (sessionMetadata?.bookingId as string) ?? null;

  // Same idempotent confirm chain as the link handler: initial payment first,
  // then fall back to the balance payment when no initial booking matches.
  const result = await confirmPaidBooking(sessionId, paymentMethod, paymentTransactionId, metadataBookingId, paidAmountCentavos);

  if (result.outcome === "not_found") {
    const balanceResult = await confirmPaidBalance(sessionId, paymentTransactionId, undefined, metadataBookingId, paidAmountCentavos);
    if (balanceResult.outcome === "not_found") {
      console.error("[webhook] no booking found for checkout session (initial or balance):", sessionId);
    }
  }
}
