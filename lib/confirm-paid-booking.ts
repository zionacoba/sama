import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

export type ConfirmOutcome =
  | "confirmed"
  | "already_paid"
  | "cancelled_needs_refund"
  | "not_found"
  | "skipped";

export type ConfirmResult = { outcome: ConfirmOutcome };

export type ConfirmBalanceOutcome = "confirmed" | "already_paid" | "not_found";

export type ConfirmBalanceResult = { outcome: ConfirmBalanceOutcome };

/**
 * Extract the payment method and PayMongo payment transaction id from the
 * `payments` array on a PayMongo link resource. PayMongo may wrap each payment
 * resource under a `data` key or not, so both shapes are handled. This is the
 * exact extraction the webhook has always used, now shared with the
 * reconciliation paths so all callers parse the link identically.
 */
export function extractPaymentDetails(
  payments: unknown[] | undefined,
): { paymentMethod: string | null; paymentTransactionId: string | null } {
  let paymentMethod: string | null = null;
  let paymentTransactionId: string | null = null;
  if (payments && payments.length > 0) {
    const first = payments[0] as Record<string, unknown>;
    const resource = (first.data ?? first) as Record<string, unknown>;
    paymentTransactionId = (resource.id as string) ?? null;
    const pAttrs = resource.attributes as Record<string, unknown> | undefined;
    const source = pAttrs?.source as Record<string, unknown> | undefined;
    paymentMethod = (source?.type as string) ?? null;
  }
  return { paymentMethod, paymentTransactionId };
}

export type PaymongoLinkPayment = {
  status: string | null;
  paymentMethod: string | null;
  paymentTransactionId: string | null;
};

/**
 * Query PayMongo for the current status of a payment link and extract the
 * payment details. Reuses the same GET /v1/links/{id} pattern and Basic auth
 * header used elsewhere. Throws on any configuration or API error so callers
 * can fail safe (never confirm or cancel on an inconclusive result).
 */
