"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend } from "@/lib/resend";

type CreateBookingInput = {
  tripId: number;
  fullName: string;
  email: string;
  phone: string;
  slots: number;
  totalAmount: number;
  notes: string | null;
  paymentOption: "full" | "downpayment";
  amountDue: number;
};

export async function createBooking(input: CreateBookingInput) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Fetch trip first to determine auto-approve eligibility
  const { data: trip } = await supabase
    .from("trips")
    .select("title, date_start, remaining_slots, organizer_id, difficulty")
    .eq("id", input.tripId)
    .maybeSingle();

  const autoApprove = trip?.difficulty === "Beginner" || trip?.difficulty === "Intermediate";
  const bookingStatus = autoApprove ? "confirmed" : "pending";

  const { error: insertError } = await supabase.from("bookings").insert({
    trip_id: input.tripId,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    slots: input.slots,
    total_amount: input.totalAmount,
    status: bookingStatus,
    notes: input.notes,
    payment_option: input.paymentOption,
    amount_due: input.amountDue,
  });

  if (insertError) return { error: insertError.message };

  // Send emails (best-effort — don't fail the booking if email fails)
  try {
    if (trip?.organizer_id) {
      // Use admin client to bypass RLS — the booker cannot read other organizers' rows
      const admin = createSupabaseAdminClient();
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

        await resend.emails.send({
          from: "Sama <onboarding@resend.dev>",
          to: organizerEmail,
          subject: `New booking for ${trip.title}`,
          html: `
            <p>Hi,</p>
            <p><strong>${input.fullName}</strong> (${input.email}) just booked <strong>${input.slots} slot${input.slots !== 1 ? "s" : ""}</strong> on your trip:</p>
            <ul>
              <li><strong>Trip:</strong> ${trip.title}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              <li><strong>Remaining slots after this booking:</strong> ${Math.max(0, trip.remaining_slots - input.slots)}</li>
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

    // Send confirmation email to booker
    if (trip) {
      const tripDate = new Intl.DateTimeFormat("en-PH", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(trip.date_start));

      // TODO: change to input.email once sama.com.ph is verified in Resend
      await resend.emails.send({
        from: "Sama <onboarding@resend.dev>",
        to: "acobapaulzion@gmail.com",
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
            <p>See you on the trail! You can view your booking at <a href="https://sama.ph/dashboard/bookings">sama.ph/dashboard/bookings</a>.</p>
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
            <p>The organizer will review your request and be in touch to confirm. You can track your booking at <a href="https://sama.ph/dashboard/bookings">sama.ph/dashboard/bookings</a>.</p>
            <p>— The Sama Team</p>
          `,
      });
    }
  } catch {
    // Email failure is non-fatal
  }

  revalidatePath(`/trips/${input.tripId}`);
  return { success: true, status: bookingStatus };
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

  // Verify booking belongs to one of this organizer's trips
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, trip_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { error: "Booking not found." };

  const { data: trip } = await supabase
    .from("trips")
    .select("id, organizer_id")
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

  revalidatePath("/organizer/dashboard");
  return { success: true };
}
