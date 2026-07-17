"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { sendAdminAlert } from "@/lib/admin-alert";
import { escapeHtml } from "@/lib/escape-html";
import { calculateRefundAmount } from "@/lib/cancellation-policies";
import { amountJoinerPaid, computeRefundSplit, shouldRefundOnReject } from "@/lib/booking-finance";
import { ACTIVE_BOOKING_STATUSES, SLOT_HOLDING_STATUSES } from "@/lib/booking-status";
import { organizerOwns } from "@/lib/authz";
import { type RefundResult } from "@/lib/paymongo-refund";
import { classifyRefundResult, MANUAL_REFUND_FOLLOWUP } from "@/lib/refund-email-copy";
import { issueAndRecordRefund } from "@/lib/refunds";
import { voidBookingCredit, reverseBookingCredit } from "@/lib/organizer-credits";
import { createPaymentCheckout } from "@/lib/create-payment-link";
import { hasPaidPayment } from "@/lib/paymongo-checkout";
import { notifyWaitlistSlotOpened } from "@/lib/waitlist-notify";
import { formatPeso, formatBookingRef } from "@/lib/format";
import { resolveBookingCommissionRate } from "@/lib/commission";
import { resolvePastTripGate } from "@/lib/past-trip-gate";
import { DEFAULT_WAIVER_TEXT, PLATFORM_WAIVER_SNAPSHOT_TEXT } from "@/lib/constants";
import { withParticipantAdultAttestation } from "@/lib/waiver-snapshot";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

type CreateBookingInput = {
  tripSlug: string;
  fullName: string;
  email: string;
  phone: string;
  slots: number;
  totalAmount: number;
  notes: string | null;
  paymentOption: "full" | "downpayment";
  amountDue: number;
  participants: string[] | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  waiverAgreed: boolean;
  platformWaiverAgreed: boolean;
  adultConfirmed: boolean;
  medicalNotes: string | null;
  meetingPoint: string | null;
  customQuestionAnswers: string[] | null;
};

