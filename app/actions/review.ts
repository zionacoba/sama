"use server";

import { createSupabaseServerClient } from "@/lib/supabase-server";
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


  // If a booking_id is provided, verify it's confirmed and belongs to this user
  if (bookingId) {
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, status, user_id, email")
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return { error: "Booking not found." };
    if (booking.status !== "confirmed") return { error: "You can only review confirmed bookings." };
    if (booking.user_id !== user.id && booking.email !== user.email) {
      return { error: "You don't have permission to review this booking." };
    }
  }

  // Check for duplicate review on this trip by this user
  let dupQuery = supabase
    .from("reviews")
    .select("id")
    .eq("user_id", user.id)
    .eq("trip_id", tripId);

  if (bookingId) dupQuery = dupQuery.eq("booking_id", bookingId);

  const { data: existing } = await dupQuery.maybeSingle();
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

  // Only redirect when submitted from the trip page (no booking_id)
  if (!bookingId) redirect(`/trips/${tripSlug}`);

  return { success: true };
}
