"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function submitReview(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const tripId = parseInt(formData.get("trip_id") as string, 10);
  const tripSlug = formData.get("trip_slug") as string;
  const rating = parseInt(formData.get("rating") as string, 10);
  const body = (formData.get("body") as string)?.trim();
  const full_name = (formData.get("full_name") as string)?.trim();

  if (!full_name || !body || isNaN(rating) || rating < 1 || rating > 5) {
    return { error: "Please fill in all fields and select a rating." };
  }

  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("user_id", user.id)
    .eq("trip_id", tripId)
    .maybeSingle();

  if (existing) {
    return { error: "You've already reviewed this trip." };
  }

  const { error } = await supabase.from("reviews").insert({
    trip_id: tripId,
    user_id: user.id,
    full_name,
    rating,
    body,
  });

  if (error) return { error: error.message };

  redirect(`/trips/${tripSlug}`);
}