export async function createBooking(input: CreateBookingInput) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Use admin client for all DB operations so RLS never blocks reads or
  // writes, and RETURNING clauses always get back the new row's id.
  const admin = createSupabaseAdminClient();

  if (!input.slots || !Number.isInteger(input.slots)) {
    return { error: "Please select a valid number of slots." };
  }

  if (input.slots < 1) {
    return { error: "Please select at least 1 slot." };
  }

  if (input.slots > 10) {
    return { error: "You cannot book more than 10 slots at a time." };
  }

  if (!input.emergencyContactName?.trim()) return { error: "Emergency contact name is required." };
  if (!input.emergencyContactPhone?.trim()) return { error: "Emergency contact phone is required." };
  if (input.phone.replace(/\s/g, "") === input.emergencyContactPhone.replace(/\s/g, "")) {
    return { error: "Emergency contact phone must be different from your own phone number." };
  }

  // Identity/format validations — mirror the client. No DB dependency, so fail fast.
  if (!input.fullName?.trim()) return { error: "Full name is required." };
  if (!input.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return { error: "A valid email address is required." };
  }
  if (!/^(\+63|0)\d{9,10}$/.test((input.phone ?? "").replace(/\s/g, ""))) {
    return { error: "Please enter a valid Philippine phone number (09XX or +63)." };
  }

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, title, date_start, remaining_slots, organizer_id, difficulty, status, price, payment_type, min_downpayment, downpayment_cutoff_days, messenger_gc_link, waiver_text, cancellation_policy, meeting_points, custom_questions, custom_question")
    .eq("slug", input.tripSlug)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[createBooking] trip fetch error:", tripFetchError.code, tripFetchError.message, tripFetchError.details);
    Sentry.captureException(tripFetchError, {
      extra: { context: "createBooking-trip-fetch-failed", userId: user.id },
    });
  }
  if (!trip) return { error: "Trip not found." };

  if (trip.status !== "active" || trip.date_start < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())) {
    return { error: "This trip is no longer available for booking." };
  }

  if (input.slots > trip.remaining_slots) {
    return {
      error: trip.remaining_slots > 0
        ? `Sorry, only ${trip.remaining_slots} slot${trip.remaining_slots !== 1 ? "s are" : " is"} available for this trip.`
        : "Sorry, this trip is fully booked.",
    };
  }
  if (!input.waiverAgreed || !input.platformWaiverAgreed) {
    return { error: "You must agree to both waivers before booking." };
  }
  if (input.adultConfirmed !== true) {
    return { error: "You must confirm that you and all other participants in this booking are 18 years of age or older." };
  }

  // Prevent duplicate bookings for the same trip (cancelled/rejected/transferred bookings allow re-booking).
  const { data: existingBooking } = await admin
    .from("bookings")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .not("status", "in", '("cancelled","rejected","transferred")')
    .maybeSingle();

  if (existingBooking) {
    return { error: "You already have a booking for this trip." };
  }

  // Prevent organizers from booking their own trips.
  const { data: selfOrganizer } = await admin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", trip.organizer_id)
    .maybeSingle();

  if (selfOrganizer) {
    return { error: "Organizers cannot book their own trips." };
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneMinuteAgo);

  if ((recentCount ?? 0) >= 3) {
    return { error: "Too many booking attempts. Please wait a moment and try again." };
  }

  // Meeting-point validation — only enforce when the trip actually has pickup points.
  // The client auto-selects the sole point when there is exactly one, so a presence
  // plus membership check never breaks legitimate single-point bookings.
  const tripMeetingPoints = (trip.meeting_points ?? []) as { location: string; time: string }[];
  if (tripMeetingPoints.length > 0) {
    const selected = input.meetingPoint?.trim();
    if (!selected || !tripMeetingPoints.some((mp) => mp.location === selected)) {
      return { error: "Please select a valid pickup point." };
    }
  }

  // Custom-questions validation — reconstruct active questions the same way the
  // client and trip detail page do, including the legacy single-question fallback.
  const activeQuestions = (trip.custom_questions ?? (trip.custom_question ? [trip.custom_question] : []))
    .filter((q: string) => q.trim());
  if (activeQuestions.length > 0) {
    const answers = input.customQuestionAnswers;
    if (
      !Array.isArray(answers) ||
      answers.length !== activeQuestions.length ||
      answers.some((a) => !a?.trim())
    ) {
      return { error: "Please answer all of the organizer's questions." };
    }
  }

  // Compute amounts server-side — never trust client-provided values.
  const computedTotal = Math.round(Number(trip.price) * input.slots * 100) / 100;
  const daysUntil = Math.floor((new Date(trip.date_start).getTime() - Date.now()) / 86_400_000);
  const canDownpay = trip.payment_type === "downpayment"
    && trip.min_downpayment != null
    && Number(trip.min_downpayment) < Number(trip.price)
    && daysUntil > (trip.downpayment_cutoff_days ?? 0);
  const computedAmountDue = input.paymentOption === "downpayment" && canDownpay
    ? Math.round(Math.min(Number(trip.min_downpayment) * input.slots, computedTotal) * 100) / 100
    : computedTotal;
  const { data: tripOrganizer, error: organizerFetchError } = await admin
    .from("organizers")
    .select("display_name, full_name, commission_rate")
    .eq("id", trip.organizer_id)
    .maybeSingle();
  const rateResolution = resolveBookingCommissionRate(tripOrganizer, organizerFetchError);
  if ("failure" in rateResolution) {
    if (organizerFetchError) {
      console.error("[createBooking] organizer commission fetch error:", organizerFetchError.code, organizerFetchError.message, organizerFetchError.details);
    } else {
      console.error("[createBooking] organizer commission rate missing for organizer:", trip.organizer_id);
    }
    Sentry.captureException(
      organizerFetchError ?? new Error(`organizer commission_rate missing for organizer ${trip.organizer_id}`),
      {
        extra: { context: "createBooking-organizer-rate-failed", tripId: trip.id, userId: user.id, organizerId: trip.organizer_id },
      },
    );
    return { error: "Booking failed. Please try again or contact support." };
  }
  const organizerName = tripOrganizer?.display_name ?? tripOrganizer?.full_name ?? "";
  const commissionRate = rateResolution.rate;
  const platformCommission = Math.round(computedTotal * commissionRate * 100) / 100;

  const requestHeaders = await headers();
  const waiverIp = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? null;

  // Decrement remaining_slots and insert the booking row in one transaction.
  // If either operation fails the whole thing rolls back — no slot leak possible.
  const { data: newBookingId, error: bookingError } = await admin.rpc("book_slot_and_create_booking", {
    p_trip_id: trip.id,
    p_user_id: user.id,
    p_slots_requested: input.slots,
    p_full_name: input.fullName,
    p_email: input.email,
    p_phone: input.phone,
    p_total_amount: computedTotal,
    p_status: "payment_pending",
    p_notes: input.notes,
    p_payment_option: input.paymentOption,
    p_amount_due: computedAmountDue,
    p_participants: input.participants,
    p_emergency_contact_name: input.emergencyContactName,
    p_emergency_contact_phone: input.emergencyContactPhone,
    p_waiver_agreed: input.waiverAgreed,
    p_waiver_agreed_at: input.waiverAgreed ? new Date().toISOString() : null,
    p_platform_waiver_agreed: input.platformWaiverAgreed,
    p_medical_notes: input.medicalNotes,
    p_meeting_point: input.meetingPoint,
    p_platform_commission: platformCommission,
    p_commission_rate_used: commissionRate,
    p_waiver_text_snapshot: trip.waiver_text?.replace(/\[Organizer Name\]/gi, organizerName) ?? null,
    p_waiver_ip: waiverIp,
    p_platform_waiver_snapshot: PLATFORM_WAIVER_SNAPSHOT_TEXT,
    p_custom_question_answers: input.customQuestionAnswers ?? null,
    // Snapshot the question text as-asked, index-aligned with the answers (both
    // derive from the same activeQuestions array), so answers survive later
    // trip question edits. Empty -> null, matching how no-answers passes null.
    p_custom_questions_snapshot: activeQuestions.length > 0 ? activeQuestions : null,
  });

  if (bookingError || newBookingId == null) {
    console.error("[createBooking] book_slot_and_create_booking error:", bookingError?.code, bookingError?.message, bookingError?.details);
    if (bookingError?.message?.includes("not_enough_slots")) {
      return { error: "This trip is fully booked." };
    }
    if (bookingError?.code === "23505") {
      return { error: "You already have an active booking for this trip." };
    }
    Sentry.captureException(bookingError ?? new Error("book_slot_and_create_booking returned null id with no error"), {
      extra: { context: "createBooking-book-slot-rpc-failed", tripId: trip.id, userId: user.id },
    });
    return { error: "Booking failed. Please try again or contact support." };
  }

  const newBooking = { id: newBookingId as number };

  // Insert one booking_participants row per slot.
  const now = new Date().toISOString();
  const participantRows = Array.from({ length: input.slots }, (_, i) => ({
    booking_id: newBooking.id,
    slot_number: i,
    token: randomUUID(),
    full_name: i === 0 ? input.fullName : null,
    emergency_contact_name: i === 0 ? input.emergencyContactName : null,
    emergency_contact_phone: i === 0 ? input.emergencyContactPhone : null,
    medical_notes: i === 0 ? input.medicalNotes : null,
    meeting_point: i === 0 ? input.meetingPoint : null,
    waiver_accepted: i === 0,
    waiver_accepted_at: i === 0 ? now : null,
    // Snapshot the same resolved waiver text recorded on the bookings row so every
    // participant (booker and additional slots) has parity going forward. Slots
    // 1..n capture their own waiver_ip later via confirmParticipant; slot 0's IP
    // is already on the bookings row, so we do not set waiver_ip here. The 18+
    // attestation is folded in so each participant's stored waiver carries the
    // exact language they accept on /join.
    waiver_text_snapshot: withParticipantAdultAttestation(trip.waiver_text?.replace(/\[Organizer Name\]/gi, organizerName) ?? null),
    completed: i === 0,
  }));

  // Critical write: without participant rows the booker has no waiver record and
  // no join tokens, so the booking would break after payment. This runs BEFORE
  // any payment (the PayMongo link path is below), so on failure we roll back the
  // slot and delete the booking exactly like the payment-link-failure path does —
  // no money is involved yet.
  const { error: participantsError } = await admin
    .from("booking_participants")
    .insert(participantRows);
  if (participantsError) {
    console.error("[createBooking] participant insert failed, rolling back booking:", participantsError);
    Sentry.captureException(participantsError, {
      extra: { context: "createBooking-participant-insert-rollback", bookingId: newBooking.id, tripId: trip.id, slots: input.slots },
    });
    const { error: delErr } = await admin.from("bookings").delete().eq("id", newBooking.id);
    if (delErr) {
      console.error("[createBooking] rollback delete failed; leaving for cleanup:", delErr);
      Sentry.captureException(delErr, {
        extra: { context: "createBooking-participant-rollback-delete-failed", bookingId: newBooking.id, tripId: trip.id },
      });
      // Do NOT restore the slot; cleanup-abandoned-payments owns slot restore for surviving payment_pending rows.
    } else {
      await admin.rpc("restore_slot", { p_trip_id: trip.id, p_slots_requested: input.slots });
    }
    return { error: "Booking failed. Please try again or contact support." };
  }

  // Remove any waitlist entry for this user+trip now that they have a booking.
  // Non-fatal: a stale waitlist row is low-severity and must not block the booking.
  const { error: waitlistDeleteError } = await admin
    .from("waitlist")
    .delete()
    .eq("trip_id", trip.id)
    .eq("user_id", user.id);
  if (waitlistDeleteError) {
    console.error("[createBooking] failed to remove waitlist entry after booking:", waitlistDeleteError);
    Sentry.captureException(waitlistDeleteError, {
      extra: { context: "createBooking-waitlist-delete-failed", bookingId: newBooking.id, tripId: trip.id, userId: user.id },
    });
  }

  // Snapshot the cancellation policy at booking time so later trip changes don't affect this booking.
  // Non-fatal: a missing policy snapshot is low-severity and must not block the booking.
  const { error: policyUpdateError } = await admin
    .from("bookings")
    .update({ cancellation_policy: trip.cancellation_policy ?? null })
    .eq("id", newBooking.id);
  if (policyUpdateError) {
    console.error("[createBooking] failed to snapshot cancellation policy:", policyUpdateError);
    Sentry.captureException(policyUpdateError, {
      extra: { context: "createBooking-cancellation-policy-snapshot-failed", bookingId: newBooking.id, tripId: trip.id },
    });
  }

  const participantTokens =
    input.slots > 1
      ? participantRows.slice(1).map((p) => ({ slotIndex: p.slot_number, token: p.token }))
      : [];

  const bookingRef = formatBookingRef(newBooking.id);

  // Free trips: skip PayMongo and confirm immediately.
  if (computedAmountDue === 0) {
    const autoApprove = trip.difficulty === "Beginner" || trip.difficulty === "Intermediate";
    await admin
      .from("bookings")
      .update({ status: autoApprove ? "confirmed" : "pending" })
      .eq("id", newBooking.id);

    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
    }).format(new Date(trip.date_start));

    if (autoApprove) {
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: input.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `You're confirmed for ${trip.title}!`,
          html: `
            <p>Hi ${escapeHtml(input.fullName)},</p>
            <p>Your booking for <strong>${escapeHtml(trip.title)}</strong> is confirmed. Here's a summary:</p>
            <ul>
              <li><strong>Booking ref:</strong> ${bookingRef}</li>
              <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              <li><strong>Slots booked:</strong> ${input.slots}</li>
            </ul>
            ${trip.messenger_gc_link ? `<p>Join the group chat for trip updates and coordination:<br><a href="${escapeHtml(trip.messenger_gc_link)}">${escapeHtml(trip.messenger_gc_link)}</a></p>` : ""}
            <p>You can view your booking at <a href="${SITE_URL}/profile">sama.com.ph/profile</a>.</p>
            <p>Sama</p>
          `,
        });
      } catch (err) {
        console.error("[email] failed to send free booking confirmation", err);
        Sentry.captureException(err, {
          extra: { context: "createBooking-free-confirmation-email-failed", bookingId: newBooking.id, tripId: trip.id },
        });
      }
    }

    // Email the booker the join links for their additional participants so they
    // can forward them. Only when there is at least one incomplete slot (slots 2..n).
    if (participantTokens.length > 0) {
      try {
        const joinLinks = participantTokens
          .map(
            (p) =>
              `<li>Participant ${p.slotIndex + 1}: <a href="${SITE_URL}/join/${p.token}">${SITE_URL}/join/${p.token}</a></li>`,
          )
          .join("");
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: input.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `Action needed: participant details for ${trip.title}`,
          html: `
            <p>Hi ${escapeHtml(input.fullName)},</p>
            <p>You booked <strong>${input.slots} slots</strong> for <strong>${escapeHtml(trip.title)}</strong>. Each of your additional participants needs to complete their own details and sign the waiver before the trip.</p>
            <p>Please forward the right link below to each person so they can fill in their name, emergency contact, and sign the waiver:</p>
            <ul>${joinLinks}</ul>
            <p>Each link is unique to one participant, so make sure the right person gets the right link.</p>
            <p>Sama</p>
          `,
        });
      } catch (err) {
        console.error("[email] failed to send participant join links to booker", err);
        Sentry.captureException(err, {
          extra: { context: "createBooking-join-links-email-failed", bookingId: newBooking.id, tripId: trip.id },
        });
        await sendAdminAlert(
          "Action needed: participant join links failed to send",
          `
                <p>The participant join-links email failed to send. The booker did not receive the links, so additional participants cannot complete their waivers.</p>
                <p><strong>Booking ID:</strong> ${newBooking.id}</p>
                <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
                <p><strong>Booker email:</strong> ${escapeHtml(input.email)}</p>
                <p><strong>Error:</strong> ${escapeHtml(String(err))}</p>
                <p>Please resend the join links to the booker manually.</p>
              `,
        );
      }
    }

    // Notify organizer of new free booking.
    try {
      const { data: orgRow, error: orgRowError } = await admin
        .from("organizers")
        .select("email")
        .eq("id", trip.organizer_id)
        .maybeSingle();

      if (orgRowError) {
        console.error("[createBooking] organizer fetch for booking notification failed:", orgRowError);
        Sentry.captureException(orgRowError, {
          extra: { context: "createBooking-organizer-notify-fetch-failed", bookingId: newBooking.id, tripId: trip.id, organizerId: trip.organizer_id },
        });
      }

      if (orgRow?.email) {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: orgRow.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `New booking for ${trip.title}`,
          html: `
            <p>Hi,</p>
            <p><strong>${escapeHtml(input.fullName)}</strong> (${escapeHtml(input.email)}) just booked <strong>${input.slots} slot${input.slots !== 1 ? "s" : ""}</strong> on your trip:</p>
            <ul>
              <li><strong>Booking ref:</strong> ${bookingRef}</li>
              <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              <li><strong>Payment:</strong> Free trip</li>
            </ul>
            ${autoApprove
              ? `<p>This booking was <strong>automatically confirmed</strong> (${trip.difficulty} trip).</p>`
              : `<p>This booking requires your approval. Log in to your <a href="${SITE_URL}/organizer/dashboard">organizer dashboard</a> to confirm or reject.</p>`
            }
            <p>Sama</p>
          `,
        });
      }
    } catch (err) {
      console.error("[email] failed to send free booking organizer notification", err);
      Sentry.captureException(err, {
        extra: { context: "createBooking-organizer-notify-email-failed", bookingId: newBooking.id, tripId: trip.id },
      });
    }

    revalidatePath(`/trips/${input.tripSlug}`);
    revalidatePath("/organizer/dashboard");
    return { success: true as const, checkoutUrl: null, bookingRef };
  }

  // Create PayMongo payment link.
  const tripDateShort = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));
  const description = `Booking for ${trip.title} - ${tripDateShort}`;

  let checkoutUrl: string | null = null;
  try {
    const linkResult = await createPaymentCheckout({
      bookingId: newBooking.id,
      amount: computedAmountDue,
      description,
    });

    if ("error" in linkResult) {
      console.error("[createBooking] payment link creation failed:", linkResult.error);
      Sentry.captureException(new Error(`Payment link creation failed: ${linkResult.error}`), {
        extra: { context: "createBooking-payment-link-rollback", bookingId: newBooking.id, tripId: trip.id, slots: input.slots },
      });
      const { error: delErr } = await admin.from("bookings").delete().eq("id", newBooking.id);
      if (delErr) {
        console.error("[createBooking] rollback delete failed; leaving for cleanup:", delErr);
        Sentry.captureException(delErr, {
          extra: { context: "createBooking-payment-link-rollback-delete-failed", bookingId: newBooking.id, tripId: trip.id },
        });
        // Do NOT restore the slot; cleanup-abandoned-payments owns slot restore for surviving payment_pending rows.
      } else {
        await admin.rpc("restore_slot", { p_trip_id: trip.id, p_slots_requested: input.slots });
      }
      return { error: "We could not create your payment link. Please try again." };
    }

    checkoutUrl = linkResult.checkoutUrl;
    await admin
      .from("bookings")
      .update({ payment_id: linkResult.linkId })
      .eq("id", newBooking.id);
  } catch (err) {
    console.error("[createBooking] payment link error:", err);
    Sentry.captureException(err, {
      extra: { context: "createBooking-payment-link-error-rollback", bookingId: newBooking.id, tripId: trip.id, slots: input.slots },
    });
    const { error: delErr } = await admin.from("bookings").delete().eq("id", newBooking.id);
    if (delErr) {
      console.error("[createBooking] rollback delete failed; leaving for cleanup:", delErr);
      Sentry.captureException(delErr, {
        extra: { context: "createBooking-payment-link-catch-rollback-delete-failed", bookingId: newBooking.id, tripId: trip.id },
      });
      // Do NOT restore the slot; cleanup-abandoned-payments owns slot restore for surviving payment_pending rows.
    } else {
      await admin.rpc("restore_slot", { p_trip_id: trip.id, p_slots_requested: input.slots });
    }
    return { error: "We could not create your payment link. Please try again." };
  }

  if (!checkoutUrl) {
    console.error("[createBooking] payment link created but checkoutUrl missing, rolling back slot");
    Sentry.captureException(new Error("Payment link created but checkoutUrl missing"), {
      extra: { context: "createBooking-checkout-url-missing-rollback", bookingId: newBooking.id, tripId: trip.id, slots: input.slots },
    });
    const { error: delErr } = await admin.from("bookings").delete().eq("id", newBooking.id);
    if (delErr) {
      console.error("[createBooking] rollback delete failed; leaving for cleanup:", delErr);
      Sentry.captureException(delErr, {
        extra: { context: "createBooking-checkout-url-missing-rollback-delete-failed", bookingId: newBooking.id, tripId: trip.id },
      });
      // Do NOT restore the slot; cleanup-abandoned-payments owns slot restore for surviving payment_pending rows.
    } else {
      await admin.rpc("restore_slot", { p_trip_id: trip.id, p_slots_requested: input.slots });
    }
    return { error: "We could not create your payment link. Please try again." };
  }

  revalidatePath(`/trips/${input.tripSlug}`);
  revalidatePath("/organizer/dashboard");
  return {
    success: true as const,
    checkoutUrl,
    bookingRef,
  };
}

