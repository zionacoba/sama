import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

function verifySignature(rawBody: string, sigHeader: string, secret: string): boolean {
  const parts = sigHeader.split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  const testSig = parts.find((p) => p.startsWith("te="))?.slice(3);

  if (!timestamp || !testSig) return false;

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

  // Extract payment method from the payments array on the link.
  let paymentMethod: string | null = null;
  const payments = linkAttrs?.payments as unknown[] | undefined;
  if (payments && payments.length > 0) {
    const first = payments[0] as Record<string, unknown>;
    // PayMongo may wrap the payment resource under a `data` key or not.
    const resource = (first.data ?? first) as Record<string, unknown>;
    const pAttrs = resource.attributes as Record<string, unknown> | undefined;
    const source = pAttrs?.source as Record<string, unknown> | undefined;
    paymentMethod = (source?.type as string) ?? null;
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, full_name, email, slots, total_amount, amount_due, payment_option, meeting_point, payment_gateway_status")
    .eq("payment_id", linkId)
    .maybeSingle();

  if (!booking) {
    console.error("[webhook] no booking found for link:", linkId);
    return;
  }

  // Idempotency: skip if already processed.
  if (booking.payment_gateway_status === "paid") {
    return;
  }

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, title, date_start, difficulty, organizer_id, messenger_gc_link")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip) {
    console.error("[webhook] trip not found for booking:", booking.id);
    return;
  }

  const autoApprove = trip.difficulty === "Beginner" || trip.difficulty === "Intermediate";
  const newStatus = autoApprove ? "confirmed" : "pending";

  await admin
    .from("bookings")
    .update({
      status: newStatus,
      payment_gateway_status: "paid",
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    })
    .eq("id", booking.id);

  try {
    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date(trip.date_start));

    const bookingRef = booking.id.toString(16).toUpperCase().slice(-8).padStart(8, "0");
    const fmt = (n: number) =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 0,
      }).format(n);

    const isDownpay =
      booking.payment_option === "downpayment" &&
      booking.amount_due != null &&
      booking.total_amount != null &&
      booking.amount_due < booking.total_amount;

    const amountLine = isDownpay
      ? `<li><strong>Amount paid:</strong> ${fmt(booking.amount_due)} downpayment</li><li><strong>Remaining balance:</strong> ${fmt(booking.total_amount - booking.amount_due)}</li>`
      : `<li><strong>Total paid:</strong> ${fmt(booking.total_amount)}</li>`;

    const balanceNote = isDownpay
      ? `<p>Your remaining balance of <strong>${fmt(booking.total_amount - booking.amount_due)}</strong> can be paid online through Sama or directly to your organizer on the day of the trip, whichever they prefer. Your organizer will let you know in the group chat.</p>`
      : "";

    const meetingLine = booking.meeting_point
      ? `<li><strong>Meeting point:</strong> ${escapeHtml(booking.meeting_point)}</li>`
      : "";

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: booking.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: autoApprove
        ? `You're confirmed for ${trip.title}!`
        : `Booking request received for ${trip.title}`,
      html: autoApprove
        ? `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Payment received! Your booking for <strong>${escapeHtml(trip.title)}</strong> is confirmed. Here's a summary:</p>
          <ul>
            <li><strong>Booking ref:</strong> ${bookingRef}</li>
            <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
            <li><strong>Date:</strong> ${tripDate}</li>
            <li><strong>Slots booked:</strong> ${booking.slots}</li>
            ${amountLine}
            ${meetingLine}
          </ul>
          ${balanceNote}
          ${
            trip.messenger_gc_link
              ? `<p>Join the group chat for trip updates and coordination:<br>
          <a href="${escapeHtml(trip.messenger_gc_link)}">${escapeHtml(trip.messenger_gc_link)}</a></p>`
              : ""
          }
          <p>You can view your booking at <a href="${SITE_URL}/profile">sama.com.ph/profile</a>.</p>
          <p>— The Sama Team</p>
        `
        : `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Payment received! We've sent your request to join <strong>${escapeHtml(trip.title)}</strong> to the organizer for review. Here's a summary:</p>
          <ul>
            <li><strong>Booking ref:</strong> ${bookingRef}</li>
            <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
            <li><strong>Date:</strong> ${tripDate}</li>
            <li><strong>Slots requested:</strong> ${booking.slots}</li>
            ${amountLine}
            ${meetingLine}
          </ul>
          ${balanceNote}
          <p>The organizer will review your request. This usually takes 24–48 hours. You can track your booking at <a href="${SITE_URL}/profile">sama.com.ph/profile</a>.</p>
          <p>— The Sama Team</p>
        `,
    });

    if (trip.organizer_id) {
      const { data: organizer } = await admin
        .from("organizers")
        .select("email")
        .eq("id", trip.organizer_id)
        .maybeSingle();

      if (organizer?.email) {
        const paymentRow = isDownpay
          ? `<li><strong>Payment:</strong> ${fmt(booking.amount_due)} downpayment (balance: ${fmt(booking.total_amount - booking.amount_due)})</li>`
          : `<li><strong>Payment:</strong> ${fmt(booking.total_amount)} (full payment)</li>`;

        await resend.emails.send({
          from: FROM_ADDRESS,
          to: organizer.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `New booking for ${trip.title}`,
          html: `
            <p>Hi,</p>
            <p><strong>${escapeHtml(booking.full_name)}</strong> (${escapeHtml(booking.email)}) just paid and booked <strong>${booking.slots} slot${booking.slots !== 1 ? "s" : ""}</strong> on your trip:</p>
            <ul>
              <li><strong>Booking ref:</strong> ${bookingRef}</li>
              <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              ${paymentRow}
            </ul>
            ${
              autoApprove
                ? `<p>This booking was <strong>automatically confirmed</strong> (${trip.difficulty} trip).</p>`
                : `<p>Log in to your <a href="${SITE_URL}/organizer/dashboard">organizer dashboard</a> to confirm or reject this booking.</p>`
            }
            <p>— The Sama Team</p>
          `,
        });
      }
    }
  } catch (err) {
    console.error("[webhook] email send error:", err);
  }

  revalidatePath(`/trips/${trip.slug}`);
  revalidatePath("/profile");
}