export async function fetchPaymongoLinkPayment(linkId: string): Promise<PaymongoLinkPayment> {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYMONGO_SECRET_KEY not configured");
  }
  const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
  const res = await fetch(`https://api.paymongo.com/v1/links/${linkId}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`PayMongo link fetch failed: ${res.status}`);
  }
  const data = await res.json();
  const attrs = data.data?.attributes as Record<string, unknown> | undefined;
  const status = (attrs?.status as string) ?? null;
  const { paymentMethod, paymentTransactionId } = extractPaymentDetails(
    attrs?.payments as unknown[] | undefined,
  );
  return { status, paymentMethod, paymentTransactionId };
}

/**
 * Confirm a booking whose initial payment link has been paid.
 *
 * This is the single source of truth for booking confirmation. It is called by
 * the PayMongo webhook, the payment success page, and the cleanup reconcile
 * route. It is idempotent and race-safe: the UPDATE keeps the
 * `.is("payment_gateway_status", null)` guard so concurrent callers can never
 * double-confirm or double-email.
 *
 * @param linkId The PayMongo link id stored as `bookings.payment_id`.
 * @param paymentMethod The payment method parsed from the link's payments array.
 * @param paymentTransactionId The PayMongo payment transaction id.
 */
export async function confirmPaidBooking(
  linkId: string,
  paymentMethod: string | null,
  paymentTransactionId: string | null,
): Promise<ConfirmResult> {
  const admin = createSupabaseAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, full_name, email, slots, total_amount, amount_due, payment_option, meeting_point, payment_gateway_status, status, cancellation_policy")
    .eq("payment_id", linkId)
    .maybeSingle();

  if (!booking) {
    // No initial-payment booking matches this link. The caller decides what to
    // do next (e.g. the webhook checks for a balance payment).
    return { outcome: "not_found" };
  }

  // Idempotency: skip if already processed.
  if (booking.payment_gateway_status === "paid") {
    return { outcome: "already_paid" };
  }

  // Do not resurrect bookings that are no longer active.
  if (
    booking.status === "cancelled" ||
    booking.status === "rejected" ||
    booking.status === "transferred"
  ) {
    // A cancelled booking with no gateway status was cancelled by the cleanup job, not the user.
    // The payment still went through — a manual refund is required.
    if (booking.status === "cancelled" && booking.payment_gateway_status === null) {
      // Record a durable 'manual' refund row for reconciliation. We deliberately
      // do NOT auto-issue a refund for a cancelled booking — a human reviews and
      // processes it in the PayMongo dashboard (the retry cron skips 'manual').
      // payment_id is the PayMongo transaction id (not the link id) because the
      // retry cron queries GET /v1/payments/{payment_id}. amount is amount_due
      // (what the customer actually paid on the initial link), not total_amount
      // which overstates it for downpayment bookings.
      try {
        // Lightweight duplicate guard: the partial unique index only covers
        // processing/done, not manual, and both the webhook and reconcile paths
        // can reach this branch. Pre-check for an existing manual row. Not fully
        // race-proof; a rare duplicate is acceptable and an admin will see it.
        let existingQuery = admin
          .from("refunds")
          .select("id")
          .eq("booking_id", booking.id)
          .eq("source", "downpayment");
        existingQuery = paymentTransactionId
          ? existingQuery.eq("payment_id", paymentTransactionId)
          : existingQuery.is("payment_id", null);
        const { data: existingRefund } = await existingQuery.maybeSingle();

        if (!existingRefund) {
          const { error: refundInsertError } = await admin.from("refunds").insert({
            booking_id: booking.id,
            source: "downpayment",
            payment_id: paymentTransactionId,
            amount: booking.amount_due,
            status: "manual",
            reason: "others",
            last_error: "Payment received for booking already cancelled by cleanup job",
          });
          if (refundInsertError) {
            console.error(`[confirm-paid-booking] failed to record manual refund row for booking ${booking.id}:`, refundInsertError.message);
          }
        }
      } catch (refundErr) {
        console.error(`[confirm-paid-booking] error recording manual refund row for booking ${booking.id}:`, refundErr);
      }

      if (ADMIN_EMAIL) {
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
              <p><strong>Amount:</strong> ${fmt(booking.amount_due ?? 0)}</p>
              <p><strong>Participant email:</strong> ${escapeHtml(booking.email)}</p>
              <p>Please issue a manual refund via the PayMongo dashboard.</p>
            `,
          });
        } catch (alertErr) {
          console.error("[confirm-paid-booking] failed to send cancelled-booking payment alert:", alertErr);
        }
      }
      console.warn(`[confirm-paid-booking] booking ${booking.id} has status 'cancelled' with no gateway status — manual refund recorded`);
      Sentry.captureException(
        new Error(`Payment received for cancelled booking ${booking.id} — manual refund required`),
        { extra: { context: "paid-but-cancelled", bookingId: booking.id, linkId, amount: booking.amount_due } },
      );
      return { outcome: "cancelled_needs_refund" };
    }
    console.warn(`[confirm-paid-booking] booking ${booking.id} has status '${booking.status}' — skipping paid event`);
    return { outcome: "skipped" };
  }

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, title, date_start, difficulty, organizer_id, messenger_gc_link")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip) {
    console.error("[confirm-paid-booking] trip not found for booking:", booking.id);
    return { outcome: "skipped" };
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
    console.error(`[confirm-paid-booking] DB update failed for booking ${booking.id}:`, updateError);
    Sentry.captureException(updateError, {
      extra: { context: "confirm-paid-db-update-failed", bookingId: booking.id, linkId, amount: booking.total_amount },
    });
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
            <p>A confirmation DB update failed. The booking is stuck in <strong>payment_pending</strong> and needs manual recovery.</p>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
            <p><strong>Amount:</strong> ${fmt(booking.total_amount)}</p>
            <p><strong>Participant email:</strong> ${escapeHtml(booking.email)}</p>
            <p><strong>Error:</strong> ${escapeHtml(updateError.message)}</p>
          `,
        });
      } catch (alertErr) {
        console.error("[confirm-paid-booking] failed to send stuck booking alert", alertErr);
      }
    }
    return { outcome: "skipped" };
  }

  if (!updatedBooking) {
    // Idempotency: another path confirmed between our read and write.
    console.log(`[confirm-paid-booking] booking ${booking.id} already confirmed by a concurrent path — skipping`);
    return { outcome: "already_paid" };
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
    console.error("[confirm-paid-booking] booking confirmation email failed:", err);
    Sentry.captureException(err, {
      extra: { context: "confirm-paid-confirmation-email-failed", bookingId: booking.id, email: booking.email },
    });
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
        console.error("[confirm-paid-booking] failed to send confirmation email alert:", alertErr);
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
      console.error("[confirm-paid-booking] organizer notification email failed:", err);
    }
  }

  // Email the booker the join links for any additional participants who still
  // need to complete their own details and sign the waiver. This runs for both
  // confirmed and pending outcomes, matching the free path in createBooking.
  // It sits inside the once-only confirmation block (guarded by the
  // payment_gateway_status null check on the UPDATE above), so it can send at
  // most once per booking even if the webhook and reconcile paths race.
  try {
    const { data: incompleteParticipants, error: participantsError } = await admin
      .from("booking_participants")
      .select("slot_number, token")
      .eq("booking_id", booking.id)
      .eq("completed", false)
      .order("slot_number", { ascending: true });

    if (participantsError) {
      console.error(`[confirm-paid-booking] participants fetch error for booking ${booking.id}:`, participantsError.message);
    }

    if (incompleteParticipants && incompleteParticipants.length > 0) {
      const joinLinks = incompleteParticipants
        .map(
          (p) =>
            `<li>Participant ${p.slot_number + 1}: <a href="${SITE_URL}/join/${p.token}">${SITE_URL}/join/${p.token}</a></li>`,
        )
        .join("");
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Action needed: participant details for ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>You booked <strong>${booking.slots} slots</strong> for <strong>${escapeHtml(trip.title)}</strong>. Each of your additional participants needs to complete their own details and sign the waiver before the trip.</p>
          <p>Please forward the right link below to each person so they can fill in their name, emergency contact, and sign the waiver:</p>
          <ul>${joinLinks}</ul>
          <p>Each link is unique to one participant, so make sure the right person gets the right link.</p>
          <p>Sama</p>
        `,
      });
    }
  } catch (err) {
    console.error("[confirm-paid-booking] failed to send participant join links to booker", err);
    Sentry.captureException(err, {
      extra: { context: "confirm-paid-join-links-email-failed", bookingId: booking.id, email: booking.email },
    });
    if (ADMIN_EMAIL) {
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: "Action needed: participant join links failed to send",
          html: `
            <p>The participant join-links email failed to send. The booker did not receive the links, so additional participants cannot complete their waivers.</p>
            <p><strong>Booking ID:</strong> ${booking.id}</p>
            <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
            <p><strong>Booker email:</strong> ${escapeHtml(booking.email)}</p>
            <p><strong>Error:</strong> ${escapeHtml(String(err))}</p>
            <p>Please resend the join links to the booker manually.</p>
          `,
        });
      } catch (alertErr) {
        console.error("[confirm-paid-booking] failed to send join-links failure alert", alertErr);
      }
    }
  }

  // revalidatePath throws if called during a server-component render (the
  // success page reconcile path). Guard it so confirmation never fails for a
  // caller that has already committed the DB update and sent the emails.
  try {
    revalidatePath(`/trips/${trip.slug}`);
    revalidatePath("/profile");
    revalidatePath("/organizer/dashboard");
    revalidatePath(`/organizer/trips/${trip.slug}/bookings`);
  } catch (revalErr) {
    console.warn("[confirm-paid-booking] revalidatePath skipped:", revalErr);
  }

  return { outcome: "confirmed" };
}

