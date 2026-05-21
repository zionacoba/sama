"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend } from "@/lib/resend";

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

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("id, title, date_start, remaining_slots, organizer_id, difficulty, status")
    .eq("slug", input.tripSlug)
    .maybeSingle();

  if (!trip) return { error: "Trip not found." };

  if (trip.status !== "active" || new Date(trip.date_start) < new Date()) {
    return { error: "This trip is no longer available for booking." };
  }
  if (!input.waiverAgreed || !input.platformWaiverAgreed) {
    return { error: "You must agree to both waivers before booking." };
  }

  // Prevent duplicate bookings for the same trip
  const { data: existingBooking } = await admin
    .from("bookings")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .not("status", "eq", "rejected")
    .maybeSingle();

  if (existingBooking) {
    return { error: "You already have a booking for this trip." };
  }

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
      total_amount: input.totalAmount,
      status: bookingStatus,
      notes: input.notes,
      payment_option: input.paymentOption,
      amount_due: input.amountDue,
      participants: input.participants,
      emergency_contact_name: input.emergencyContactName,
      emergency_contact_phone: input.emergencyContactPhone,
      waiver_agreed: input.waiverAgreed,
      platform_waiver_agreed: input.platformWaiverAgreed,
      medical_notes: input.medicalNotes,
      meeting_point: input.meetingPoint,
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
            ? `<li><strong>Participants:</strong> ${input.participants.map((n) => n || "(unnamed)").join(", ")}</li>`
            : "";

        const medicalRow = input.medicalNotes
          ? `<li><strong>Medical / allergies:</strong> ${input.medicalNotes}</li>`
          : "";

        await resend.emails.send({
          from: "Sama <onboarding@resend.dev>",
          to: organizerEmail,
          replyTo: "sama.com.ph@gmail.com",
          subject: `New booking for ${trip.title}`,
          html: `
            <p>Hi,</p>
            <p><strong>${input.fullName}</strong> (${input.email}) just booked <strong>${input.slots} slot${input.slots !== 1 ? "s" : ""}</strong> on your trip:</p>
            <ul>
              <li><strong>Trip:</strong> ${trip.title}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              ${participantsRow}
              <li><strong>Emergency contact:</strong> ${input.emergencyContactName} — ${input.emergencyContactPhone}</li>
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
          ? `Booking confirmed — ${trip.title}`
          : `Booking request received — ${trip.title}`,
        html: autoApprove
          ? `
            <p>Hi ${input.fullName},</p>
            <p>Your booking is confirmed! Here's a summary:</p>
            <ul>
              <li><strong>Trip:</strong> ${trip.title}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              <li><strong>Slots booked:</strong> ${input.slots}</li>
            </ul>
            <p>See you on the trail! You can view your booking at <a href="https://sama.ph/profile">sama.ph/dashboard/bookings</a>.</p>
            <p>— The Sama Team</p>
          `
          : `
            <p>Hi ${input.fullName},</p>
            <p>We've received your booking request. Here's a summary:</p>
            <ul>
              <li><strong>Trip:</strong> ${trip.title}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              <li><strong>Slots booked:</strong> ${input.slots}</li>
            </ul>
            <p>The organizer will review your request and be in touch to confirm. You can track your booking at <a href="https://sama.ph/profile">sama.ph/dashboard/bookings</a>.</p>
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
    .select("id, trip_id, slots, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };

  const { data: trip } = await supabase
    .from("trips")
    .select("id, organizer_id, remaining_slots, total_slots")
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

  revalidatePath("/organizer/dashboard");
  revalidatePath("/organizer/trips/[slug]/bookings", "page");
  revalidatePath("/profile");
  return { success: true };
}
