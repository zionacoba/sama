"use server";

import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { sendAdminAlert } from "@/lib/admin-alert";
import { escapeHtml } from "@/lib/escape-html";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { organizerOwns } from "@/lib/authz";

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
  const { data: tripForDate, error: tripFetchError } = await admin
    .from("trips")
    .select("date_start, title, slug, organizer_id")
    .eq("id", tripId)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[submit-review] trip fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "submit-review-trip-fetch-failed", tripId, userId: user.id },
    });
  }
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

  // If a booking_id is provided, verify it represents a paid attendee of a
  // trip that ran, and that it belongs to this user. Eligibility follows
  // "paid for a trip that happened" (the same predicate as payout
  // eligibility), so an organizer marking an attendee as no_show cannot
  // strip their ability to review.
  let bookingFullName: string | null = null;
  if (bookingId) {
    const { data: booking, error: bookingFetchError } = await supabase
      .from("bookings")
      .select("id, status, user_id, trip_id, payment_gateway_status, total_amount, full_name")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingFetchError) {
      console.error("[submit-review] booking fetch failed:", bookingFetchError);
      Sentry.captureException(bookingFetchError, {
        extra: { context: "submit-review-booking-fetch-failed", bookingId, tripId, userId: user.id },
      });
    }
    if (!booking) return { error: "Booking not found." };
    bookingFullName = (booking.full_name as string | undefined)?.trim() || null;
    const isPaidAttendee =
      (booking.status === "confirmed" || booking.status === "no_show") &&
      (booking.payment_gateway_status === "paid" || booking.total_amount === 0);
    if (!isPaidAttendee) return { error: "You can only review trips you paid for and attended." };
    if (booking.user_id !== user.id) {
      return { error: "You don't have permission to review this booking." };
    }
    if (booking.trip_id !== tripId) {
      return { error: "This booking is not for the trip you're reviewing." };
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

  const metadataFullName =
    (user.user_metadata?.full_name as string | undefined)?.trim() || null;
  // Prefer the name captured at booking time (signed on the waiver) as the
  // most reliable source, fall back to auth metadata, then to a safe
  // non-null default so the NOT NULL full_name column never rejects the insert.
  const fullName = bookingFullName ?? metadataFullName ?? "Verified joiner";

  const { error } = await supabase.from("reviews").insert({
    trip_id: tripId,
    user_id: user.id,
    organizer_id: tripForDate.organizer_id,
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
      const { data: organizer, error: organizerFetchError } = await admin
        .from("organizers")
        .select("email, display_name, full_name")
        .eq("id", tripForDate.organizer_id)
        .maybeSingle();

      if (organizerFetchError) {
        console.error("[submit-review] organizer fetch failed:", organizerFetchError);
        Sentry.captureException(organizerFetchError, {
          extra: { context: "submit-review-organizer-fetch-failed", organizerId: tripForDate.organizer_id, tripId },
        });
      }
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
            <p>Sama</p>
          `,
        });
      }
    }
  } catch (emailErr) {
    console.error("[email] failed to notify organizer of new review", emailErr);
    Sentry.captureException(emailErr, {
      extra: { context: "submit-review-email-failed", tripId, userId: user.id, rating },
    });
  }

  // Alert admin so the review gets noticed quickly.
  {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    await sendAdminAlert(
      `[Admin] New review pending approval: ${tripForDate.title}`,
      `
          <p><strong>${escapeHtml(fullName ?? "A participant")}</strong> submitted a <strong>${rating}-star review</strong> ${stars} for <strong>${escapeHtml(tripForDate.title)}</strong>:</p>
          <blockquote style="border-left:3px solid #ccc;margin:0;padding:0 1em;color:#555;">${escapeHtml(body.length > 400 ? body.slice(0, 397) + "…" : body)}</blockquote>
          <p>Approve it from the <a href="${siteUrl}/admin?tab=reviews">admin Reviews tab</a>.</p>
          <p>Sama System</p>
        `,
    );
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

  const { data: organizer, error: organizerFetchError } = await admin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .maybeSingle();

  if (organizerFetchError) {
    console.error("[respond-to-review] organizer fetch failed:", organizerFetchError);
    Sentry.captureException(organizerFetchError, {
      extra: { context: "respond-to-review-organizer-fetch-failed", userId: user.id, reviewId },
    });
  }
  if (!organizer) return { error: "Not an approved organizer." };

  const { data: review, error: reviewFetchError } = await admin
    .from("reviews")
    .select("id, trip_id, organizer_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (reviewFetchError) {
    console.error("[respond-to-review] review fetch failed:", reviewFetchError);
    Sentry.captureException(reviewFetchError, {
      extra: { context: "respond-to-review-review-fetch-failed", reviewId, organizerId: organizer.id },
    });
  }
  if (!review) return { error: "Review not found." };
  if (!organizerOwns(review.organizer_id, organizer.id)) {
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

  const { data: trip, error: tripFetchError } = await admin
    .from("trips")
    .select("slug")
    .eq("id", review.trip_id)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[respond-to-review] trip slug fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "respond-to-review-trip-fetch-failed", tripId: review.trip_id, reviewId },
    });
  }
  if (trip?.slug) {
    revalidatePath(`/trips/${trip.slug}`);
  }
  revalidatePath(`/organizers/${organizer.id}`);
  revalidatePath("/organizer/dashboard");

  return { success: true };
}
