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
};

export async function createBooking(input: CreateBookingInput) {
  console.log("[createBooking] called for tripId:", input.tripId, "by:", input.email);
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error: insertError } = await supabase.from("bookings").insert({
    trip_id: input.tripId,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    slots: input.slots,
    total_amount: input.totalAmount,
    status: "pending",
    notes: input.notes,
  });

  if (insertError) {
    console.log("[createBooking] insert error:", insertError.message);
    return { error: insertError.message };
  }

  console.log("[createBooking] booking inserted successfully");

  // Send notification email to organizer (best-effort — don't fail the booking if email fails)
  try {
    const { data: trip } = await supabase
      .from("trips")
      .select("title, date_start, remaining_slots, organizer_id")
      .eq("id", input.tripId)
      .maybeSingle();

    console.log("[createBooking] trip fetched:", trip?.title, "organizer_id:", trip?.organizer_id);

    if (trip?.organizer_id) {
      const { data: organizer } = await supabase
        .from("organizers")
        .select("user_id")
        .eq("id", trip.organizer_id)
        .maybeSingle();

      console.log("[createBooking] organizer user_id:", organizer?.user_id);

      if (organizer?.user_id) {
        const admin = createSupabaseAdminClient();
        const { data: { user: organizerUser } } = await admin.auth.admin.getUserById(organizer.user_id);

        const organizerEmail = organizerUser?.email;
        console.log("[createBooking] organizer email:", organizerEmail);

        if (organizerEmail) {
          const tripDate = new Intl.DateTimeFormat("en-PH", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(new Date(trip.date_start));

          console.log("[createBooking] sending email to:", organizerEmail);
          const { data: emailData, error: emailError } = await resend.emails.send({
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
              <p>Log in to your <a href="https://sama.ph/organizer/dashboard">organizer dashboard</a> to confirm or reject this booking.</p>
              <p>— The Sama Team</p>
            `,
          });
          console.log("[createBooking] email result:", emailData, emailError);
        }
      }
    }
  } catch (err) {
    console.log("[createBooking] email error (non-fatal):", err);
  }

  revalidatePath(`/trips/${input.tripId}`);
  return { success: true };
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
