import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
import { confirmPaidBooking, confirmPaidBalance, extractPaymentDetails } from "@/lib/confirm-paid-booking";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
if (!process.env.ADMIN_EMAIL) console.warn("[config] ADMIN_EMAIL is not set — admin alerts will be skipped");

function verifySignature(rawBody: string, sigHeader: string, secret: string): boolean {
  const parts = sigHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const testSig = parts.find((p) => p.startsWith("te="))?.slice(3);

  if (!timestamp || !testSig) return false;

  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(testSig, "hex");
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

  if (eventType !== "link.payment.paid") {
    return NextResponse.json({ received: true });
  }

  try {
    await handleLinkPaymentPaid(attrs!);
  } catch (err) {
    console.error("[webhook] handler error for link.payment.paid:", err);
    // A paid event was dropped (money was taken but the booking is unconfirmed).
    // Alert an operator so they can look up the PayMongo link and confirm manually.
    // This covers both the initial-payment and balance-payment paths, which share
    // this single handler and catch.
    if (ADMIN_EMAIL) {
      const linkData = attrs!.data as Record<string, unknown> | undefined;
      const linkId = (linkData?.id as string | undefined) ?? "unknown";
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: "Action needed: PayMongo paid webhook dropped, booking unconfirmed",
          html: `
            <p>A PayMongo <strong>link.payment.paid</strong> webhook failed to process. Payment was taken but the booking was not confirmed, and PayMongo will not retry.</p>
            <p><strong>PayMongo link ID:</strong> ${escapeHtml(linkId)}</p>
            <p><strong>Error:</strong> ${escapeHtml(String(err))}</p>
            <p>Look up the link in the PayMongo dashboard and confirm the booking manually.</p>
          `,
        });
      } catch (alertErr) {
        console.error("[webhook] failed to send dropped-webhook alert", alertErr);
      }
    }
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