export async function updateBookingStatus(bookingId: number, status: "confirmed" | "rejected") {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (organizerError) {
    console.error("[update-booking-status] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "update-booking-status-organizer-fetch-failed", userId: user.id, bookingId },
    });
  }
  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, amount_due, payment_option, paymongo_payment_id, payment_method, payment_gateway_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error("[update-booking-status] booking fetch failed:", bookingError);
    Sentry.captureException(bookingError, {
      extra: { context: "update-booking-status-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };

  // Block acting on payment_pending bookings (no payment confirmed yet).
  if (booking.status === "payment_pending") {
    return { error: "This booking is awaiting payment and cannot be manually approved or rejected." };
  }

  // Only pending bookings can be confirmed or rejected by the organizer.
  if (booking.status !== "pending") {
    return { error: "This booking cannot be updated in its current state." };
  }

  const { data: trip, error: tripError } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id, messenger_gc_link, status")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (tripError) {
    console.error("[update-booking-status] trip fetch failed:", tripError);
    Sentry.captureException(tripError, {
      extra: { context: "update-booking-status-trip-fetch-failed", bookingId },
    });
  }
  if (!trip || !organizerOwns(trip.organizer_id, organizer.id)) {
    return { error: "You don't have permission to manage this booking." };
  }

  if (trip.status !== "active") {
    return { error: "This trip is no longer active and bookings cannot be approved." };
  }

  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (trip.date_start < todayPH) {
    return { error: "This trip has already passed. You cannot approve or reject bookings for past trips." };
  }

  // Concurrency-safe update: only succeeds if the booking is still pending.
  const { data: updatedBooking, error } = await admin
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[update-booking-status] status update failed:", error);
    Sentry.captureException(error, {
      extra: { context: "update-booking-status-status-update-failed", bookingId },
    });
  }
  if (error) return { error: error.message };
  if (!updatedBooking) {
    return { error: "This booking has already been updated by another action." };
  }

  // Restore slots when rejecting.
  if (status === "rejected") {
    await admin.rpc("restore_slot", {
      p_trip_id: trip.id,
      p_slots_requested: booking.slots,
    });

    // A slot genuinely opened (restore_slot above), so notify the waitlist.
    // Wrapped defensively: a notify failure must never throw past the refund
    // logic below, so the reject, slot restore, and refund all still complete.
    // (cancelBooking calls this unguarded and has the same latent risk - a
    // pre-existing issue worth a separate follow-up; not changed in this stage.)
    try {
      await notifyWaitlistSlotOpened(trip.id, {
        title: trip.title,
        slug: trip.slug,
        dateStart: trip.date_start,
      });
    } catch (err) {
      console.error("[waitlist-notify] failed to notify waitlist on reject", trip.id, err);
      Sentry.captureException(err, {
        extra: { context: "waitlist-notify-reject-failed", tripId: trip.id, bookingId },
      });
    }
  }

  // Organizer rejection = full refund of the joiner's initial payment. No cancellation
  // policy percentage applies. Fires whenever money was collected: amount_due > 0 AND
  // payment_gateway_status "paid" (the authoritative collected signal). A free Advanced
  // trip has amount_due 0, so it issues no refund and makes no PayMongo call. A null
  // paymongo_payment_id does not suppress the record: issueAndRecordRefund still writes
  // the durable refunds row and the PayMongo call fails cleanly, mirroring cancelBooking.
  // A pending booking has no collected balance, so the initial payment is the only source.
  let rejectRefundResult: RefundResult | null = null;
  const rejectRefundAmount = booking.amount_due ?? 0;
  const rejectHasPayment = shouldRefundOnReject(booking.amount_due, booking.payment_gateway_status);
  if (status === "rejected" && rejectHasPayment) {
    rejectRefundResult = await issueAndRecordRefund({
      admin,
      bookingId,
      source: "downpayment",
      paymentId: booking.paymongo_payment_id,
      paymentMethod: booking.payment_method,
      amountPesos: rejectRefundAmount,
      notes: "Organizer rejected booking",
    });
    if (rejectRefundResult && !rejectRefundResult.success && !rejectRefundResult.requiresManualProcessing) {
      console.error("[refund] updateBookingStatus reject refund failed", bookingId, rejectRefundResult.error);
      Sentry.captureException(new Error(`updateBookingStatus reject refund failed: ${rejectRefundResult.error ?? "Unknown error"}`), {
        extra: { context: "reject-refund-failed", bookingId, source: "downpayment", amount: rejectRefundAmount },
      });
    }
    if (rejectRefundResult && !rejectRefundResult.success && rejectRefundResult.requiresManualProcessing) {
      console.error("[refund] updateBookingStatus reject refund requires manual processing", bookingId, rejectRefundResult.error);
      Sentry.captureException(new Error(`updateBookingStatus reject refund requires manual processing: ${rejectRefundResult.error ?? "Unknown error"}`), {
        extra: { context: "reject-refund-manual-required", bookingId },
      });
    }
  }

  // Notify participant of the status change.
  try {
    const tripDate = new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date(trip.date_start));

    if (status === "confirmed") {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `You're confirmed for ${trip.title}!`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Great news! Your booking request for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been approved by the organizer.</p>
          ${trip.messenger_gc_link ? `
          <p>Join the group chat for trip updates and coordination:<br>
          <a href="${escapeHtml(trip.messenger_gc_link)}">${escapeHtml(trip.messenger_gc_link)}</a></p>
          <p>This is where the organizer will share meetup details, reminders, and important updates.</p>
          ` : `<p>Your organizer will share group chat details with you soon.</p>`}
          <p>They will be in touch with trip details closer to the date. You can view your booking at <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/profile">sama.com.ph/profile</a>.</p>
          <p>Sama</p>
        `,
      });
    } else if (status === "rejected") {
      const bookingRef = formatBookingRef(booking.id);
      const fmtPHP = (n: number) => formatPeso(n);
      // Tailor the refund copy to what actually happened. No hard timeline promise is
      // made on a failed/manual refund. Free-trip/no-payment keeps the plain no-refund copy.
      const refundLine = rejectHasPayment
        ? rejectRefundResult?.success
          ? `<p>Your full refund of <strong>${fmtPHP(rejectRefundAmount)}</strong> has been issued to your original payment method and typically reflects within 24 hours. You do not need to do anything.</p>`
          : `<p>We are processing your full refund of <strong>${fmtPHP(rejectRefundAmount)}</strong> to your original payment method and will follow up once it is complete. If you don't receive it, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking reference: <strong>${bookingRef}</strong></p>`
        : `<p>If you have questions, please contact <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>`;
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Update on your booking request for ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Unfortunately your booking request for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} was not approved by the organizer.</p>
          ${refundLine}
          <p>Sama</p>
        `,
      });
    }
  } catch (err) {
    console.error("[email] failed to send booking status update", err);
    Sentry.captureException(err, {
      extra: { context: "booking-status-email", bookingId, status },
    });
  }

  revalidatePath("/organizer/dashboard");
  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  revalidatePath("/profile");
  revalidatePath(`/trips/${trip.slug}`);
  return { success: true };
}

export async function markBalanceCollected(bookingId: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer, error: organizerFetchError } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (organizerFetchError) {
    console.error("[markBalanceCollected] organizer fetch failed:", organizerFetchError);
    Sentry.captureException(organizerFetchError, {
      extra: { context: "markBalanceCollected-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingFetchError } = await admin
    .from("bookings")
    .select("id, trip_id, full_name, email, total_amount, amount_due, payment_option, balance_collected, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    console.error("[markBalanceCollected] booking fetch failed:", bookingFetchError);
    Sentry.captureException(bookingFetchError, {
      extra: { context: "markBalanceCollected-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "confirmed") {
    return { error: "Balance can only be collected on a confirmed booking." };
  }
  if (booking.payment_option !== "downpayment") {
    return { error: "Balance collection is only applicable to downpayment bookings." };
  }
  if (booking.balance_collected) {
    return { error: "Balance has already been marked as collected." };
  }

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, title, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[markBalanceCollected] trip fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "markBalanceCollected-trip-fetch-failed", bookingId, tripId: booking.trip_id },
    });
  }
  if (!trip || !organizerOwns(trip.organizer_id, organizer.id)) {
    return { error: "You don't have permission to update this booking." };
  }

  const { data: updated, error } = await admin
    .from("bookings")
    .update({ balance_collected: true })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("id");

  if (error) {
    console.error("[markBalanceCollected] balance update failed:", error);
    Sentry.captureException(error, {
      extra: { context: "markBalanceCollected-update-failed", bookingId },
    });
  }
  if (error) return { error: error.message };
  if (!updated || updated.length !== 1) {
    return { error: "Balance can only be collected on a confirmed booking." };
  }

  try {
    const fmt = (n: number) => formatPeso(n);
    const balance = booking.total_amount != null && booking.amount_due != null
      ? booking.total_amount - booking.amount_due
      : null;
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: booking.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: `Balance payment recorded for ${trip.title}`,
      html: `
        <p>Hi ${escapeHtml(booking.full_name)},</p>
        <p>Your balance payment${balance != null ? ` of <strong>${fmt(balance)}</strong>` : ""} for <strong>${escapeHtml(trip.title)}</strong> has been recorded by your organizer. You are now fully paid up.</p>
        <p>You can view your booking at <a href="${SITE_URL}/profile">your profile</a>.</p>
        <p>Sama</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send balance collected confirmation", err);
    Sentry.captureException(err, {
      extra: { context: "markBalanceCollected-confirmation-email-failed", bookingId },
    });
  }

  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  revalidatePath("/profile");
  return { success: true };
}

