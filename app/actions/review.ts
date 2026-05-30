"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { redirect } from "next/navigation";

type ReviewState = { success: true } | { error: string } | null;

export async function submitReview(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const tripId = parseInt(formData.get("trip_id") as string, 10);
  const tripSlug = formData.get("trip_slug") as string;
  const rating = parseInt(formData.get("rating") as string, 10);
  const body = (formData.get("body") as string)?.trim();
  const bookingIdRaw = formData.get("booking_id") as string | null;
  const bookingId = bookingIdRaw ? parseInt(bookingIdRaw, 10) : null;

  if (!body || isNaN(rating) || rating < 1 || rating > 5) {
    return { error: "Please fill in all fields and select a rating." };
  }

  if (!bookingId || isNaN(bookingId)) {
    return { error: "You must have a confirmed booking to leave a review." };
  }

  // Gate reviews to trips whose date has passed.
  const admin = createSupabaseAdminClient();
  const { data: tripForDate } = await admin
    .from("trips")
    .select("date_start, title, slug, organizer_id")
    .eq("id", tripId)
    .maybeSingle();

  if (!tripForDate) return { error: "Trip not found." };
  if (new Date(tripForDate.date_start) > new Date()) {
    return { error: "You can only leave a review after the trip has taken place." };
  }

  // If a booking_id is provided, verify it's confirmed and belongs to this user
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, user_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return { error: "Booking not found." };
    if (booking.status !== "confirmed") return { error: "You can only review confirmed bookings." };
    if (booking.user_id !== user.id) {
      return { error: "You don't have permission to review this booking." };
    }
  }

  // Check for duplicate review on this trip by this user
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("user_id", user.id)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (existing) return { error: "You've already reviewed this trip." };

  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim() || null;

  const { error } = await supabase.from("reviews").insert({
    trip_id: tripId,
    user_id: user.id,
    full_name: fullName,
    rating,
    body,
    ...(bookingId ? { booking_id: bookingId } : {}),
  });

  if (error) return { error: error.message };

  // Notify the organizer of the new review.
  try {
    if (tripForDate.organizer_id) {
      const { data: organizer } = await admin
        .from("organizers")
        .select("email, display_name, full_name")
        .eq("id", tripForDate.organizer_id)
        .maybeSingle();

      if (organizer?.email) {
        const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
        const excerpt = body.length > 200 ? body.slice(0, 197) + "…" : body;
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: organizer.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `New ${rating}-star review for ${tripForDate.title}`,
          html: `
            <p>Hi ${escapeHtml(organizer.display_name ?? organizer.full_name)},</p>
            <p>${escapeHtml(fullName ?? "A participant")} left a <strong>${rating}-star review</strong> ${stars} for <strong>${escapeHtml(tripForDate.title)}</strong>:</p>
            <blockquote style="border-left:3px solid #ccc;margin:0;padding:0 1em;color:#555;">${escapeHtml(excerpt)}</blockquote>
            <p><a href="${siteUrl}/trips/${escapeHtml(tripForDate.slug)}">View the full review on the trip page →</a></p>
            <p>— The Sama Team</p>
          `,
        });
      }
    }
  } catch (emailErr) {
    console.error("[email] failed to notify organizer of new review", emailErr);
  }

  // Only redirect when submitted from the trip page (no booking_id)
  if (!bookingId) redirect(`/trips/${tripSlug}`);

  return { success: true };
}
