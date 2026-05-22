"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

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
    .select("id, title, date_start, remaining_slots, organizer_id, difficulty, status, price, payment_type, min_downpayment, messenger_gc_link")
    .eq("slug", input.tripSlug)
    .maybeSingle();

  if (!trip) return { error: "Trip not found." };

  if (trip.status !== "active" || new Date(trip.date_start) < new Date()) {
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
    .in("status", ["confirmed", "pending"])
    .maybeSingle();

  if (existingBooking) {
    return { error: "You already have a booking for this trip." };
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
  const computedTotal = trip.price * input.slots;
  const canDownpay = trip.payment_type === "downpayment" && trip.min_downpayment != null && trip.min_downpayment < trip.price;
  const computedAmountDue = input.paymentOption === "downpayment" && canDownpay
    ? Math.min((trip.min_downpayment as number) * input.slots, computedTotal)
    : computedTotal;
  const platformCommission = parseFloat((computedTotal * 0.04).toFixed(2));

  // Atomically check availability and decrement remaining_slots.
  const { error: slotError } = await supabase.rpc("book_slot", {
    p_trip_id: trip.id,
    p_slots_requested: input.slots,
  });
  if (slotError) {
    if (slotError.message.includes("not_enough_slots")) {
      return { error: "This trip is fully booked." };
    }
    throw slotError;
  }

  const autoApprove = trip.difficulty === "Beginner" || trip.difficulty === "Intermediate";
  const bookingStatus = autoApprove ? "confirmed" : "pending";

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
      status: bookingStatus,
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
    })
    .select("id")
    .single();

  if (insertError || !newBooking) {
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

  const participantTokens =
    input.slots > 1
      ? participantRows.slice(1).map((p) => ({ slotIndex: p.slot_number, token: p.token }))
      : [];

  try {
    if (trip?.organizer_id) {
      const { data: organizer } = await admin
        .from("organizers")
        .select("email")
        .eq("id", trip.organizer_id)
        .maybeSingle();

      const organizerEmail = organizer?.email;

      if (organizerEmail) {
        const tripDate = new Intl.DateTimeFormat("en-PH", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(new Date(trip.date_start));

        const participantsRow =
          input.participants && input.participants.length > 1
            ? `<li><strong>Participants:</strong> ${input.participants.map((n) => escapeHtml(n || "(unnamed)")).join(", ")}</li>`
            : "";

        const medicalRow = input.medicalNotes
          ? `<li><strong>Medical / allergies:</strong> ${escapeHtml(input.medicalNotes)}</li>`
          : "";

        await resend.emails.send({
          from: "Sama <onboarding@resend.dev>",
          to: organizerEmail,
          replyTo: "sama.com.ph@gmail.com",
          subject: `New booking for ${trip.title}`,
          html: `
            <p>Hi,</p>
            <p><strong>${escapeHtml(input.fullName)}</strong> (${input.email}) just booked <strong>${input.slots} slot${input.slots !== 1 ? "s" : ""}</strong> on your trip:</p>
            <ul>
              <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              ${participantsRow}
              <li><strong>Emergency contact:</strong> ${escapeHtml(input.emergencyContactName)} — ${escapeHtml(input.emergencyContactPhone)}</li>
              ${medicalRow}
              <li><strong>Waiver agreed:</strong> ${input.waiverAgreed ? "✓ Yes" : "✗ No"}</li>
            </ul>
            ${autoApprove
              ? `<p>This booking was <strong>automatically confirmed</strong> (${trip.difficulty} trip).</p>`
              : `<p>Log in to your <a href="https://sama.ph/organizer/dashboard">organizer dashboard</a> to confirm or reject this booking.</p>`
            }
            <p>— The Sama Team</p>
          `,
        });
      }
    }

    if (trip) {
      const tripDate = new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(trip.date_start));

      await resend.emails.send({
        from: "Sama <onboarding@resend.dev>",
        to: input.email,
        replyTo: "sama.com.ph@gmail.com",
        subject: autoApprove
          ? `You're confirmed for ${trip.title}!`
          : `Booking request received for ${trip.title}`,
        html: autoApprove
          ? `
            <p>Hi ${escapeHtml(input.fullName)},</p>
            <p>You're in! Your booking for <strong>${escapeHtml(trip.title)}</strong> is confirmed. Here's a summary:</p>
            <ul>
              <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              <li><strong>Slots booked:</strong> ${input.slots}</li>
            </ul>
            ${trip.messenger_gc_link ? `
            <p>Join the group chat for trip updates and coordination:<br>
            <a href="${trip.messenger_gc_link}">${escapeHtml(trip.messenger_gc_link)}</a></p>
            <p>This is where the organizer will share meetup details, reminders, and important updates.</p>
            ` : ""}
            <p>The organizer will be in touch with trip details closer to the date. You can view your booking at <a href="https://sama.ph/profile">sama.ph/profile</a>.</p>
            <p>— The Sama Team</p>
          `
          : `
            <p>Hi ${escapeHtml(input.fullName)},</p>
            <p>We've received your request to join <strong>${escapeHtml(trip.title)}</strong>. Here's a summary:</p>
            <ul>
              <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              <li><strong>Slots requested:</strong> ${input.slots}</li>
            </ul>
            <p>The organizer will review your request and confirm your spot. This usually takes 24–48 hours. You can track your booking at <a href="https://sama.ph/profile">sama.ph/profile</a>.</p>
            <p>— The Sama Team</p>
          `,
      });
    }
  } catch {
    // Email failure is non-fatal
  }

  revalidatePath(`/trips/${input.tripSlug}`);
  return {
    success: true as const,
    status: bookingStatus,
    participantTokens: participantTokens.length > 0 ? participantTokens : undefined,
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

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };

  const { data: trip } = await supabase
    .from("trips")
    .select("id, title, date_start, organizer_id, remaining_slots, total_slots, messenger_gc_link")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip || trip.organizer_id?.toString().trim() !== organizer.id?.toString().trim()) {
    return { error: "You don't have permission to manage this booking." };
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) return { error: error.message };

  // Restore slots when rejecting a booking that wasn't already rejected/cancelled.
  if (status === "rejected" && booking.status !== "rejected" && booking.status !== "cancelled") {
    await supabase
      .from("trips")
      .update({
        remaining_slots: Math.min(trip.total_slots, trip.remaining_slots + booking.slots),
      })
      .eq("id", trip.id);
  }

  // Notify participant of the status change.
  try {
    const tripDate = new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(trip.date_start));

    if (status === "confirmed") {
      await resend.emails.send({
        from: "Sama <onboarding@resend.dev>",
        to: booking.email,
        replyTo: "sama.com.ph@gmail.com",
        subject: `You're confirmed for ${trip.title}!`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Great news! Your booking request for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been approved by the organizer.</p>
          ${trip.messenger_gc_link ? `
          <p>Join the group chat for trip updates and coordination:<br>
          <a href="${trip.messenger_gc_link}">${escapeHtml(trip.messenger_gc_link)}</a></p>
          <p>This is where the organizer will share meetup details, reminders, and important updates.</p>
          ` : ""}
          <p>They will be in touch with trip details closer to the date. You can view your booking at <a href="https://sama.ph/profile">sama.ph/profile</a>.</p>
          <p>— The Sama Team</p>
        `,
      });
    } else if (status === "rejected") {
      await resend.emails.send({
        from: "Sama <onboarding@resend.dev>",
        to: booking.email,
        replyTo: "sama.com.ph@gmail.com",
        subject: `Update on your booking request for ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Unfortunately your booking request for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} was not approved by the organizer.</p>
          <p>If you have questions, please contact <a href="mailto:sama.com.ph@gmail.com">sama.com.ph@gmail.com</a>.</p>
          <p>— The Sama Team</p>
        `,
      });
    }
  } catch {
    // Email failure is non-fatal
  }

  revalidatePath("/organizer/dashboard");
  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  revalidatePath("/profile");
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
    .select("id, trip_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };

  const { data: trip } = await admin
    .from("trips")
    .select("id, organizer_id")
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

  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  revalidatePath("/profile");
  return { success: true };
}

export async function cancelBooking(bookingId: number) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, trip_id, slots, status, email, full_name, user_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };
  if (booking.user_id !== user.id) return { error: "You don't have permission to cancel this booking." };
  if (booking.status === "cancelled") return { error: "This booking is already cancelled." };

  const { error } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", bookingId);

  if (error) return { error: error.message };

  const { data: trip } = await admin
    .from("trips")
    .select("id, title, date_start, total_slots, remaining_slots, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (trip) {
    await admin
      .from("trips")
      .update({
        remaining_slots: Math.min(trip.total_slots, trip.remaining_slots + booking.slots),
      })
      .eq("id", trip.id);

    try {
      const tripDate = new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(trip.date_start));

      if (trip.organizer_id) {
        const { data: organizer } = await admin
          .from("organizers")
          .select("email")
          .eq("id", trip.organizer_id)
          .maybeSingle();

        if (organizer?.email) {
          await resend.emails.send({
            from: "Sama <onboarding@resend.dev>",
            to: organizer.email,
            replyTo: "sama.com.ph@gmail.com",
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
        from: "Sama <onboarding@resend.dev>",
        to: booking.email,
        replyTo: "sama.com.ph@gmail.com",
        subject: `Booking cancelled: ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>Your booking for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been cancelled. If you are eligible for a refund, please email <a href="mailto:sama.com.ph@gmail.com">sama.com.ph@gmail.com</a> with your booking details and we'll process it for you.</p>
          <p>— The Sama Team</p>
        `,
      });
    } catch {
      // Email failure is non-fatal
    }
  }

  revalidatePath("/profile");
  return { success: true };
}
