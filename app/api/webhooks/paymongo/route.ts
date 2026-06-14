import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { confirmPaidBooking, extractPaymentDetails } from "@/lib/confirm-paid-booking";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
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
    // Return 200 to prevent PayMongo retries — this needs manual review.
    return NextResponse.json({ received: true, warning: "handler error" });
  }

  return NextResponse.json({ received: true });
}

async function handleLinkPaymentPaid(attrs: Record<string, unknown>) {
  const admin = createSupabaseAdminClient();

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
    await handleBalancePayment(linkId, paymentTransactionId, admin);
  }
}

async function handleBalancePayment(
  linkId: string,
  paymentTransactionId: string | null,
  admin: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, full_name, email, total_amount, amount_due, balance_payment_gateway_status")
    .eq("balance_payment_id", linkId)
    .maybeSingle();

  if (!booking) {
    console.error("[webhook] no booking found for balance payment link:", linkId);
    return;
  }

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip) {
    console.error("[webhook] trip not found for balance booking:", booking.id);
    return;
  }

  const { data: updatedBooking, error: updateError } = await admin
    .from("bookings")
    .update({
      balance_collected: true,
      balance_payment_gateway_status: "paid",
      ...(paymentTransactionId ? { balance_paymongo_payment_id: paymentTransactionId } : {}),
    })
    .eq("id", booking.id)
    .is("balance_payment_gateway_status", null)
    .select()
    .maybeSingle();

  if (updateError) {
    console.error(`[webhook] balance payment DB update failed for booking ${booking.id}:`, updateError);
    return;
  }
  if (!updatedBooking) {
    console.log(`[webhook] Duplicate balance payment delivery for booking ${booking.id} — skipping`);
    return;
  }

  const balance = Math.round(((booking.total_amount ?? 0) - (booking.amount_due ?? 0)) * 100) / 100;
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
  const tripDate = new Intl.DateTimeFormat("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: booking.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: `Balance payment received for ${trip.title}`,
      html: `
        <p>Hi ${escapeHtml(booking.full_name)},</p>
        <p>Your remaining balance of <strong>${fmt(balance)}</strong> for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been received. You are all set for your trip. See you there!</p>
        <p>You can view your booking at <a href="${SITE_URL}/profile">sama.com.ph/profile</a>.</p>
        <p>Sama</p>
      `,
    });
  } catch (err) {
    console.error("[webhook] failed to send balance payment confirmation to participant", err);
  }

  if (trip.organizer_id) {
    try {
      const { data: organizer } = await admin
        .from("organizers")
        .select("email")
        .eq("id", trip.organizer_id)
        .maybeSingle();

      if (organizer?.email) {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: organizer.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `Balance payment received: ${booking.full_name}, ${trip.title}`,
          html: `
            <p>Hi,</p>
            <p><strong>${escapeHtml(booking.full_name)}</strong> has paid their remaining balance of <strong>${fmt(balance)}</strong> for <strong>${escapeHtml(trip.title)}</strong> online through Sama.</p>
            <p>This will be remitted to you 24 to 48 hours after the trip date.</p>
            <p>Sama</p>
          `,
        });
      }
    } catch (err) {
      console.error("[webhook] failed to send balance payment notification to organizer", err);
    }
  }

  revalidatePath("/profile");
  revalidatePath("/organizer/dashboard");
  revalidatePath(`/organizer/trips/${trip.slug}/bookings`);
}
