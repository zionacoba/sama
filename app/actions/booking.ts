"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { calculateRefundAmount, CANCELLATION_POLICIES } from "@/lib/cancellation-policies";
import { processPayMongoRefund, type RefundResult } from "@/lib/paymongo-refund";
import { createPaymentLink } from "@/lib/create-payment-link";

if (!process.env.ADMIN_EMAIL) console.warn("[config] ADMIN_EMAIL is not set — admin alerts will be skipped");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
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
  medicalNotes: string | null;
  meetingPoint: string | null;
};

export async function createBooking(input: CreateBookingInput) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Use admin client for all DB operations so RLS never blocks reads or
  // writes, and RETURNING clauses always get back the new row's id.
  const admin = createSupabaseAdminClient();

  if (!input.slots || input.slots < 1) {
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

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, title, date_start, remaining_slots, organizer_id, difficulty, status, price, payment_type, min_downpayment, downpayment_cutoff_days, messenger_gc_link, waiver_text, cancellation_policy")
    .eq("slug", input.tripSlug)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[createBooking] trip fetch error:", tripFetchError.code, tripFetchError.message, tripFetchError.details);
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
  const { data: tripOrganizer } = await admin
    .from("organizers")
    .select("display_name, full_name, commission_rate")
    .eq("id", trip.organizer_id)
    .maybeSingle();
  const organizerName = tripOrganizer?.display_name ?? tripOrganizer?.full_name ?? "";
  const commissionRate = tripOrganizer?.commission_rate != null ? Number(tripOrganizer.commission_rate) : 0.05;
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
    p_platform_waiver_snapshot: "By completing this booking, I agree that Sama is a technology marketplace that connects participants with independent trip organizers. Sama is not responsible for the conduct, acts, or omissions of organizers. I voluntarily assume all risks associated with outdoor activities.",
  });

  if (bookingError || newBookingId == null) {
    console.error("[createBooking] book_slot_and_create_booking error:", bookingError?.code, bookingError?.message, bookingError?.details);
    if (bookingError?.message?.includes("not_enough_slots")) {
      return { error: "This trip is fully booked." };
    }
    if (bookingError?.code === "23505") {
      return { error: "You already have an active booking for this trip." };
    }
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
    completed: i === 0,
  }));

  await admin.from("booking_participants").insert(participantRows);

  // Remove any waitlist entry for this user+trip now that they have a booking.
  await admin.from("waitlist").delete().eq("trip_id", trip.id).eq("user_id", user.id);

  // Snapshot the cancellation policy at booking time so later trip changes don't affect this booking.
  await admin
    .from("bookings")
    .update({ cancellation_policy: trip.cancellation_policy ?? null })
    .eq("id", newBooking.id);

  const participantTokens =
    input.slots > 1
      ? participantRows.slice(1).map((p) => ({ slotIndex: p.slot_number, token: p.token }))
      : [];

  const bookingRef = newBooking.id.toString(16).toUpperCase().slice(-8).padStart(8, "0");

  // Free trips: skip PayMongo and confirm immediately.
  if (computedAmountDue === 0) {
    const autoApprove = trip.difficulty === "Beginner" || trip.difficulty === "Intermediate";
    await admin
      .from("bookings")
      .update({ status: autoApprove ? "confirmed" : "pending" })
      .eq("id", newBooking.id);

    if (autoApprove) {
      const tripDate = new Intl.DateTimeFormat("en-PH", {
        weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
      }).format(new Date(trip.date_start));
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
            ${(() => {
              const policy = trip.cancellation_policy;
              if (!policy) return "";
              const meta = CANCELLATION_POLICIES[policy as keyof typeof CANCELLATION_POLICIES];
              const policyText = meta && policy !== "custom"
                ? `<strong>Cancellation policy (${meta.label}):</strong> ${meta.text}`
                : `<strong>Cancellation policy:</strong> This trip has a custom cancellation policy — refer to the trip page for full details.`;
              return `<p style="font-size:13px;color:#78716c;border-top:1px solid #e7e5e4;margin-top:16px;padding-top:12px;">${policyText}</p>`;
            })()}
            <p>— The Sama Team</p>
          `,
        });
      } catch (err) {
        console.error("[email] failed to send free booking confirmation", err);
      }
    }

    revalidatePath(`/trips/${input.tripSlug}`);
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
    const linkResult = await createPaymentLink({
      bookingId: newBooking.id,
      amount: computedAmountDue,
      description,
    });

    if ("error" in linkResult) {
      console.error("[createBooking] payment link creation failed:", linkResult.error);
      await admin.rpc("restore_slot", { p_trip_id: trip.id, p_slots_requested: input.slots });
      await admin.from("bookings").delete().eq("id", newBooking.id);
      return { error: "We could not create your payment link. Please try again." };
    }

    checkoutUrl = linkResult.checkoutUrl;
    await admin
      .from("bookings")
      .update({ payment_id: linkResult.linkId })
      .eq("id", newBooking.id);
  } catch (err) {
    console.error("[createBooking] payment link error:", err);
    await admin.rpc("restore_slot", { p_trip_id: trip.id, p_slots_requested: input.slots });
    await admin.from("bookings").delete().eq("id", newBooking.id);
    return { error: "We could not create your payment link. Please try again." };
  }

  if (!checkoutUrl) {
    console.error("[createBooking] payment link created but checkoutUrl missing, rolling back slot");
    await admin.rpc("restore_slot", { p_trip_id: trip.id, p_slots_requested: input.slots });
    await admin.from("bookings").delete().eq("id", newBooking.id);
    return { error: "We could not create your payment link. Please try again." };
  }

  revalidatePath(`/trips/${input.tripSlug}`);
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

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, amount_due, payment_option")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };

  // Block acting on payment_pending bookings (no payment confirmed yet).
  if (booking.status === "payment_pending") {
    return { error: "This booking is awaiting payment and cannot be manually approved or rejected." };
  }

  // Only pending bookings can be confirmed or rejected by the organizer.
  if (booking.status !== "pending") {
    return { error: "This booking cannot be updated in its current state." };
  }

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id, messenger_gc_link, status")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip || trip.organizer_id?.toString().trim() !== organizer.id?.toString().trim()) {
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
          <p>— The Sama Team</p>
        `,
      });
    } else if (status === "rejected") {
      const bookingRef = booking.id.toString(16).toUpperCase().slice(-8).padStart(8, "0");
      const fmtPHP = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Update on your booking request for ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Unfortunately your booking request for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} was not approved by the organizer.</p>
          ${booking.amount_due ? `
          <p>Your payment of <strong>${fmtPHP(booking.amount_due)}</strong> will be refunded to your original payment method within 3–5 business days. You do not need to do anything.</p>
          <p>If you don't receive your refund after 5 business days, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking reference: <strong>${bookingRef}</strong></p>
          ` : `<p>If you have questions, please contact <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>`}
          <p>— The Sama Team</p>
        `,
      });
    }
  } catch (err) {
    console.error("[email] failed to send booking status update", err);
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

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, full_name, email, total_amount, amount_due, payment_option, balance_collected")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.payment_option !== "downpayment") {
    return { error: "Balance collection is only applicable to downpayment bookings." };
  }
  if (booking.balance_collected) {
    return { error: "Balance has already been marked as collected." };
  }

  const { data: trip } = await admin
    .from("trips")
    .select("id, title, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip || trip.organizer_id?.toString() !== organizer.id?.toString()) {
    return { error: "You don't have permission to update this booking." };
  }

  const { error } = await admin
    .from("bookings")
    .update({ balance_collected: true })
    .eq("id", bookingId);

  if (error) return { error: error.message };

  try {
    const fmt = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
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
        <p>— The Sama Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send balance collected confirmation", err);
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

  const { data: booking } = await admin
    .from("bookings")
    .select("id, user_id, trip_id, full_name, total_amount, amount_due, payment_option, balance_collected, status, balance_payment_id, balance_payment_gateway_status")
    .eq("id", bookingId)
    .maybeSingle();

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
        const pmRes = await fetch(`https://api.paymongo.com/v1/links/${booking.balance_payment_id}`, {
          headers: { Authorization: auth, Accept: "application/json" },
        });

        if (pmRes.ok) {
          const pmData = await pmRes.json();
          const linkStatus = pmData.data?.attributes?.status as string | undefined;
          if (linkStatus === "unpaid") {
            // Link is still live — return the existing checkout URL to the joiner.
            const existingUrl = pmData.data?.attributes?.checkout_url as string | undefined;
            if (existingUrl) return { success: true, checkoutUrl: existingUrl };
            // URL missing in response — fall through and generate a new link.
          }
          // "archived" or any other terminal status: clear and generate a fresh link.
          if (linkStatus !== "unpaid") {
            await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
          }
        } else if (pmRes.status === 404) {
          await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
        } else {
          // PayMongo API error — allow re-generation rather than permanently blocking.
          console.error("[createBalancePaymentLink] PayMongo link status check failed:", pmRes.status);
          await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
        }
      } catch (err) {
        // Network error — allow re-generation.
        console.error("[createBalancePaymentLink] PayMongo link status check error:", err);
        await admin.from("bookings").update({ balance_payment_id: null }).eq("id", bookingId);
      }
    }
    // No secret key: fall through and generate a new link.
  }

  const { data: trip } = await admin
    .from("trips")
    .select("id, title, date_start")
    .eq("id", booking.trip_id)
    .maybeSingle();

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
    const linkResult = await createPaymentLink({ bookingId, amount: balance, description });

    if ("error" in linkResult) {
      console.error("[createBalancePaymentLink] payment link creation failed:", linkResult.error);
      return { error: "Failed to create payment link. Please try again." };
    }

    await admin
      .from("bookings")
      .update({ balance_payment_id: linkResult.linkId })
      .eq("id", bookingId);

    return { success: true, checkoutUrl: linkResult.checkoutUrl };
  } catch (err) {
    console.error("[createBalancePaymentLink] error:", err);
    return { error: "Failed to create payment link. Please try again." };
  }
}

