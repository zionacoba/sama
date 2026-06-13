import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
if (!process.env.ADMIN_EMAIL) console.warn("[config] ADMIN_EMAIL is not set — admin alerts will be skipped");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

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
  let paymentMethod: string | null = null;
  let paymentTransactionId: string | null = null;
  const payments = linkAttrs?.payments as unknown[] | undefined;
  if (payments && payments.length > 0) {
    const first = payments[0] as Record<string, unknown>;
    // PayMongo may wrap the payment resource under a `data` key or not.
    const resource = (first.data ?? first) as Record<string, unknown>;
    paymentTransactionId = (resource.id as string) ?? null;
    const pAttrs = resource.attributes as Record<string, unknown> | undefined;
    const source = pAttrs?.source as Record<string, unknown> | undefined;
    paymentMethod = (source?.type as string) ?? null;
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, full_name, email, slots, total_amount, amount_due, payment_option, meeting_point, payment_gateway_status, status, cancellation_policy")
    .eq("payment_id", linkId)
    .maybeSingle();

  if (!booking) {
    // Not an initial payment — check if it's a balance payment.
    await handleBalancePayment(linkId, paymentTransactionId, admin);
    return;
  }

  // Idempotency: skip if already processed.
  if (booking.payment_gateway_status === "paid") {
    return;
  }

  // Do not resurrect bookings that are no longer active.
  if (
    booking.status === "cancelled" ||
    booking.status === "rejected" ||
    booking.status === "transferred"
  ) {
    // A cancelled booking with no gateway status was cancelled by the cleanup job, not the user.
    // The payment still went through — a manual refund is required.
    if (booking.status === "cancelled" && booking.payment_gateway_status === null && ADMIN_EMAIL) {
      const fmt = (n: number) =>
        new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: "Action needed: payment received for cancelled booking, manual refund required",
          html: `
            <p>A payment was received for a booking that was already cancelled by the cleanup job.</p>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Amount:</strong> ${fmt(booking.total_amount ?? 0)}</p>
            <p><strong>Participant email:</strong> ${escapeHtml(booking.email)}</p>
            <p>Please issue a manual refund via the PayMongo dashboard.</p>
          `,
        });
      } catch (alertErr) {
        console.error("[webhook] failed to send cancelled-booking payment alert:", alertErr);
      }
    }
    console.warn(`[webhook] booking ${booking.id} has status '${booking.status}' — skipping paid event`);
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

  const { data: updatedBooking, error: updateError } = await admin
    .from("bookings")
    .update({
      status: newStatus,
      payment_gateway_status: "paid",
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
      ...(paymentTransactionId ? { paymongo_payment_id: paymentTransactionId } : {}),
    })
    .eq("id", booking.id)
    .is("payment_gateway_status", null)
    .select()
    .maybeSingle();

  if (updateError) {
    console.error(`[webhook] DB update failed for booking ${booking.id}:`, updateError);
    if (ADMIN_EMAIL) {
      const fmt = (n: number) =>
        new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: "Action needed: booking stuck in payment_pending",
          html: `
            <p>A webhook DB update failed. The booking is stuck in <strong>payment_pending</strong> and needs manual recovery.</p>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
            <p><strong>Amount:</strong> ${fmt(booking.total_amount)}</p>
            <p><strong>Participant email:</strong> ${escapeHtml(booking.email)}</p>
            <p><strong>Error:</strong> ${escapeHtml(updateError.message)}</p>
          `,
        });
      } catch (alertErr) {
        console.error("[webhook] failed to send stuck booking alert", alertErr);
      }
    }
    return;
  }

  if (!updatedBooking) {
    // Idempotency: already processed.
    console.log(`[webhook] Duplicate delivery for booking ${booking.id} — skipping`);
    return;
  }

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

  // Participant confirmation email — failure triggers admin alert so no booking is silently missed.
  try {
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
          <p>Sama</p>
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
          <p>The organizer will review your request. This usually takes 24 to 48 hours. You can track your booking at <a href="${SITE_URL}/profile">sama.com.ph/profile</a>.</p>
          <p>Sama</p>
        `,
    });
  } catch (err) {
    console.error("[webhook] booking confirmation email failed:", err);
    if (ADMIN_EMAIL) {
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: "Action needed: booking confirmation email failed to send",
          html: `
            <p>The booking confirmation email failed to send. The booking was created successfully but the participant was not notified.</p>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
            <p><strong>Participant email:</strong> ${escapeHtml(booking.email)}</p>
            <p><strong>Error:</strong> ${escapeHtml(String(err))}</p>
            <p>Please send a manual confirmation to the participant.</p>
          `,
        });
      } catch (alertErr) {
        console.error("[webhook] failed to send confirmation email alert:", alertErr);
      }
    }
  }

  // Organizer new-booking notification.
  if (trip.organizer_id) {
    try {
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
            <p style="font-size:13px;color:#78716c;border-top:1px solid #e7e5e4;margin-top:16px;padding-top:12px;">
              <strong>When will you receive this payment?</strong><br/>
              ${isDownpay
                ? `This downpayment will be remitted to you the following Tuesday after the booking date. The participant's balance will be remitted 24-48 hours after the trip date (if paid online through Sama), or you can collect it directly on the day.`
                : `This full payment will be remitted to you the following Tuesday after the booking date.`
              }
              If this booking was made less than 7 days before the trip, remittance happens the Tuesday after the trip date instead.
            </p>
            <p>Sama</p>
          `,
        });
      }
    } catch (err) {
      console.error("[webhook] organizer notification email failed:", err);
    }
  }

  revalidatePath(`/trips/${trip.slug}`);
  revalidatePath("/profile");
  revalidatePath("/organizer/dashboard");
  revalidatePath(`/organizer/trips/${trip.slug}/bookings`);
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
