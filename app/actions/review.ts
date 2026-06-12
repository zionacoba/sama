"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { revalidatePath } from "next/cache";
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
  if (tripForDate.date_start > new Date().toISOString().split("T")[0]) {
    return { error: "You can only leave a review after the trip has taken place." };
  }

  const { data: organizer } = await admin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", tripForDate.organizer_id)
    .maybeSingle();
  if (organizer) return { error: "Organizers cannot review their own trips." };

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
    approved: false,
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
            <p>Hi ${escapeHtml(organizer.display_name ?? organizer.full_name ?? "Organizer")},</p>
            <p>${escapeHtml(fullName ?? "A participant")} left a <strong>${rating}-star review</strong> ${stars} for <strong>${escapeHtml(tripForDate.title)}</strong>:</p>
            <blockquote style="border-left:3px solid #ccc;margin:0;padding:0 1em;color:#555;">${escapeHtml(excerpt)}</blockquote>
            <p>The review is pending admin approval and will go live once approved.</p>
            <p>— Sama</p>
          `,
        });
      }
    }
  } catch (emailErr) {
    console.error("[email] failed to notify organizer of new review", emailErr);
  }

  // Alert admin so the review gets noticed quickly.
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
  if (ADMIN_EMAIL) {
    try {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
      const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: ADMIN_EMAIL,
        replyTo: REPLY_TO_ADDRESS,
        subject: `[Admin] New review pending approval — ${tripForDate.title}`,
        html: `
          <p><strong>${escapeHtml(fullName ?? "A participant")}</strong> submitted a <strong>${rating}-star review</strong> ${stars} for <strong>${escapeHtml(tripForDate.title)}</strong>:</p>
          <blockquote style="border-left:3px solid #ccc;margin:0;padding:0 1em;color:#555;">${escapeHtml(body.length > 400 ? body.slice(0, 397) + "…" : body)}</blockquote>
          <p>Approve it from the <a href="${siteUrl}/admin?tab=reviews">admin Reviews tab</a>.</p>
          <p>— Sama System</p>
        `,
      });
    } catch (adminEmailErr) {
      console.error("[email] failed to send admin review alert", adminEmailErr);
    }
  }

  // Only redirect when submitted from the trip page (no booking_id)
  if (!bookingId) redirect(`/trips/${tripSlug}`);

  return { success: true };
}

export async function respondToReview(
  reviewId: number,
  response: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const trimmed = response.trim();
  if (!trimmed) return { error: "Response cannot be empty." };

  const admin = createSupabaseAdminClient();

  const { data: organizer } = await admin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (!organizer) return { error: "Not an approved organizer." };

  const { data: review } = await admin
    .from("reviews")
    .select("id, trip_id, organizer_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return { error: "Review not found." };
  if (String(review.organizer_id) !== String(organizer.id)) {
    return { error: "You can only respond to reviews on your own trips." };
  }

  const { error } = await admin
    .from("reviews")
    .update({
      organizer_response: trimmed,
      organizer_responded_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) return { error: error.message };

  const { data: trip } = await admin
    .from("trips")
    .select("slug")
    .eq("id", review.trip_id)
    .maybeSingle();

  if (trip?.slug) {
    revalidatePath(`/trips/${trip.slug}`);
  }
  revalidatePath(`/organizers/${organizer.id}`);
  revalidatePath("/organizer/dashboard");

  return { success: true };
}
