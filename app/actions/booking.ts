"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { calculateRefundAmount } from "@/lib/cancellation-policies";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? (() => { throw new Error("ADMIN_EMAIL environment variable is not set"); })();
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

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, title, date_start, remaining_slots, organizer_id, difficulty, status, price, payment_type, min_downpayment, downpayment_cutoff_days, messenger_gc_link, waiver_text")
    .eq("slug", input.tripSlug)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[createBooking] trip fetch error:", tripFetchError.code, tripFetchError.message, tripFetchError.details);
  }
  if (!trip) return { error: "Trip not found." };

  if (trip.status !== "active" || trip.date_start < new Date().toISOString().split("T")[0]) {
    return { error: "This trip is no longer available for booking." };
  }
  if (!input.waiverAgreed || !input.platformWaiverAgreed) {
    return { error: "You must agree to both waivers before booking." };
  }

  // Prevent duplicate bookings for the same trip (cancelled bookings allow re-booking).
  const { data: existingBooking } = await admin
    .from("bookings")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .in("status", ["confirmed", "pending", "payment_pending"])
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

  // Atomically check availability and decrement remaining_slots.
  const { error: slotError } = await supabase.rpc("book_slot", {
    p_trip_id: trip.id,
    p_slots_requested: input.slots,
  });
  if (slotError) {
    console.error("[createBooking] book_slot error:", slotError.code, slotError.message, slotError.details, slotError.hint);
    if (slotError.message.includes("not_enough_slots")) {
      return { error: "This trip is fully booked." };
    }
    return { error: "Booking failed. Please try again or contact support." };
  }

  const { data: newBooking, error: insertError } = await admin
    .from("bookings")
    .insert({
      trip_id: trip.id,
      user_id: user.id,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      slots: input.slots,
      total_amount: computedTotal,
      status: "payment_pending",
      notes: input.notes,
      payment_option: input.paymentOption,
      amount_due: computedAmountDue,
      participants: input.participants,
      emergency_contact_name: input.emergencyContactName,
      emergency_contact_phone: input.emergencyContactPhone,
      waiver_agreed: input.waiverAgreed,
      waiver_agreed_at: input.waiverAgreed ? new Date().toISOString() : null,
      platform_waiver_agreed: input.platformWaiverAgreed,
      medical_notes: input.medicalNotes,
      meeting_point: input.meetingPoint,
      platform_commission: platformCommission,
      commission_rate_used: commissionRate,
      waiver_text_snapshot: trip.waiver_text?.replace(/\[Organizer Name\]/gi, organizerName) ?? null,
      waiver_ip: waiverIp,
    })
    .select("id")
    .single();

  if (insertError || !newBooking) {
    console.error("[createBooking] booking insert error:", insertError?.code, insertError?.message, insertError?.details);
    // book_slot already decremented remaining_slots — restore it so the
    // capacity isn't permanently lost.
    await supabase.rpc("restore_slot", {
      p_trip_id: trip.id,
      p_slots_requested: input.slots,
    });
    return { error: insertError?.message ?? "Failed to create booking." };
  }

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
    const linkRes = await fetch(`${SITE_URL}/api/payments/create-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId: newBooking.id,
        amount: computedAmountDue,
        description,
      }),
    });

    if (linkRes.ok) {
      const linkData = await linkRes.json();
      checkoutUrl = linkData.checkoutUrl ?? null;
      if (linkData.linkId) {
        await admin
          .from("bookings")
          .update({ payment_id: linkData.linkId })
          .eq("id", newBooking.id);
      }
    } else {
      console.error("[createBooking] payment link creation failed:", linkRes.status);
    }
  } catch (err) {
    console.error("[createBooking] payment link error:", err);
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
    .select("id, slug, title, date_start, organizer_id, messenger_gc_link")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip || trip.organizer_id?.toString().trim() !== organizer.id?.toString().trim()) {
    return { error: "You don't have permission to manage this booking." };
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
    .select("id, user_id, trip_id, full_name, total_amount, amount_due, payment_option, balance_collected, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to access this booking." };
  if (booking.status !== "confirmed") return { error: "Only confirmed bookings can pay the remaining balance." };
  if (booking.payment_option !== "downpayment") return { error: "This booking was paid in full." };
  if (booking.balance_collected) return { error: "Balance has already been paid." };

  const { data: trip } = await admin
    .from("trips")
    .select("id, title, date_start")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip) return { error: "Trip not found." };
  if (trip.date_start < new Date().toISOString().split("T")[0]) {
    return { error: "This trip has already taken place." };
  }

  const balance = Math.round(((booking.total_amount ?? 0) - (booking.amount_due ?? 0)) * 100) / 100;
  if (balance <= 0) return { error: "No balance remaining." };

  const tripDateShort = new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));
  const description = `Balance payment for ${trip.title} - ${tripDateShort}`;

  try {
    const linkRes = await fetch(`${SITE_URL}/api/payments/create-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, amount: balance, description }),
    });

    if (!linkRes.ok) {
      console.error("[createBalancePaymentLink] payment link creation failed:", linkRes.status);
      return { error: "Failed to create payment link. Please try again." };
    }

    const linkData = await linkRes.json();
    const checkoutUrl: string | null = linkData.checkoutUrl ?? null;

    if (linkData.linkId) {
      await admin
        .from("bookings")
        .update({ balance_payment_id: linkData.linkId })
        .eq("id", bookingId);
    }

    if (!checkoutUrl) {
      return { error: "Failed to create payment link. Please try again." };
    }

    return { success: true, checkoutUrl };
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