export async function markAsTransferred(bookingId: number, transferredToEmail: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "confirmed") return { error: "Only confirmed bookings can be marked as transferred." };

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip || trip.organizer_id?.toString() !== organizer.id?.toString()) {
    return { error: "You don't have permission to manage this booking." };
  }

  const { error } = await admin
    .from("bookings")
    .update({
      status: "transferred",
      transferred_to_email: transferredToEmail.trim() || null,
    })
    .eq("id", bookingId);

  if (error) return { error: error.message };

  const { error: slotErr } = await admin.rpc("restore_slot", {
    p_trip_id: trip.id,
    p_slots_requested: booking.slots,
  });
  if (slotErr) {
    console.error(`[markAsTransferred] restore_slot failed for booking ${bookingId}:`, slotErr.message);
    await admin
      .from("bookings")
      .update({ status: "confirmed", transferred_to_email: null })
      .eq("id", bookingId);
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: ADMIN_EMAIL,
        replyTo: REPLY_TO_ADDRESS,
        subject: "Action needed: slot restore failed on transfer",
        html: `
          <p>A booking transfer was reverted because the slot restore failed. The booking remains confirmed.</p>
          <p><strong>Booking ID:</strong> ${bookingId}</p>
          <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
          <p><strong>Error:</strong> ${escapeHtml(slotErr.message)}</p>
        `,
      });
    } catch (alertErr) {
      console.error("[markAsTransferred] failed to send admin alert:", alertErr);
    }
    return { error: "Transfer failed: could not restore slot. Please try again." };
  }

  const tripDate = new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: booking.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: `Your booking for ${trip.title} has been marked as transferred`,
      html: `
        <p>Hi ${escapeHtml(booking.full_name)},</p>
        <p>Your booking for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been marked as <strong>transferred</strong> by your organizer.</p>
        <p>No refund will be processed through Sama for this booking. Please settle any payment arrangements directly with the person taking your slot.</p>
        <p>If you have any questions, please contact your organizer directly.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send transfer notice to participant", err);
  }

  try {
    const { data: org } = await admin
      .from("organizers")
      .select("email, full_name")
      .eq("id", organizer.id)
      .maybeSingle();

    if (org?.email) {
      const toNote = transferredToEmail.trim()
        ? ` to <strong>${escapeHtml(transferredToEmail.trim())}</strong>`
        : "";
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: org.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Booking transferred: ${booking.full_name} — ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(org.full_name)},</p>
          <p>The booking for <strong>${escapeHtml(booking.full_name)}</strong> on <strong>${escapeHtml(trip.title)}</strong> (${tripDate}) has been marked as transferred${toNote}.</p>
          <p>The slot has been restored to the available pool.</p>
          <p>— The Sama Team</p>
        `,
      });
    }
  } catch (err) {
    console.error("[email] failed to send transfer confirmation to organizer", err);
  }

  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  revalidatePath(`/trips/${trip.slug}`);
  return { success: true };
}