export async function createBalancePaymentLink(bookingId: number): Promise<{ success: true; checkoutUrl: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingFetchError } = await admin
    .from("bookings")
    .select("id, user_id, trip_id, full_name, total_amount, amount_due, payment_option, balance_collected, status, balance_payment_id, balance_payment_gateway_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    console.error("[createBalancePaymentLink] booking fetch failed:", bookingFetchError);
    Sentry.captureException(bookingFetchError, {
      extra: { context: "createBalancePaymentLink-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to access this booking." };
  if (booking.status !== "confirmed") return { error: "Only confirmed bookings can pay the remaining balance." };
  if (booking.payment_option !== "downpayment") return { error: "This booking was paid in full." };
  if (booking.balance_collected) return { error: "Balance has already been paid." };
  if (booking.balance_payment_gateway_status === "paid") return { error: "Balance has already been paid online." };
  if (booking.balance_payment_id && booking.balance_payment_gateway_status !== "paid") {
    // Check if the existing PayMongo link is still active before blocking re-generation.
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (secretKey) {
      try {
        const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
        const pmRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${booking.balance_payment_id}`, {
          headers: { Authorization: auth, Accept: "application/json" },
        });

        if (pmRes.ok) {
          const pmData = await pmRes.json();
          const sessionStatus = pmData.data?.attributes?.status as string | undefined;
          // A session has no paid/unpaid status; it is reusable only while
          // still active AND no payment on it has succeeded.
          const sessionPaid = hasPaidPayment(pmData.data?.attributes?.payments as unknown[] | undefined);
          if (sessionStatus === "active" && !sessionPaid) {
            // Session is still live — return the existing checkout URL to the joiner.
            const existingUrl = pmData.data?.attributes?.checkout_url as string | undefined;
            if (existingUrl) return { success: true, checkoutUrl: existingUrl };
            // URL missing in response — fall through and generate a new session.
          }
          // Expired, paid, or any other terminal state: clear and generate a fresh session.
          if (sessionStatus !== "active" || sessionPaid) {
            const { error: clearStaleError } = await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
            if (clearStaleError) {
              console.error("[createBalancePaymentLink] stale link clear failed:", clearStaleError);
              Sentry.captureException(clearStaleError, {
                extra: { context: "createBalancePaymentLink-stale-link-clear-failed", bookingId },
              });
            }
          }
        } else if (pmRes.status === 404) {
          const { error: clearStale404Error } = await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
          if (clearStale404Error) {
            console.error("[createBalancePaymentLink] stale link clear (404) failed:", clearStale404Error);
            Sentry.captureException(clearStale404Error, {
              extra: { context: "createBalancePaymentLink-stale-link-clear-404-failed", bookingId },
            });
          }
        } else {
          // PayMongo API error — allow re-generation rather than permanently blocking.
          console.error("[createBalancePaymentLink] PayMongo link status check failed:", pmRes.status);
          Sentry.captureException(new Error(`PayMongo link status check failed: ${pmRes.status}`), {
            extra: { context: "createBalancePaymentLink-status-check-failed", bookingId },
          });
          const { error: clearStaleApiError } = await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
          if (clearStaleApiError) {
            console.error("[createBalancePaymentLink] stale link clear (API error) failed:", clearStaleApiError);
            Sentry.captureException(clearStaleApiError, {
              extra: { context: "createBalancePaymentLink-stale-link-clear-api-error-failed", bookingId },
            });
          }
        }
      } catch (err) {
        // Network error — allow re-generation.
        console.error("[createBalancePaymentLink] PayMongo link status check error:", err);
        Sentry.captureException(err, {
          extra: { context: "createBalancePaymentLink-status-check-network-error", bookingId },
        });
        const { error: clearStaleNetworkError } = await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
        if (clearStaleNetworkError) {
          console.error("[createBalancePaymentLink] stale link clear (network error) failed:", clearStaleNetworkError);
          Sentry.captureException(clearStaleNetworkError, {
            extra: { context: "createBalancePaymentLink-stale-link-clear-network-failed", bookingId },
          });
        }
      }
    }
    // No secret key: fall through and generate a new link.
  }

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, title, date_start")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[createBalancePaymentLink] trip fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "createBalancePaymentLink-trip-fetch-failed", bookingId },
    });
  }
  if (!trip) return { error: "Trip not found." };
  if (trip.date_start < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())) {
    return { error: "This trip has already taken place." };
  }

  const balance = Math.round(((booking.total_amount ?? 0) - (booking.amount_due ?? 0)) * 100) / 100;
  if (balance <= 0) return { error: "No balance remaining." };

  const tripDateShort = new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));
  const description = `Balance payment for ${trip.title} - ${tripDateShort}`;

  try {
    const linkResult = await createPaymentCheckout({ bookingId, amount: balance, description });

    if ("error" in linkResult) {
      console.error("[createBalancePaymentLink] payment link creation failed:", linkResult.error);
      Sentry.captureException(new Error(`Payment link creation failed: ${linkResult.error}`), {
        extra: { context: "createBalancePaymentLink-link-creation-failed", bookingId },
      });
      return { error: "Failed to create payment link. Please try again." };
    }

    await admin
      .from("bookings")
      .update({ balance_payment_id: linkResult.linkId })
      .eq("id", bookingId);

    return { success: true, checkoutUrl: linkResult.checkoutUrl };
  } catch (err) {
    console.error("[createBalancePaymentLink] error:", err);
    Sentry.captureException(err, {
      extra: { context: "createBalancePaymentLink-error", bookingId },
    });
    return { error: "Failed to create payment link. Please try again." };
  }
}

// Resume the INITIAL payment for a booking that is still in payment_pending
// (the joiner abandoned or failed the first PayMongo checkout). Mirrors
// createBalancePaymentLink: if the stored link is still live and unpaid we
// return its existing checkout_url so the joiner finishes the SAME payment (no
// new charge, no duplicate booking); if it is archived/gone we generate a fresh
// link for the same booking using the server-authoritative amount already
// stored on the row (amount_due, computed from trip.price at creation, never
// client-supplied). If the payment had actually completed the booking would no
// longer be payment_pending (confirmPaidBooking flips status + gateway status),
// so this stays idempotent with the confirm paths.
export async function resumeBookingPayment(bookingId: number): Promise<{ success: true; checkoutUrl: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingFetchError } = await admin
    .from("bookings")
    .select("id, user_id, trip_id, total_amount, amount_due, status, payment_id, payment_gateway_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    console.error("[resumeBookingPayment] booking fetch failed:", bookingFetchError);
    Sentry.captureException(bookingFetchError, {
      extra: { context: "resumeBookingPayment-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to access this booking." };
  if (booking.payment_gateway_status === "paid") return { error: "This booking has already been paid." };
  if (booking.status !== "payment_pending") {
    return { error: "This booking is no longer awaiting payment." };
  }

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, title, date_start, status")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[resumeBookingPayment] trip fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "resumeBookingPayment-trip-fetch-failed", bookingId },
    });
  }
  if (!trip) return { error: "Trip not found." };
  if (trip.status !== "active") {
    return { error: "This trip is no longer available. Your slot hold has been released." };
  }
  if (trip.date_start < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date())) {
    return { error: "This trip has already taken place." };
  }

  // Reuse the existing PayMongo link when it is still live and unpaid, so the
  // joiner resumes the same payment rather than creating a second charge.
  if (booking.payment_id) {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (secretKey) {
      try {
        const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
        const pmRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${booking.payment_id}`, {
          headers: { Authorization: auth, Accept: "application/json" },
        });

        if (pmRes.ok) {
          const pmData = await pmRes.json();
          const sessionStatus = pmData.data?.attributes?.status as string | undefined;
          // A session has no paid/unpaid status; it is reusable only while
          // still active AND no payment on it has succeeded.
          const sessionPaid = hasPaidPayment(pmData.data?.attributes?.payments as unknown[] | undefined);
          if (sessionStatus === "active" && !sessionPaid) {
            const existingUrl = pmData.data?.attributes?.checkout_url as string | undefined;
            if (existingUrl) return { success: true, checkoutUrl: existingUrl };
            // URL missing in response: fall through and generate a new session.
          }
          // Expired, paid, or any other terminal state: clear and generate a fresh session.
          if (sessionStatus !== "active" || sessionPaid) {
            const { error: clearStaleError } = await admin.from("bookings").update({ payment_id: null }).eq("id", bookingId);
            if (clearStaleError) {
              console.error("[resumeBookingPayment] stale link clear failed:", clearStaleError);
              Sentry.captureException(clearStaleError, {
                extra: { context: "resumeBookingPayment-stale-link-clear-failed", bookingId },
              });
            }
          }
        } else if (pmRes.status === 404) {
          const { error: clearStale404Error } = await admin.from("bookings").update({ payment_id: null }).eq("id", bookingId);
          if (clearStale404Error) {
            console.error("[resumeBookingPayment] stale link clear (404) failed:", clearStale404Error);
            Sentry.captureException(clearStale404Error, {
              extra: { context: "resumeBookingPayment-stale-link-clear-404-failed", bookingId },
            });
          }
        } else {
          // PayMongo API error: allow re-generation rather than permanently blocking.
          console.error("[resumeBookingPayment] PayMongo link status check failed:", pmRes.status);
          Sentry.captureException(new Error(`PayMongo link status check failed: ${pmRes.status}`), {
            extra: { context: "resumeBookingPayment-status-check-failed", bookingId },
          });
          const { error: clearStaleApiError } = await admin.from("bookings").update({ payment_id: null }).eq("id", bookingId);
          if (clearStaleApiError) {
            console.error("[resumeBookingPayment] stale link clear (API error) failed:", clearStaleApiError);
            Sentry.captureException(clearStaleApiError, {
              extra: { context: "resumeBookingPayment-stale-link-clear-api-error-failed", bookingId },
            });
          }
        }
      } catch (err) {
        // Network error: allow re-generation.
        console.error("[resumeBookingPayment] PayMongo link status check error:", err);
        Sentry.captureException(err, {
          extra: { context: "resumeBookingPayment-status-check-network-error", bookingId },
        });
        const { error: clearStaleNetworkError } = await admin.from("bookings").update({ payment_id: null }).eq("id", bookingId);
        if (clearStaleNetworkError) {
          console.error("[resumeBookingPayment] stale link clear (network error) failed:", clearStaleNetworkError);
          Sentry.captureException(clearStaleNetworkError, {
            extra: { context: "resumeBookingPayment-stale-link-clear-network-failed", bookingId },
          });
        }
      }
    }
    // No secret key: fall through and generate a new link.
  }

  // Server-authoritative initial-payment amount: the amount_due locked onto the
  // row at creation (computedAmountDue). Never trust a client-supplied price.
  const amount = Math.round(Number(booking.amount_due ?? booking.total_amount ?? 0) * 100) / 100;
  if (amount <= 0) return { error: "Nothing left to pay on this booking." };

  const tripDateShort = new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));
  const description = `Booking for ${trip.title} - ${tripDateShort}`;

  try {
    const linkResult = await createPaymentCheckout({ bookingId, amount, description });

    if ("error" in linkResult) {
      console.error("[resumeBookingPayment] payment link creation failed:", linkResult.error);
      Sentry.captureException(new Error(`Payment link creation failed: ${linkResult.error}`), {
        extra: { context: "resumeBookingPayment-link-creation-failed", bookingId },
      });
      return { error: "Failed to create payment link. Please try again." };
    }

    await admin
      .from("bookings")
      .update({ payment_id: linkResult.linkId })
      .eq("id", bookingId);

    return { success: true, checkoutUrl: linkResult.checkoutUrl };
  } catch (err) {
    console.error("[resumeBookingPayment] error:", err);
    Sentry.captureException(err, {
      extra: { context: "resumeBookingPayment-error", bookingId },
    });
    return { error: "Failed to create payment link. Please try again." };
  }
}