/**
 * Confirm a booking whose BALANCE payment link has been paid.
 *
 * This is the single source of truth for balance confirmation, mirroring
 * confirmPaidBooking for the initial payment. It is called by the PayMongo
 * webhook, the payment success page, and the cleanup reconcile route. It is
 * idempotent and race-safe: the UPDATE keeps the
 * `.is("balance_payment_gateway_status", null)` guard so concurrent callers can
 * never double-confirm or double-email.
 *
 * Behavior matches the webhook's previous inline handler exactly: it does not
 * gate on booking status (a balance link only exists on a confirmed booking),
 * it sets the three balance columns, sends the participant + organizer balance
 * emails, and revalidates the profile / organizer paths.
 *
 * @param linkId The PayMongo link id stored as `bookings.balance_payment_id`.
 * @param paymentTransactionId The PayMongo payment transaction id (when known).
 * @param admin Optional shared admin client; one is created if not supplied.
 */
export async function confirmPaidBalance(
  linkId: string,
  paymentTransactionId: string | null,
  admin: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<ConfirmBalanceResult> {
  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, full_name, email, total_amount, amount_due, balance_payment_gateway_status")
    .eq("balance_payment_id", linkId)
    .maybeSingle();

  if (!booking) {
    // No booking matches this balance link.
    return { outcome: "not_found" };
  }

  // Idempotency: skip if already processed.
  if (booking.balance_payment_gateway_status === "paid") {
    return { outcome: "already_paid" };
  }

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip) {
    console.error("[confirm-paid-balance] trip not found for balance booking:", booking.id);
    return { outcome: "not_found" };
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
    console.error(`[confirm-paid-balance] balance payment DB update failed for booking ${booking.id}:`, updateError);
    // Could not act — report not_found so callers do not treat this as confirmed.
    return { outcome: "not_found" };
  }
  if (!updatedBooking) {
    // Idempotency: another path confirmed between our read and write.
    console.log(`[confirm-paid-balance] Duplicate balance confirmation for booking ${booking.id} — skipping`);
    return { outcome: "already_paid" };
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
    console.error("[confirm-paid-balance] failed to send balance payment confirmation to participant", err);
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
      console.error("[confirm-paid-balance] failed to send balance payment notification to organizer", err);
    }
  }

  // revalidatePath throws if called during a server-component render (the
  // success page reconcile path). Guard it so confirmation never fails for a
  // caller that has already committed the DB update and sent the emails.
  try {
    revalidatePath("/profile");
    revalidatePath("/organizer/dashboard");
    revalidatePath(`/organizer/trips/${trip.slug}/bookings`);
  } catch (revalErr) {
    console.warn("[confirm-paid-balance] revalidatePath skipped:", revalErr);
  }

  return { outcome: "confirmed" };
}