export async function markAsNoShow(bookingId: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!organizer) return { error: "Not an approved organizer." };

  const admin = createSupabaseAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, status, full_name")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "confirmed") return { error: "Only confirmed bookings can be marked as no show." };

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, date_start, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip || trip.organizer_id?.toString() !== organizer.id?.toString()) {
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

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, user_id, total_amount, amount_due, payment_option, paymongo_payment_id, payment_method, payout_status, payout_id, cancellation_policy, platform_commission, commission_rate_used, balance_payment_gateway_status, balance_paymongo_payment_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to modify this booking." };
  if (!["confirmed", "pending"].includes(booking.status)) {
    return { error: "Only confirmed or pending bookings can be partially cancelled." };
  }
  if (slotsToCancel >= booking.slots) {
    return { error: "To cancel all slots, use the full cancellation option." };
  }

  const { data: tripDateCheck } = await admin
    .from("trips")
    .select("date_start, slug, title, organizer_id, cancellation_policy")
    .eq("id", booking.trip_id)
    .maybeSingle();

  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (tripDateCheck && tripDateCheck.date_start < todayPH) {
    return { error: "This trip has already taken place. Bookings can no longer be modified." };
  }

  const originalSlots = booking.slots;
  const remainingSlots = originalSlots - slotsToCancel;

  const amountPaid =
    booking.balance_payment_gateway_status === 'paid'
      ? (booking.total_amount ?? 0)
      : booking.payment_option === "downpayment" && booking.amount_due != null
        ? booking.amount_due
        : (booking.total_amount ?? 0);

  const todayManilaStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const todayManila = new Date(todayManilaStr);
  const tripDay = new Date(tripDateCheck!.date_start);
  const daysUntilTrip = Math.round((tripDay.getTime() - todayManila.getTime()) / 86_400_000);

  const fullRefundableAmount = calculateRefundAmount(
    booking.cancellation_policy ?? tripDateCheck?.cancellation_policy ?? "flexible",
    amountPaid,
    daysUntilTrip,
  );

  const refundAmount = fullRefundableAmount !== null
    ? Math.round((slotsToCancel / originalSlots) * fullRefundableAmount * 100) / 100
    : null;

  // Split refund proportionally between downpayment and balance payment sources
  const partialBalanceAmount = (booking.total_amount ?? 0) - (booking.amount_due ?? 0);
  const partialBalanceRefundAmount =
    booking.balance_payment_gateway_status === 'paid' && booking.balance_paymongo_payment_id && partialBalanceAmount > 0 && refundAmount !== null
      ? Math.round(refundAmount * (partialBalanceAmount / amountPaid) * 100) / 100
      : 0;
  const downpaymentRefundAmount =
    refundAmount !== null ? Math.round((refundAmount - partialBalanceRefundAmount) * 100) / 100 : null;

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
    .select("id");

  if (updateError) return { error: updateError.message };
  if (!updatedRows || updatedRows.length === 0) return { error: "Your booking was modified by another request. Please refresh and try again." };

  await admin.rpc("restore_slot", {
    p_trip_id: booking.trip_id,
    p_slots_requested: slotsToCancel,
  });

  let refundResult: RefundResult | null = null;
  let balanceRefundResult: RefundResult | null = null;

  if (downpaymentRefundAmount !== null && downpaymentRefundAmount > 0) {
    refundResult = await processPayMongoRefund({
      paymentId: booking.paymongo_payment_id,
      paymentMethod: booking.payment_method,
      amountPesos: downpaymentRefundAmount,
      notes: `Partial cancellation: ${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""} cancelled`,
    });
    if (!refundResult.success && !refundResult.requiresManualProcessing) {
      console.error("[refund] partialCancelBooking refund failed", bookingId, refundResult.error);
    }
  }

  if (partialBalanceRefundAmount > 0 && booking.balance_paymongo_payment_id) {
    balanceRefundResult = await processPayMongoRefund({
      paymentId: booking.balance_paymongo_payment_id,
      paymentMethod: booking.payment_method,
      amountPesos: partialBalanceRefundAmount,
      notes: `Partial cancellation: ${slotsToCancel} slot${slotsToCancel !== 1 ? "s" : ""} cancelled - balance refund`,
    });
    if (!balanceRefundResult.success && !balanceRefundResult.requiresManualProcessing) {
      console.error("[refund] partialCancelBooking balance refund failed", bookingId, balanceRefundResult.error);
    }
  }

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);

  if (tripDateCheck) {
    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
    }).format(new Date(tripDateCheck.date_start));

    if (tripDateCheck.organizer_id) {
      const { data: organizer } = await admin
        .from("organizers")
        .select("email")
        .eq("id", tripDateCheck.organizer_id)
        .maybeSingle();

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
              <p>— The Sama Team</p>
            `,
          });
        } catch (err) {
          console.error("[email] failed to notify organizer of partial cancellation", err);
        }
      }
    }

    const refundLine =
      refundAmount === null
        ? `<p>If you are eligible for a refund, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking details.</p>`
        : refundAmount > 0
          ? (refundResult?.success
              ? `<p>Your refund of <strong>${fmtCurrency(refundAmount)}</strong> for the cancelled slot${slotsToCancel !== 1 ? "s" : ""} has been processed and will reflect within 24 hours.</p>`
              : `<p>Your refund of <strong>${fmtCurrency(refundAmount)}</strong> will be processed. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> if you don't receive it within 5–7 business days.</p>`)
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
          ${refundLine}
          <p>— The Sama Team</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to send partial cancellation confirmation", err);
    }

    const needsManualRefund =
      (refundResult && !refundResult.success) ||
      (balanceRefundResult && !balanceRefundResult.success);
    if (needsManualRefund && ADMIN_EMAIL) {
      try {
        const isQrPh = refundResult?.requiresManualProcessing || balanceRefundResult?.requiresManualProcessing;
        const refundNote = isQrPh
          ? "Payment method is QR Ph — must be refunded manually."
          : `Automatic refund failed: ${refundResult?.error ?? balanceRefundResult?.error ?? "Unknown error"}`;
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: `[Admin] Manual refund required (partial cancel): ${escapeHtml(booking.full_name)} — ${tripDateCheck.title}`,
          html: `
            <p>A partial cancellation refund could not be automatically processed.</p>
            <p><strong>Booking ID:</strong> ${bookingId}</p>
            <p><strong>Slots cancelled:</strong> ${slotsToCancel}</p>
            <p><strong>Participant:</strong> ${escapeHtml(booking.full_name)} (${escapeHtml(booking.email)})</p>
            <p><strong>Refund amount:</strong> ${refundAmount != null && refundAmount > 0 ? fmtCurrency(refundAmount) : "N/A"}</p>
            <p><strong>Reason:</strong> ${refundNote}</p>
          `,
        });
      } catch (alertErr) {
        console.error("[email] failed to send partial cancel manual refund alert", alertErr);
      }
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

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, user_id, total_amount, amount_due, payment_option, paymongo_payment_id, balance_paymongo_payment_id, payment_method, balance_payment_gateway_status, payout_status, payout_id, cancellation_policy")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to cancel this booking." };
  if (["cancelled", "rejected", "transferred"].includes(booking.status)) return { error: "This booking is already cancelled or rejected." };
  if (booking.status === "no_show") return { error: "This booking has been marked as no-show and cannot be cancelled." };

  // Block cancellation after the trip has already taken place.
  const { data: tripDateCheck } = await admin
    .from("trips")
    .select("date_start")
    .eq("id", booking.trip_id)
    .maybeSingle();
  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (tripDateCheck && tripDateCheck.date_start < todayPH) {
    return { error: "This trip has already taken place. Bookings can no longer be cancelled." };
  }

  const { data: cancelledBooking, error: cancelError } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId)
    .in("status", ["confirmed", "pending", "payment_pending"])
    .select()
    .single();

  if (cancelError || !cancelledBooking) {
    return { error: "Booking could not be cancelled. It may have already been cancelled." };
  }

  // Flag the associated payout for reconciliation whenever cancellation happens after payout creation.
  const wasInIncludedPayout = booking.payout_status === "included" && !!booking.payout_id;
  if (booking.payout_id && (booking.payout_status === "remitted" || booking.payout_status === "included")) {
    await admin
      .from("payouts" as "trips")
      .update({ needs_reconciliation: true } as never)
      .eq("id", booking.payout_id);
  }

  await admin
    .from("booking_participants")
    .delete()
    .eq("booking_id", bookingId);

  // Restore the slot unconditionally — we have everything we need from the
  // booking row. Doing this before the trip fetch ensures the slot is always
  // returned even if the trip has been deleted or the fetch fails.
  await admin.rpc("restore_slot", {
    p_trip_id: booking.trip_id,
    p_slots_requested: booking.slots,
  });

  const { data: trip } = await admin
    .from("trips")
    .select("id, slug, title, date_start, organizer_id, cancellation_policy")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (trip) {

    // Notify all waitlisted members that a slot has freed up.
    const { data: waitingEntries } = await admin
      .from("waitlist")
      .select("id, full_name, email")
      .eq("trip_id", trip.id)
      .eq("notified", false)
      .order("created_at", { ascending: true });

    if (waitingEntries && waitingEntries.length > 0) {
      const slotTripDate = new Intl.DateTimeFormat("en-PH", {
        month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
      }).format(new Date(trip.date_start));

      await Promise.allSettled(waitingEntries.map(async (entry) => {
        try {
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: entry.email,
            replyTo: REPLY_TO_ADDRESS,
            subject: `A slot just opened for ${trip.title}`,
            html: `
              <p>Hi ${escapeHtml(entry.full_name)},</p>
              <p>Good news! A slot just opened for <strong>${escapeHtml(trip.title)}</strong> on ${slotTripDate}. Book now at <a href="${SITE_URL}/trips/${trip.slug}">${SITE_URL.replace("https://", "")}/trips/${trip.slug}</a> — it's first come, first served. Only one slot is available so act quickly.</p>
              <p>— The Sama Team</p>
            `,
          });
        } catch (err) {
          console.error("[email] failed to notify waitlist after cancellation", entry.id, err);
        }
      }));

      await admin.from("waitlist").update({ notified: true }).in("id", waitingEntries.map((e) => e.id));
    }

    // Calculate refund based on cancellation policy.
    // Compare calendar dates in Philippine time so boundary days (e.g. cancelling
    // at 6am on the 7th calendar day) are counted correctly and not floored to 6.
    const todayManilaStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const todayManila = new Date(todayManilaStr);
    const tripDay = new Date(trip.date_start);
    const daysUntilTrip = Math.round((tripDay.getTime() - todayManila.getTime()) / 86_400_000);
    const amountPaid =
      booking.balance_payment_gateway_status === 'paid'
        ? (booking.total_amount ?? 0)
        : booking.payment_option === "downpayment" && booking.amount_due != null
          ? booking.amount_due
          : (booking.total_amount ?? 0);
    const refundAmount = calculateRefundAmount(
      booking.cancellation_policy ?? trip.cancellation_policy ?? "flexible",
      amountPaid,
      daysUntilTrip,
    );

    // Split refund proportionally between downpayment and balance payment sources
    const balanceAmount = (booking.total_amount ?? 0) - (booking.amount_due ?? 0);
    const refundPercentage = amountPaid > 0 && refundAmount !== null ? refundAmount / amountPaid : 0;
    const balanceRefundAmount =
      booking.balance_payment_gateway_status === 'paid' && booking.balance_paymongo_payment_id && balanceAmount > 0
        ? Math.round(refundPercentage * balanceAmount * 100) / 100
        : 0;
    const downpaymentRefundAmount =
      refundAmount !== null ? Math.round((refundAmount - balanceRefundAmount) * 100) / 100 : null;

    if (refundAmount !== null) {
      await admin
        .from("bookings")
        .update({ refund_amount: refundAmount })
        .eq("id", bookingId);
    }

    // Record a deduction against the organizer when a refund is issued after their payout was already remitted.
    if (booking.payout_status === "remitted" && trip.organizer_id && refundAmount !== null && refundAmount > 0) {
      const { error: deductionError } = await (admin
        .from("organizer_deductions" as "trips")
        .insert({
          organizer_id: trip.organizer_id,
          booking_id: bookingId,
          amount: refundAmount,
          reason: "Joiner cancellation refund after payout remitted",
          status: "pending",
        } as never) as unknown as Promise<{ error: { message: string } | null }>);
      if (deductionError) {
        console.error("[deduction] failed to record organizer deduction", bookingId, deductionError.message);
      }
    }

    // Process automatic refunds — a failed refund never blocks the cancellation.
    let refundResult: RefundResult | null = null;
    let balanceRefundResult: RefundResult | null = null;

    if (downpaymentRefundAmount !== null && downpaymentRefundAmount > 0) {
      refundResult = await processPayMongoRefund({
        paymentId: booking.paymongo_payment_id,
        paymentMethod: booking.payment_method,
        amountPesos: downpaymentRefundAmount,
        notes: 'Joiner cancelled booking',
      });
      if (!refundResult.success && !refundResult.requiresManualProcessing) {
        console.error('[refund] cancelBooking initial refund failed', bookingId, refundResult.error);
      }
    }

    if (balanceRefundAmount > 0 && booking.balance_paymongo_payment_id) {
      balanceRefundResult = await processPayMongoRefund({
        paymentId: booking.balance_paymongo_payment_id,
        paymentMethod: booking.payment_method,
        amountPesos: balanceRefundAmount,
        notes: 'Joiner cancelled booking - balance refund',
      });
      if (!balanceRefundResult.success && !balanceRefundResult.requiresManualProcessing) {
        console.error('[refund] cancelBooking balance refund failed', bookingId, balanceRefundResult.error);
      }
    }

    const fmtCurrency = (n: number) =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 0,
      }).format(n);

    const balanceRefundFailed = balanceRefundAmount > 0 && balanceRefundResult != null && !balanceRefundResult.success;
    const refundLine =
      refundAmount === null
        ? `<p>If you are eligible for a refund, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking details and we'll process it for you.</p>`
        : refundAmount > 0
          ? (refundResult?.success && balanceRefundFailed
              ? `<p>Based on our cancellation policy, your downpayment refund of <strong>${fmtCurrency(downpaymentRefundAmount!)}</strong> has been processed and will reflect within 24 hours. Your balance refund of <strong>${fmtCurrency(balanceRefundAmount)}</strong> is being processed manually — we'll email you once it's done.</p>`
              : refundResult?.success
                ? `<p>Based on our cancellation policy, your refund of <strong>${fmtCurrency(refundAmount)}</strong> has been processed and will reflect within 24 hours.</p>`
                : `<p>Based on our cancellation policy, your refund will be <strong>${fmtCurrency(refundAmount)}</strong>. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> to process it within 5–7 business days.</p>`)
          : `<p>Based on our cancellation policy, this cancellation is not eligible for a refund.</p>`;

    try {
      const tripDate = new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "Asia/Manila",
      }).format(new Date(trip.date_start));

      if (trip.organizer_id) {
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
            subject: `${booking.full_name} cancelled their booking for ${trip.title}`,
            html: `
              <p>Hi,</p>
              <p><strong>${escapeHtml(booking.full_name)}</strong> has cancelled their <strong>${booking.slots} slot${booking.slots !== 1 ? "s" : ""}</strong> for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate}. Their slot${booking.slots !== 1 ? "s" : ""} have been returned to the available pool.</p>
              <p>— The Sama Team</p>
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
          <p>— The Sama Team</p>
        `,
      });

      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: `[Admin] Booking cancelled: ${escapeHtml(booking.full_name)} — ${trip.title}`,
          html: `
            <p><strong>${escapeHtml(booking.full_name)}</strong> cancelled their booking for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate}.</p>
            <p>Refund: ${refundAmount === null ? "Custom policy — manual review needed." : refundAmount > 0 ? fmtCurrency(refundAmount) : "Not eligible."}</p>
            <p>Reply to the participant at <a href="mailto:${escapeHtml(booking.email)}">${escapeHtml(booking.email)}</a>.</p>
          `,
        });
      } catch (adminErr) {
        console.error("[email] failed to send admin cancellation notification", adminErr);
      }

      const needsManualRefund =
        (refundResult && !refundResult.success) ||
        (balanceRefundResult && !balanceRefundResult.success);
      if (needsManualRefund) {
        try {
          const isQrPh = refundResult?.requiresManualProcessing || balanceRefundResult?.requiresManualProcessing;
          const refundNote = isQrPh
            ? 'Payment method is QR Ph — must be refunded manually.'
            : `Automatic refund failed: ${refundResult?.error ?? balanceRefundResult?.error ?? 'Unknown error'}`;
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: ADMIN_EMAIL,
            replyTo: REPLY_TO_ADDRESS,
            subject: `[Admin] Manual refund required: ${escapeHtml(booking.full_name)} — ${trip.title}`,
            html: `
              <p>A refund could not be automatically processed.</p>
              <p><strong>Booking ID:</strong> ${bookingId}</p>
              <p><strong>Participant:</strong> ${escapeHtml(booking.full_name)} (${escapeHtml(booking.email)})</p>
              <p><strong>Refund amount:</strong> ${refundAmount !== null && refundAmount > 0 ? fmtCurrency(refundAmount) : 'See booking details'}</p>
              <p><strong>Reason:</strong> ${refundNote}</p>
              <p>Please process this refund manually.</p>
            `,
          });
        } catch (alertErr) {
          console.error('[email] failed to send manual refund alert', alertErr);
        }
      }
    } catch (err) {
      console.error("[email] failed to send cancellation email", err);
    }

    if (wasInIncludedPayout && ADMIN_EMAIL) {
      try {
        let organizerName = "Unknown";
        if (trip.organizer_id) {
          const { data: org } = await admin
            .from("organizers")
            .select("display_name, full_name")
            .eq("id", trip.organizer_id)
            .maybeSingle();
          organizerName = org?.display_name ?? org?.full_name ?? "Unknown";
        }
        const amountInPayout = booking.payment_option === "downpayment" && booking.amount_due != null
          ? booking.amount_due
          : (booking.total_amount ?? 0);
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: `[Admin] Booking cancelled after payout created — review before remitting`,
          html: `
            <p>A booking was cancelled after its payout record was created but before remittance. <strong>Do not remit this payout until you have adjusted the amounts.</strong></p>
            <p><strong>Booking ID:</strong> ${bookingId}</p>
            <p><strong>Trip:</strong> ${escapeHtml(trip.title)}</p>
            <p><strong>Organizer:</strong> ${escapeHtml(organizerName)}</p>
            <p><strong>Participant:</strong> ${escapeHtml(booking.full_name)} (${escapeHtml(booking.email)})</p>
            <p><strong>Amount in payout:</strong> ${fmtCurrency(amountInPayout)}</p>
            <p>The payout has been flagged for reconciliation in the admin dashboard.</p>
          `,
        });
      } catch (payoutAlertErr) {
        console.error("[email] failed to send included payout cancellation alert", payoutAlertErr);
      }
    }
  }

  revalidatePath("/profile");
  return { success: true };
}