export async function markAsTransferred(bookingId: number, transferredToEmail: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer, error: organizerFetchError } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (organizerFetchError) {
    console.error("[markAsTransferred] organizer fetch failed:", organizerFetchError);
    Sentry.captureException(organizerFetchError, {
      extra: { context: "markAsTransferred-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingFetchError } = await admin
    .from("bookings")
    .select("id, trip_id, status, email, full_name, slots")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    console.error("[markAsTransferred] booking fetch failed:", bookingFetchError);
    Sentry.captureException(bookingFetchError, {
      extra: { context: "markAsTransferred-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "confirmed") return { error: "Only confirmed bookings can be marked as transferred." };
  if (booking.slots > 1) {
    return { error: "Transfers are only available for single-slot bookings right now. For group bookings, please contact support." };
  }

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id, waiver_text")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[markAsTransferred] trip fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "markAsTransferred-trip-fetch-failed", bookingId, tripId: booking.trip_id },
    });
  }
  if (!trip || !organizerOwns(trip.organizer_id, organizer.id)) {
    return { error: "You don't have permission to manage this booking." };
  }

  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (trip.date_start < todayPH) {
    return { error: "This trip has already taken place, so this booking can no longer be transferred." };
  }

  // A transfer is an off-platform hand-off: the replacement takes this exact
  // slot, so the slot stays consumed and no slot is restored or reopened.
  // Guard on the current status and verify exactly one row changed before
  // sending emails. If a concurrent action already moved the booking off
  // "confirmed", zero rows update and we abort cleanly with no side effects.
  const { data: updated, error } = await admin
    .from("bookings")
    .update({
      status: "transferred",
      transferred_to_email: transferredToEmail.trim() || null,
      transferred_at: new Date().toISOString(),
      transferred_by: user.id,
    })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .select("id");

  if (error) {
    console.error("[markAsTransferred] transfer update failed:", error);
    Sentry.captureException(error, {
      extra: { context: "markAsTransferred-update-failed", bookingId },
    });
  }
  if (error) return { error: error.message };
  if (!updated || updated.length !== 1) {
    console.error("[markAsTransferred] transfer update matched no rows", bookingId);
    Sentry.captureException(new Error("markAsTransferred update matched no rows"), {
      extra: { context: "markAsTransferred-update-no-rows", bookingId },
    });
    return { error: "This booking is no longer confirmed and could not be transferred." };
  }

  const bookingRef = formatBookingRef(booking.id);

  // Resolve the organizer once: reused for the waiver snapshot below and the
  // organizer notification email further down.
  const { data: org, error: orgFetchError } = await admin
    .from("organizers")
    .select("email, full_name, display_name")
    .eq("id", organizer.id)
    .maybeSingle();
  if (orgFetchError) {
    console.error("[markAsTransferred] organizer details fetch failed:", orgFetchError);
    Sentry.captureException(orgFetchError, {
      extra: { context: "markAsTransferred-organizer-details-fetch-failed", bookingId, organizerId: organizer.id },
    });
  }
  const organizerName = org?.display_name ?? org?.full_name ?? "";

  // Prepare the slot-0 participant row so the replacement can complete their own
  // details and sign the waiver via /join. The booker's canonical record stays
  // safe on the untouched bookings row; this only repurposes the per-slot row:
  // fresh token, cleared PII, completed:false, with the resolved waiver text
  // snapshotted so it cannot drift if the trip waiver is edited later.
  // Best-effort: the transfer already succeeded and the slot stays filled, so a
  // failure here never rolls back the transfer. We log it and alert an admin.
  // On success we keep the token in scope so the emails below can carry a
  // working /join link; if prep failed it stays null and we send no link.
  let replacementToken: string | null = null;
  try {
    const resolvedWaiverText = withParticipantAdultAttestation(
      (trip.waiver_text ?? DEFAULT_WAIVER_TEXT).replace(/\[Organizer Name\]/gi, organizerName),
    );
    const newToken = randomUUID();

    const { data: existingSlotZero, error: slotZeroFetchError } = await admin
      .from("booking_participants")
      .select("id")
      .eq("booking_id", bookingId)
      .eq("slot_number", 0)
      .maybeSingle();

    if (slotZeroFetchError) {
      console.error("[markAsTransferred] slot-0 participant fetch failed:", slotZeroFetchError);
      Sentry.captureException(slotZeroFetchError, {
        extra: { context: "markAsTransferred-slot0-fetch-failed", bookingId },
      });
    }
    if (existingSlotZero) {
      const { error: prepError } = await admin
        .from("booking_participants")
        .update({
          token: newToken,
          completed: false,
          waiver_accepted: false,
          waiver_accepted_at: null,
          full_name: null,
          emergency_contact_name: null,
          emergency_contact_phone: null,
          medical_notes: null,
          meeting_point: null,
          waiver_text_snapshot: resolvedWaiverText,
          waiver_ip: null,
        })
        .eq("booking_id", bookingId)
        .eq("slot_number", 0);
      if (prepError) throw prepError;
    } else {
      const { error: prepError } = await admin
        .from("booking_participants")
        .insert({
          booking_id: bookingId,
          slot_number: 0,
          token: newToken,
          completed: false,
          waiver_accepted: false,
          waiver_text_snapshot: resolvedWaiverText,
        });
      if (prepError) throw prepError;
    }
    replacementToken = newToken;
  } catch (err) {
    console.error("[markAsTransferred] failed to prepare replacement slot-0 participant row", err);
    Sentry.captureException(err, {
      extra: { context: "markAsTransferred-slot0-prep", bookingId },
    });
    await sendAdminAlert(
      `[Admin] Transfer succeeded but replacement link prep failed: booking #${bookingRef}`,
      `
          <p>A booking was marked as transferred, but preparing the replacement participant row (slot 0) failed. The replacement cannot complete their details until this is fixed manually.</p>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Booking ref:</strong> ${bookingRef}</p>
          <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
          <p><strong>Error:</strong> ${escapeHtml(String(err))}</p>
        `,
    );
  }

  const tripDate = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));

  // Only build and send the link when the slot-0 token prep succeeded. If it
  // failed, replacementToken is null and we send no link: the admin alert above
  // already covers that case, and we never want to mail a broken link.
  const replacementLink = replacementToken ? `${SITE_URL}/join/${replacementToken}` : null;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: booking.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: `Your booking for ${trip.title} has been transferred`,
      html: `
        <p>Hi ${escapeHtml(booking.full_name)},</p>
        <p>Your booking for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been marked as <strong>transferred</strong> by your organizer.</p>
        ${replacementLink ? `
        <p>The person taking your slot must add their own details and sign the waiver before the trip. Please forward this link to them:</p>
        <p><a href="${replacementLink}">${replacementLink}</a></p>
        ` : ""}
        <p>Please settle any payment directly between the two of you. No refund is processed through Sama for this booking.</p>
        <p>If you did not arrange this transfer, contact us at <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with booking #${bookingRef}.</p>
        <p>Sama</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send transfer notice to participant", err);
    Sentry.captureException(err, {
      extra: { context: "markAsTransferred-participant-email-failed", bookingId },
    });
  }

  // If the organizer supplied the replacement's email and we have a working
  // link, send it to them directly too so they do not depend on the forward.
  if (replacementLink && transferredToEmail.trim()) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: transferredToEmail.trim(),
        replyTo: REPLY_TO_ADDRESS,
        subject: `Complete your details for ${trip.title}`,
        html: `
          <p>Hi,</p>
          <p>You are taking a slot on <strong>${escapeHtml(trip.title)}</strong> on ${tripDate}. Before the trip, please add your own details and sign the waiver using this link:</p>
          <p><a href="${replacementLink}">${replacementLink}</a></p>
          <p>Please settle any payment directly with the person handing over their slot. No refund is processed through Sama.</p>
          <p>If you did not arrange this, contact us at <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>
          <p>Sama</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to send transfer link to replacement", err);
      Sentry.captureException(err, {
        extra: { context: "markAsTransferred-replacement-email-failed", bookingId },
      });
    }
  }

  try {
    if (org?.email) {
      const toNote = transferredToEmail.trim()
        ? ` to <strong>${escapeHtml(transferredToEmail.trim())}</strong>`
        : "";
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: org.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Booking transferred: ${booking.full_name}, ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(org.full_name)},</p>
          <p>The booking for <strong>${escapeHtml(booking.full_name)}</strong> on <strong>${escapeHtml(trip.title)}</strong> (${tripDate}) has been marked as transferred${toNote}.</p>
          <p>The replacement has been sent a link to add their details and sign the waiver. You will see their status update once they complete it.</p>
          <p>The slot remains assigned to the replacement. Any payment should be settled directly between the two participants.</p>
          <p>Sama</p>
        `,
      });
    }
  } catch (err) {
    console.error("[email] failed to send transfer confirmation to organizer", err);
    Sentry.captureException(err, {
      extra: { context: "markAsTransferred-organizer-email-failed", bookingId, organizerId: organizer.id },
    });
  }

  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  revalidatePath(`/trips/${trip.slug}`);
  revalidatePath("/organizer/dashboard");
  return { success: true };
}

export async function markAsNoShow(bookingId: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer, error: organizerFetchError } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (organizerFetchError) {
    console.error("[markAsNoShow] organizer fetch failed:", organizerFetchError);
    Sentry.captureException(organizerFetchError, {
      extra: { context: "markAsNoShow-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingFetchError } = await admin
    .from("bookings")
    .select("id, trip_id, status, full_name")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    console.error("[markAsNoShow] booking fetch failed:", bookingFetchError);
    Sentry.captureException(bookingFetchError, {
      extra: { context: "markAsNoShow-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "confirmed") return { error: "Only confirmed bookings can be marked as no show." };

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, slug, date_start, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[markAsNoShow] trip fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "markAsNoShow-trip-fetch-failed", bookingId, tripId: booking.trip_id },
    });
  }
  if (!trip || !organizerOwns(trip.organizer_id, organizer.id)) {
    return { error: "You don't have permission to manage this booking." };
  }

  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (trip.date_start >= todayPH) {
    return { error: "The trip has not yet taken place." };
  }

  const { error } = await admin
    .from("bookings")
    .update({ status: "no_show" })
    .eq("id", bookingId)
    .eq("status", "confirmed");

  if (error) {
    console.error("[markAsNoShow] no-show update failed:", error);
    Sentry.captureException(error, {
      extra: { context: "markAsNoShow-update-failed", bookingId },
    });
  }
  if (error) return { error: error.message };

  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  return { success: true };
}

export async function partialCancelBooking(bookingId: number, slotsToCancel: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (!Number.isInteger(slotsToCancel) || slotsToCancel < 1) {
    return { error: "Invalid number of slots to cancel." };
  }

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingFetchError } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, user_id, total_amount, amount_due, payment_option, paymongo_payment_id, payment_method, payout_status, payout_id, cancellation_policy, platform_commission, commission_rate_used, balance_payment_gateway_status, balance_paymongo_payment_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    console.error("[partialCancelBooking] booking fetch failed:", bookingFetchError);
    Sentry.captureException(bookingFetchError, {
      extra: { context: "partialCancel-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to modify this booking." };
  if (!["confirmed", "pending"].includes(booking.status)) {
    return { error: "Only confirmed or pending bookings can be partially cancelled." };
  }
  if (slotsToCancel >= booking.slots) {
    return { error: "To cancel all slots, use the full cancellation option." };
  }

  const { data: tripDateCheckRow, error: tripDateCheckError } = await admin
    .from("trips")
    .select("date_start, slug, title, organizer_id, cancellation_policy")
    .eq("id", booking.trip_id)
    .maybeSingle();

  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const tripGate = resolvePastTripGate(tripDateCheckRow, tripDateCheckError, todayPH);
  if ("failure" in tripGate) {
    if (tripGate.failure === "trip-in-past") {
      return { error: "This trip has already taken place. Bookings can no longer be modified." };
    }
    console.error("[partialCancelBooking] trip fetch failed:", tripDateCheckError ?? "no row returned");
    Sentry.captureException(
      tripDateCheckError ?? new Error(`trip row missing for trip ${booking.trip_id}`),
      {
        extra: { context: "partialCancel-trip-fetch-failed", failure: tripGate.failure, bookingId, tripId: booking.trip_id },
      },
    );
    return { error: "Could not verify this trip, please retry." };
  }
  const tripDateCheck = tripGate.trip;

  const originalSlots = booking.slots;
  const remainingSlots = originalSlots - slotsToCancel;

  const amountPaid = amountJoinerPaid(booking);

  const todayManilaStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const todayManila = new Date(todayManilaStr);
  const tripDay = new Date(tripDateCheck.date_start);
  const daysUntilTrip = Math.round((tripDay.getTime() - todayManila.getTime()) / 86_400_000);

  const fullRefundableAmount = calculateRefundAmount(
    booking.cancellation_policy ?? tripDateCheck?.cancellation_policy ?? "flexible",
    amountPaid,
    daysUntilTrip,
  );

  // Scale the policy refund down to just the cancelled slots before splitting it.
  const refundAmount = fullRefundableAmount !== null
    ? Math.round((slotsToCancel / originalSlots) * fullRefundableAmount * 100) / 100
    : null;

  // Split refund proportionally between downpayment and balance payment sources
  const { downpaymentRefund: downpaymentRefundAmount, balanceRefund: partialBalanceRefundAmount } =
    computeRefundSplit(booking, refundAmount);

  const newTotalAmount = Math.round((booking.total_amount ?? 0) * (remainingSlots / originalSlots) * 100) / 100;
  const newAmountDue = booking.amount_due != null
    ? Math.round(booking.amount_due * (remainingSlots / originalSlots) * 100) / 100
    : null;
  const newCommission = booking.platform_commission != null
    ? Math.round((booking.platform_commission as number) * (remainingSlots / originalSlots) * 100) / 100
    : null;

  const updatePayload: Record<string, unknown> = {
    slots: remainingSlots,
    total_amount: newTotalAmount,
  };
  if (newAmountDue !== null) updatePayload.amount_due = newAmountDue;
  if (newCommission !== null) updatePayload.platform_commission = newCommission;

  const { data: updatedRows, error: updateError } = await admin
    .from("bookings")
    .update(updatePayload)
    .eq("id", bookingId)
    .eq("slots", originalSlots)
    // SLOT_HOLDING only (excludes payment_pending) on purpose: you cannot partially
    // refund a booking nobody has paid for yet, so a partial cancel must not act on
    // a payment_pending hold. This is deliberately narrower than the full-cancel
    // guard below (ACTIVE_BOOKING_STATUSES) - do not widen it to match.
    .in("status", [...SLOT_HOLDING_STATUSES])
    .select("id");

  if (updateError) {
    console.error("[partialCancelBooking] partial cancel update failed:", updateError);
    Sentry.captureException(updateError, {
      extra: { context: "partialCancel-update-failed", bookingId },
    });
  }
  if (updateError) return { error: updateError.message };
  if (!updatedRows || updatedRows.length === 0) {
    console.error("[partialCancelBooking] partial cancel update matched no rows", bookingId);
    Sentry.captureException(new Error("partialCancelBooking update matched no rows"), {
      extra: { context: "partialCancel-update-no-rows", bookingId },
    });
    return { error: "This booking is no longer in a cancellable state. It may have been cancelled or modified by another request. Please refresh and try again." };
  }

  // Flag the associated payout for reconciliation whenever a partial cancel happens
  // after payout creation. Mirrors cancelBooking's condition and update exactly so
  // the two stay consistent.
  if (booking.payout_id && (booking.payout_status === "remitted" || booking.payout_status === "included")) {
    await admin
      .from("payouts" as "trips")
      .update({ needs_reconciliation: true } as never)
      .eq("id", booking.payout_id);
  }

  await admin.rpc("restore_slot", {
    p_trip_id: booking.trip_id,
    p_slots_requested: slotsToCancel,
  });

  // A slot genuinely opened (restore_slot above), so notify the waitlist.
  // Wrapped defensively: a notify failure must never throw past the refund and
  // participant cleanup below, so the partial cancel, slot restore, and refund
  // all still complete. (cancelBooking calls this unguarded and has the same
  // latent risk - a pre-existing issue worth a separate follow-up; not changed
  // in this stage.)
  if (tripDateCheck) {
    try {
      await notifyWaitlistSlotOpened(booking.trip_id, {
        title: tripDateCheck.title,
        slug: tripDateCheck.slug,
        dateStart: tripDateCheck.date_start,
      });
    } catch (err) {
      console.error("[waitlist-notify] failed to notify waitlist on partial cancel", booking.trip_id, err);
      Sentry.captureException(err, {
        extra: { context: "waitlist-notify-partial-cancel-failed", tripId: booking.trip_id, bookingId },
      });
    }
  }

  // Delete the booking_participants rows for the cancelled slots. The booking now
  // holds remainingSlots, but the table still has originalSlots rows (one per
  // slot). Leaving the extras makes the {done}/{slots} manifest and the profile
  // "Pending confirmations" list overcount, and keeps live /join tokens for slots
  // no longer paid for - a cancelled participant could still sign a waiver via a
  // stale token. Deleting exactly slotsToCancel rows realigns the row count with
  // the new slot count and invalidates those tokens (the rows are gone, so
  // /join/<token> returns notFound).
  //
  // Which rows: never slot 0 (always the booker, excluded below). Prefer
  // INCOMPLETE (completed=false) rows, highest slot_number first, so we tear down
  // the most recently-added unfilled slots and only touch a completed participant
  // (someone who already signed a waiver) if there are not enough incomplete slots
  // to cover the cancellation. This protects real signed participants while still
  // invalidating the stale tokens, and in the common case (trailing slots unfilled)
  // leaves the remaining rows contiguous at slot_number 0..remainingSlots-1.
  //
  // Best-effort: the cancel, refund, slot restore, and reconciliation already
  // succeeded and matter more than this cleanup. On failure we log, alert an admin
  // to clean it up manually, and do NOT roll back. Mirrors the transfer slot-0 prep.
  let droppedSignedNames: string[] = [];
  try {
    const { data: slotRows, error: fetchRowsError } = await admin
      .from("booking_participants")
      .select("id, slot_number, completed, full_name")
      .eq("booking_id", bookingId)
      .neq("slot_number", 0);
    if (fetchRowsError) throw fetchRowsError;

    const candidates = (slotRows ?? []) as { id: string; slot_number: number; completed: boolean | null; full_name: string | null }[];
    candidates.sort((a, b) => {
      const aDone = a.completed ? 1 : 0;
      const bDone = b.completed ? 1 : 0;
      // Incomplete (0) before completed (1); within a group, highest slot_number first.
      if (aDone !== bDone) return aDone - bDone;
      return b.slot_number - a.slot_number;
    });
    const droppedRows = candidates.slice(0, slotsToCancel);
    const idsToDelete = droppedRows.map((r) => r.id);

    // Capture names of dropped rows that had already signed a waiver, so the
    // cancellation emails can call them out instead of silently vanishing.
    droppedSignedNames = droppedRows
      .filter((r) => r.completed && r.full_name && r.full_name.trim().length > 0)
      .map((r) => r.full_name as string);

    if (idsToDelete.length > 0) {
      const { error: deleteRowsError } = await admin
        .from("booking_participants")
        .delete()
        .in("id", idsToDelete);
      if (deleteRowsError) throw deleteRowsError;
    }
  } catch (err) {
    console.error("[partialCancelBooking] failed to delete participant rows for cancelled slots", bookingId, err);
    Sentry.captureException(err, {
      extra: { context: "partialCancel-participant-row-cleanup", bookingId, slotsToCancel, remainingSlots },
    });
    await sendAdminAlert(
      `[Admin] Partial cancel succeeded but participant-row cleanup failed: booking #${bookingId}`,
      `
          <p>A partial cancellation succeeded (slots restored and refund processed), but deleting the booking_participants rows for the cancelled slots failed. The booking now holds ${remainingSlots} slot(s) but may still have stale participant rows and live /join tokens that must be cleaned up manually.</p>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Slots cancelled:</strong> ${slotsToCancel}</p>
          <p><strong>Remaining slots:</strong> ${remainingSlots}</p>
          <p><strong>Error:</strong> ${escapeHtml(String(err))}</p>
        `,
    );
  }

  // Record a deduction against the organizer when a partial refund is issued after
  // their payout was already remitted. Mirrors cancelBooking's deduction (same
  // table, columns, and status), but the amount is the slot-proportional refund
  // actually issued for the cancelled slots (refundAmount), not the full booking
  // amount. refundAmount equals downpaymentRefundAmount + partialBalanceRefundAmount,
  // i.e. exactly what is refunded below.
  if (booking.payout_status === "remitted" && tripDateCheck?.organizer_id && refundAmount !== null && refundAmount > 0) {
    const { error: deductionError } = await (admin
      .from("organizer_deductions" as "trips")
      .insert({
        organizer_id: tripDateCheck.organizer_id,
        booking_id: bookingId,
        amount: refundAmount,
        reason: "Joiner partial cancellation refund after payout remitted",
        status: "pending",
      } as never) as unknown as Promise<{ error: { message: string } | null }>);
    if (deductionError) {
      console.error("[deduction] failed to record organizer deduction", bookingId, deductionError.message);
      Sentry.captureException(new Error(deductionError.message), {
        extra: { context: "partialCancel-deduction-insert-failed", bookingId, organizerId: tripDateCheck.organizer_id },
      });
    }
  }

  // Stage 5d: void the organizer credit for this booking. A partial cancel still
  // voids the FULL credit (no proportional shrinking); when payout_status is
  // 'remitted' the deduction above already recovers the balance, so no offset.
  if (tripDateCheck?.organizer_id) {
    const creditVoid = await voidBookingCredit(admin, bookingId, tripDateCheck.organizer_id, booking.payout_status);
    if (creditVoid.error) {
      console.error("[credit-void] failed to void organizer credit", bookingId, creditVoid.error);
      Sentry.captureException(new Error(creditVoid.error), {
        extra: { context: "partialCancel-credit-void-failed", bookingId, organizerId: tripDateCheck.organizer_id },
      });
      await sendAdminAlert(
        "Action needed: failed to void organizer credit on partial cancellation",
        `
              <p>A booking with an active organizer credit was partially cancelled, but voiding the credit (or inserting its offsetting deduction) failed. The organizer may be over- or under-paid until this is corrected manually.</p>
              <p><strong>Booking ID:</strong> ${bookingId}</p>
              <p><strong>Action reached:</strong> ${creditVoid.action}</p>
              <p><strong>Error:</strong> ${escapeHtml(creditVoid.error)}</p>
            `,
      );
    }
  }

  let refundResult: RefundResult | null = null;
  let balanceRefundResult: RefundResult | null = null;

  if (downpaymentRefundAmount !== null && downpaymentRefundAmount > 0) {
    refundResult = await issueAndRecordRefund({
      admin,
      bookingId,
      source: "downpayment",
      paymentId: booking.paymongo_payment_id,
      paymentMethod: booking.payment_method,
      amountPesos: downpaymentRefundAmount,
      notes: `Partial cancellation: ${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""} cancelled`,
    });
    if (refundResult && !refundResult.success && !refundResult.requiresManualProcessing) {
      console.error("[refund] partialCancelBooking refund failed", bookingId, refundResult.error);
      Sentry.captureException(new Error(`partialCancelBooking refund failed: ${refundResult.error ?? "Unknown error"}`), {
        extra: { context: "partialCancel-downpayment-refund-failed", bookingId, source: "downpayment", amount: downpaymentRefundAmount },
      });
    }
  }

  if (partialBalanceRefundAmount > 0 && booking.balance_paymongo_payment_id) {
    balanceRefundResult = await issueAndRecordRefund({
      admin,
      bookingId,
      source: "balance",
      paymentId: booking.balance_paymongo_payment_id,
      paymentMethod: booking.payment_method,
      amountPesos: partialBalanceRefundAmount,
      notes: `Partial cancellation: ${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""} cancelled - balance refund`,
    });
    if (balanceRefundResult && !balanceRefundResult.success && !balanceRefundResult.requiresManualProcessing) {
      console.error("[refund] partialCancelBooking balance refund failed", bookingId, balanceRefundResult.error);
      Sentry.captureException(new Error(`partialCancelBooking balance refund failed: ${balanceRefundResult.error ?? "Unknown error"}`), {
        extra: { context: "partialCancel-balance-refund-failed", bookingId, source: "balance", amount: partialBalanceRefundAmount },
      });
    }
  }

  const fmtCurrency = (n: number) =>
    formatPeso(n);

  const droppedSignedLine =
    droppedSignedNames.length > 0
      ? `<p>The following confirmed participant(s) had their spot released: <strong>${droppedSignedNames.map((name) => escapeHtml(name)).join(", ")}</strong>.</p>`
      : "";

  if (tripDateCheck) {
    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
    }).format(new Date(tripDateCheck.date_start));

    if (tripDateCheck.organizer_id) {
      const { data: organizer, error: organizerFetchError } = await admin
        .from("organizers")
        .select("email")
        .eq("id", tripDateCheck.organizer_id)
        .maybeSingle();

      if (organizerFetchError) {
        console.error("[partialCancelBooking] organizer fetch failed:", organizerFetchError);
        Sentry.captureException(organizerFetchError, {
          extra: { context: "partialCancel-organizer-fetch-failed", bookingId, organizerId: tripDateCheck.organizer_id },
        });
      }
      if (organizer?.email) {
        try {
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: organizer.email,
            replyTo: REPLY_TO_ADDRESS,
            subject: `${booking.full_name} cancelled ${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""} for ${tripDateCheck.title}`,
            html: `
              <p>Hi,</p>
              <p><strong>${escapeHtml(booking.full_name)}</strong> cancelled <strong>${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""}</strong> from their booking for <strong>${escapeHtml(tripDateCheck.title)}</strong> on ${tripDate}. They now have <strong>${remainingSlots} slot${remainingSlots !== 1 ? "s" : ""}</strong> remaining. The cancelled slot${slotsToCancel !== 1 ? "s" : ""} have been returned to the available pool.</p>
              ${droppedSignedLine}
              <p>Sama</p>
            `,
          });
        } catch (err) {
          console.error("[email] failed to notify organizer of partial cancellation", err);
          Sentry.captureException(err, {
            extra: { context: "partialCancel-organizer-email-failed", bookingId },
          });
        }
      }
    }

    const partialRefundManual =
      classifyRefundResult(refundResult) === "manual" ||
      classifyRefundResult(balanceRefundResult) === "manual";
    const refundLine =
      refundAmount === null
        ? `<p>If you are eligible for a refund, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking details.</p>`
        : refundAmount > 0
          ? (refundResult?.success
              ? `<p>Your refund of <strong>${fmtCurrency(refundAmount)}</strong> for the cancelled slot${slotsToCancel !== 1 ? "s" : ""} has been processed and typically reflects within 24 hours.</p>`
              : partialRefundManual
                ? `<p>Your refund of <strong>${fmtCurrency(refundAmount)}</strong> for the cancelled slot${slotsToCancel !== 1 ? "s" : ""} is being processed manually. ${MANUAL_REFUND_FOLLOWUP}</p>`
                : `<p>Your refund of <strong>${fmtCurrency(refundAmount)}</strong> will be processed. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> if you don't receive it within 3 to 5 business days.</p>`)
          : `<p>Based on our cancellation policy, this cancellation is not eligible for a refund.</p>`;

    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Booking updated: ${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""} cancelled for ${tripDateCheck.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>You've cancelled <strong>${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""}</strong> from your booking for <strong>${escapeHtml(tripDateCheck.title)}</strong> on ${tripDate}. Your booking now has <strong>${remainingSlots} slot${remainingSlots !== 1 ? "s" : ""}</strong>.</p>
          ${droppedSignedLine}
          ${refundLine}
          <p>Sama</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to send partial cancellation confirmation", err);
      Sentry.captureException(err, {
        extra: { context: "partialCancel-participant-email-failed", bookingId },
      });
    }

    const needsManualRefund =
      (refundResult && !refundResult.success) ||
      (balanceRefundResult && !balanceRefundResult.success);
    if (needsManualRefund) {
      const isQrPh = refundResult?.requiresManualProcessing || balanceRefundResult?.requiresManualProcessing;
      const refundNote = isQrPh
        ? "Payment method is QR Ph, must be refunded manually."
        : `Automatic refund failed: ${refundResult?.error ?? balanceRefundResult?.error ?? "Unknown error"}`;
      await sendAdminAlert(
        `[Admin] Manual refund required (partial cancel): ${escapeHtml(booking.full_name)}, ${tripDateCheck.title}`,
        `
            <p>A partial cancellation refund could not be automatically processed.</p>
            <p><strong>Booking ID:</strong> ${bookingId}</p>
            <p><strong>Slots cancelled:</strong> ${slotsToCancel}</p>
            <p><strong>Participant:</strong> ${escapeHtml(booking.full_name)} (${escapeHtml(booking.email)})</p>
            <p><strong>Refund amount:</strong> ${refundAmount != null && refundAmount > 0 ? fmtCurrency(refundAmount) : "N/A"}</p>
            <p><strong>Reason:</strong> ${refundNote}</p>
          `,
      );
    }
  }

  revalidatePath("/profile");
  revalidatePath(`/profile/bookings/${bookingId}`);
  return { success: true as const, refundAmount };
}