export async function cancelBooking(bookingId: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, user_id, total_amount, amount_due, payment_option")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to cancel this booking." };
  if (["cancelled", "rejected", "transferred"].includes(booking.status)) return { error: "This booking is already cancelled or rejected." };

  const { error } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (error) return { error: error.message };

  const { data: trip } = await admin
    .from("trips")
    .select("id, title, date_start, organizer_id, cancellation_policy")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (trip) {
    await admin.rpc("restore_slot", {
      p_trip_id: trip.id,
      p_slots_requested: booking.slots,
    });

    // Auto-notify the first waitlisted person now that a slot has freed up.
    try {
      const { data: firstWaiting } = await admin
        .from("waitlist")
        .select("id, full_name, email, trips(title, slug)")
        .eq("trip_id", trip.id)
        .eq("notified", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstWaiting) {
        type TripRef = { title: string; slug: string };
        const waitlistTrip = firstWaiting.trips as unknown as TripRef | null;
        if (waitlistTrip) {
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: firstWaiting.email,
            replyTo: REPLY_TO_ADDRESS,
            subject: `A slot opened up — ${waitlistTrip.title}`,
            html: `
              <p>Hi ${escapeHtml(firstWaiting.full_name)},</p>
              <p>Good news! A slot has opened up for <strong>${escapeHtml(waitlistTrip.title)}</strong>. Book now before it fills up again:</p>
              <p><a href="${SITE_URL}/trips/${waitlistTrip.slug}">${SITE_URL.replace("https://", "")}/trips/${waitlistTrip.slug}</a></p>
              <p>— The Sama Team</p>
            `,
          });
          await admin.from("waitlist").update({ notified: true }).eq("id", firstWaiting.id);
        }
      }
    } catch (err) {
      console.error("[email] failed to notify waitlist after cancellation", err);
    }

    // Calculate refund based on cancellation policy.
    const daysUntilTrip = Math.floor(
      (new Date(trip.date_start).getTime() - Date.now()) / 86_400_000,
    );
    const amountPaid =
      booking.payment_option === "downpayment" && booking.amount_due != null
        ? booking.amount_due
        : (booking.total_amount ?? 0);
    const refundAmount = calculateRefundAmount(
      trip.cancellation_policy ?? "flexible",
      amountPaid,
      daysUntilTrip,
    );

    if (refundAmount !== null) {
      await admin
        .from("bookings")
        .update({ refund_amount: refundAmount })
        .eq("id", bookingId);
    }

    const fmtCurrency = (n: number) =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 0,
      }).format(n);

    const refundLine =
      refundAmount === null
        ? `<p>If you are eligible for a refund, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking details and we'll process it for you.</p>`
        : refundAmount > 0
          ? `<p>Based on our cancellation policy, your refund will be <strong>${fmtCurrency(refundAmount)}</strong>. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> to process it within 5–7 business days.</p>`
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
    } catch (err) {
      console.error("[email] failed to send cancellation email", err);
    }
  }

  revalidatePath("/profile");
  return { success: true };
}