export async function cancelBooking(bookingId: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();

  const { data: booking, error: bookingFetchError } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, user_id, total_amount, amount_due, payment_option, paymongo_payment_id, balance_paymongo_payment_id, payment_method, balance_payment_gateway_status, payout_status, payout_id, cancellation_policy")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingFetchError) {
    console.error("[cancelBooking] booking fetch failed:", bookingFetchError);
    Sentry.captureException(bookingFetchError, {
      extra: { context: "cancelBooking-booking-fetch-failed", bookingId },
    });
  }
  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to cancel this booking." };
  if (["cancelled", "rejected", "transferred"].includes(booking.status)) return { error: "This booking is already cancelled or rejected." };
  if (booking.status === "no_show") return { error: "This booking has been marked as no-show and cannot be cancelled." };

  // Block cancellation after the trip has already taken place.
  const { data: tripDateCheck, error: tripDateCheckError } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id, cancellation_policy")
    .eq("id", booking.trip_id)
    .maybeSingle();
  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const tripGate = resolvePastTripGate(tripDateCheck, tripDateCheckError, todayPH);
  if ("failure" in tripGate) {
    if (tripGate.failure === "trip-in-past") {
      return { error: "This trip has already taken place. Bookings can no longer be cancelled." };
    }
    console.error("[cancelBooking] trip fetch failed:", tripDateCheckError ?? "no row returned");
    Sentry.captureException(
      tripDateCheckError ?? new Error(`trip row missing for trip ${booking.trip_id}`),
      {
        extra: { context: "cancelBooking-trip-fetch-failed", failure: tripGate.failure, bookingId, tripId: booking.trip_id },
      },
    );
    return { error: "Could not verify this trip, please retry." };
  }

  // The gate fetch now doubles as the refund pipeline's trip row: past the
  // gate it is validated and non-null.
  const trip = tripGate.trip;

  const { data: cancelledBooking, error: cancelError } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    // ACTIVE_BOOKING_STATUSES (includes payment_pending) on purpose: a full cancel
    // must free the slot of an unpaid/mid-payment booking too.
    .in("status", [...ACTIVE_BOOKING_STATUSES])
    .select()
    .single();

  if (cancelError || !cancelledBooking) {
    console.error("[cancelBooking] cancel update failed:", cancelError);
    Sentry.captureException(cancelError ?? new Error("cancelBooking update matched no rows"), {
      extra: { context: "cancelBooking-update-failed", bookingId },
    });
    return { error: "Booking could not be cancelled. It may have already been cancelled." };
  }

  // Flag the associated payout for reconciliation whenever cancellation happens after payout creation.
  const wasInIncludedPayout = booking.payout_status === "included" && !!booking.payout_id;
  if (booking.payout_id && (booking.payout_status === "remitted" || booking.payout_status === "included")) {
    const { error: reconciliationFlagError } = await admin
      .from("payouts" as "trips")
      .update({ needs_reconciliation: true } as never)
      .eq("id", booking.payout_id);
    if (reconciliationFlagError) {
      // Bookkeeping-flag failure must never strand the joiner's refund; continue.
      console.error("[cancelBooking] payout reconciliation flag failed:", reconciliationFlagError);
      Sentry.captureException(reconciliationFlagError, {
        extra: { context: "cancelBooking-payout-reconciliation-flag-failed", bookingId, tripId: booking.trip_id, payoutId: booking.payout_id },
      });
    }
  }

  // Restore the slot from the booking row alone. A failure here is captured
  // to Sentry for manual remediation and does not block the refund below.
  const { error: restoreSlotError } = await admin.rpc("restore_slot", {
    p_trip_id: booking.trip_id,
    p_slots_requested: booking.slots,
  });
  if (restoreSlotError) {
    console.error("[cancelBooking] restore_slot failed:", restoreSlotError);
    Sentry.captureException(restoreSlotError, {
      extra: { context: "cancelBooking-restore-slot-failed", bookingId, tripId: booking.trip_id, slots: booking.slots },
    });
  }

  if (trip) {

    // Notify all waitlisted members that a slot has freed up. The slot was
    // already restored above (restore_slot), so this is a genuine opening. The
    // shared helper handles the 12-hour debounce, rate-limit-safe sending via
    // sendInChunks, and success-only stamping.
    // Wrapped defensively: a notify failure must never throw past the refund
    // and credit-reversal logic below, so the cancel, slot restore, and refund
    // all still complete. Mirrors partialCancelBooking and the reject branch
    // of updateBookingStatus.
    try {
      await notifyWaitlistSlotOpened(trip.id, {
        title: trip.title,
        slug: trip.slug,
        dateStart: trip.date_start,
      });
    } catch (err) {
      console.error("[waitlist-notify] failed to notify waitlist on cancel", trip.id, err);
      Sentry.captureException(err, {
        extra: { context: "waitlist-notify-cancel-failed", tripId: trip.id, bookingId },
      });
    }

    // Calculate refund based on cancellation policy.
    // Compare calendar dates in Philippine time so boundary days (e.g. cancelling
    // at 6am on the 7th calendar day) are counted correctly and not floored to 6.
    const todayManilaStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const todayManila = new Date(todayManilaStr);
    const tripDay = new Date(trip.date_start);
    const daysUntilTrip = Math.round((tripDay.getTime() - todayManila.getTime()) / 86_400_000);
    const amountPaid = amountJoinerPaid(booking);
    const refundAmount = calculateRefundAmount(
      booking.cancellation_policy ?? trip.cancellation_policy ?? "flexible",
      amountPaid,
      daysUntilTrip,
    );

    // Split refund proportionally between downpayment and balance payment sources
    const { downpaymentRefund: downpaymentRefundAmount, balanceRefund: balanceRefundAmount } =
      computeRefundSplit(booking, refundAmount);

    if (refundAmount !== null) {
      const { error: refundAmountWriteError } = await admin
        .from("bookings")
        .update({ refund_amount: refundAmount })
        .eq("id", bookingId);
      if (refundAmountWriteError) {
        console.error("[cancelBooking] refund_amount write failed:", refundAmountWriteError);
        Sentry.captureException(refundAmountWriteError, {
          extra: { context: "cancelBooking-refund-amount-write-failed", bookingId },
        });
      }
    }

    // Record a deduction against the organizer when a refund is issued after their payout was already remitted.
    if (booking.payout_status === "remitted" && trip.organizer_id && refundAmount !== null && refundAmount > 0) {
      const { error: deductionError } = await (admin
        .from("organizer_deductions" as "trips")
        .insert({
          organizer_id: trip.organizer_id,
          booking_id: bookingId,
          amount: downpaymentRefundAmount ?? refundAmount,
          reason: "Joiner cancellation refund after payout remitted",
          status: "pending",
        } as never) as unknown as Promise<{ error: { message: string } | null }>);
      if (deductionError) {
        console.error("[deduction] failed to record organizer deduction", bookingId, deductionError.message);
        Sentry.captureException(new Error(deductionError.message), {
          extra: { context: "cancelBooking-deduction-insert-failed", bookingId, organizerId: trip.organizer_id },
        });
      }
    }

    // Stage 5e: reverse any organizer credit for this booking. The base deduction
    // above claws back only the downpayment; the online balance is owned by the
    // credit ledger, so reverseBookingCredit voids/shrinks/offsets the credit
    // against the balance actually refunded to the joiner (balanceRefundAmount).
    if (trip.organizer_id) {
      const creditReversal = await reverseBookingCredit(admin, bookingId, trip.organizer_id, balanceRefundAmount);
      if (creditReversal.error) {
        console.error("[credit-reversal] failed to reverse organizer credit", bookingId, creditReversal.error);
        Sentry.captureException(new Error(creditReversal.error), {
          extra: { context: "cancelBooking-credit-reversal-failed", bookingId, organizerId: trip.organizer_id },
        });
        await sendAdminAlert(
          "Action needed: failed to reverse organizer credit on cancellation",
          `
                <p>A booking with an active organizer credit was cancelled, but reversing the credit (void/shrink/offset) failed. The organizer may be over- or under-paid until this is corrected manually.</p>
                <p><strong>Booking ID:</strong> ${bookingId}</p>
                <p><strong>Action reached:</strong> ${creditReversal.action.kind}</p>
                <p><strong>Error:</strong> ${escapeHtml(creditReversal.error)}</p>
              `,
        );
      } else if (creditReversal.action.kind === "document") {
        await sendAdminAlert(
          "Action needed: organizer credit applied into an undisbursed payout flagged for review",
          `
                <p>A booking was cancelled whose balance credit had already been applied into an organizer payout that has not yet been disbursed. The payout has been flagged for reconciliation; please review and adjust it before it is remitted.</p>
                <p><strong>Booking ID:</strong> ${bookingId}</p>
              `,
        );
      }
    }

    // Process automatic refunds — a failed refund never blocks the cancellation.
    let refundResult: RefundResult | null = null;
    let balanceRefundResult: RefundResult | null = null;

    if (downpaymentRefundAmount !== null && downpaymentRefundAmount > 0) {
      refundResult = await issueAndRecordRefund({
        admin,
        bookingId,
        source: "downpayment",
        paymentId: booking.paymongo_payment_id,
        paymentMethod: booking.payment_method,
        amountPesos: downpaymentRefundAmount,
        notes: 'Joiner cancelled booking',
      });
      if (refundResult && !refundResult.success && !refundResult.requiresManualProcessing) {
        console.error('[refund] cancelBooking initial refund failed', bookingId, refundResult.error);
        Sentry.captureException(new Error(`cancelBooking initial refund failed: ${refundResult.error ?? "Unknown error"}`), {
          extra: { context: "cancelBooking-downpayment-refund-failed", bookingId, source: "downpayment", amount: downpaymentRefundAmount },
        });
      }
    }

    if (balanceRefundAmount > 0 && booking.balance_paymongo_payment_id) {
      balanceRefundResult = await issueAndRecordRefund({
        admin,
        bookingId,
        source: "balance",
        paymentId: booking.balance_paymongo_payment_id,
        paymentMethod: booking.payment_method,
        amountPesos: balanceRefundAmount,
        notes: 'Joiner cancelled booking - balance refund',
      });
      if (balanceRefundResult && !balanceRefundResult.success && !balanceRefundResult.requiresManualProcessing) {
        console.error('[refund] cancelBooking balance refund failed', bookingId, balanceRefundResult.error);
        Sentry.captureException(new Error(`cancelBooking balance refund failed: ${balanceRefundResult.error ?? "Unknown error"}`), {
          extra: { context: "cancelBooking-balance-refund-failed", bookingId, source: "balance", amount: balanceRefundAmount },
        });
      }
    }

    const fmtCurrency = (n: number) => formatPeso(n);

    const balanceRefundFailed = balanceRefundAmount > 0 && balanceRefundResult != null && !balanceRefundResult.success;
    const cancelRefundManual =
      classifyRefundResult(refundResult) === "manual" ||
      classifyRefundResult(balanceRefundResult) === "manual";
    const refundLine =
      refundAmount === null
        ? `<p>If you are eligible for a refund, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking details and we'll process it for you.</p>`
        : refundAmount > 0
          ? (refundResult?.success && balanceRefundFailed
              ? (classifyRefundResult(balanceRefundResult) === "manual"
                  ? `<p>Based on our cancellation policy, your downpayment refund of <strong>${fmtCurrency(downpaymentRefundAmount!)}</strong> has been processed and typically reflects within 24 hours. Your balance refund of <strong>${fmtCurrency(balanceRefundAmount)}</strong> is being processed manually. ${MANUAL_REFUND_FOLLOWUP}</p>`
                  : `<p>Based on our cancellation policy, your downpayment refund of <strong>${fmtCurrency(downpaymentRefundAmount!)}</strong> has been processed and typically reflects within 24 hours. Your balance refund of <strong>${fmtCurrency(balanceRefundAmount)}</strong> could not be processed automatically. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> if you don't receive it within 3 to 5 business days.</p>`)
              : refundResult?.success
                ? `<p>Based on our cancellation policy, your refund of <strong>${fmtCurrency(refundAmount)}</strong> has been processed and typically reflects within 24 hours.</p>`
                : cancelRefundManual
                  ? `<p>Based on our cancellation policy, your refund of <strong>${fmtCurrency(refundAmount)}</strong> is being processed manually. ${MANUAL_REFUND_FOLLOWUP}</p>`
                  : `<p>Based on our cancellation policy, your refund will be <strong>${fmtCurrency(refundAmount)}</strong>. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> to process it within 3 to 5 business days.</p>`)
          : `<p>Based on our cancellation policy, this cancellation is not eligible for a refund.</p>`;

    // Manual-refund operator alert. Kept independent of the customer-facing
    // email sends below: a customer email failure must not skip this alert, and
    // this alert must not break the email send or throw out of cancelBooking.
    // (sendAdminAlert never throws; the try/catch is a defensive backstop.)
    const needsManualRefund =
      (refundResult && !refundResult.success) ||
      (balanceRefundResult && !balanceRefundResult.success);
    if (needsManualRefund) {
      try {
        const isQrPh = refundResult?.requiresManualProcessing || balanceRefundResult?.requiresManualProcessing;
        const refundNote = isQrPh
          ? 'Payment method is QR Ph, must be refunded manually.'
          : `Automatic refund failed: ${refundResult?.error ?? balanceRefundResult?.error ?? 'Unknown error'}`;
        await sendAdminAlert(
          `[Admin] Manual refund required: ${escapeHtml(booking.full_name)}, ${trip.title}`,
          `
              <p>A refund could not be automatically processed.</p>
              <p><strong>Booking ID:</strong> ${bookingId}</p>
              <p><strong>Participant:</strong> ${escapeHtml(booking.full_name)} (${escapeHtml(booking.email)})</p>
              <p><strong>Refund amount:</strong> ${refundAmount !== null && refundAmount > 0 ? fmtCurrency(refundAmount) : 'See booking details'}</p>
              <p><strong>Reason:</strong> ${refundNote}</p>
              <p>Please process this refund manually.</p>
            `,
        );
      } catch (alertErr) {
        console.error("[admin-alert] failed to send manual-refund alert", alertErr);
      }
    }

    try {
      const tripDate = new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Manila",
      }).format(new Date(trip.date_start));

      if (trip.organizer_id) {
        const { data: organizer, error: organizerFetchError } = await admin
          .from("organizers")
          .select("email")
          .eq("id", trip.organizer_id)
          .maybeSingle();

        if (organizerFetchError) {
          console.error("[cancelBooking] organizer fetch failed:", organizerFetchError);
          Sentry.captureException(organizerFetchError, {
            extra: { context: "cancelBooking-organizer-fetch-failed", bookingId, organizerId: trip.organizer_id },
          });
        }
        if (organizer?.email) {
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: organizer.email,
            replyTo: REPLY_TO_ADDRESS,
            subject: `${booking.full_name} cancelled their booking for ${trip.title}`,
            html: `
              <p>Hi,</p>
              <p><strong>${escapeHtml(booking.full_name)}</strong> has cancelled their <strong>${booking.slots} slot${booking.slots !== 1 ? "s" : ""}</strong> for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate}. Their slot${booking.slots !== 1 ? "s" : ""} have been returned to the available pool.</p>
              <p>Sama</p>
            `,
          });
        }
      }

      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Booking cancelled: ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Your booking for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been cancelled.</p>
          ${refundLine}
          <p>Sama</p>
        `,
      });

      await sendAdminAlert(
        `[Admin] Booking cancelled: ${escapeHtml(booking.full_name)}, ${trip.title}`,
        `
            <p><strong>${escapeHtml(booking.full_name)}</strong> cancelled their booking for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate}.</p>
            <p>Refund: ${refundAmount === null ? "Custom policy, manual review needed." : refundAmount > 0 ? fmtCurrency(refundAmount) : "Not eligible."}</p>
            <p>Reply to the participant at <a href="mailto:${escapeHtml(booking.email)}">${escapeHtml(booking.email)}</a>.</p>
          `,
      );
    } catch (err) {
      console.error("[email] failed to send cancellation email", err);
      Sentry.captureException(err, {
        extra: { context: "cancelBooking-cancellation-email-failed", bookingId },
      });
    }

    if (wasInIncludedPayout) {
      let organizerName = "Unknown";
      if (trip.organizer_id) {
        const { data: org, error: orgNameFetchError } = await admin
          .from("organizers")
          .select("display_name, full_name")
          .eq("id", trip.organizer_id)
          .maybeSingle();
        if (orgNameFetchError) {
          console.error("[cancelBooking] organizer name fetch failed:", orgNameFetchError);
          Sentry.captureException(orgNameFetchError, {
            extra: { context: "cancelBooking-organizer-name-fetch-failed", bookingId, organizerId: trip.organizer_id },
          });
        }
        organizerName = org?.display_name ?? org?.full_name ?? "Unknown";
      }
      const amountInPayout = booking.payment_option === "downpayment" && booking.amount_due != null
        ? booking.amount_due
        : (booking.total_amount ?? 0);
      await sendAdminAlert(
        `[Admin] Booking cancelled after payout created: review before remitting`,
        `
            <p>A booking was cancelled after its payout record was created but before remittance. <strong>Do not remit this payout until you have adjusted the amounts.</strong></p>
            <p><strong>Booking ID:</strong> ${bookingId}</p>
            <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
            <p><strong>Organizer:</strong> ${escapeHtml(organizerName)}</p>
            <p><strong>Participant:</strong> ${escapeHtml(booking.full_name)} (${escapeHtml(booking.email)})</p>
            <p><strong>Amount in payout:</strong> ${fmtCurrency(amountInPayout)}</p>
            <p>The payout has been flagged for reconciliation in the admin dashboard.</p>
          `,
      );
    }
  }

  revalidatePath("/profile");
  return { success: true };
}
