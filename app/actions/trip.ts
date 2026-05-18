"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export async function createTrip(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/trips/new");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") {
    redirect("/organizer/apply");
  }

  const title = (formData.get("title") as string)?.trim();
  const activity_type = formData.get("activity_type") as string;
  const destination = (formData.get("destination") as string)?.trim();
  const difficulty = formData.get("difficulty") as string;
  const date_start = formData.get("date_start") as string;
  const price = parseFloat(formData.get("price") as string);
  const total_slots = parseInt(formData.get("total_slots") as string, 10);
  const meeting_point = (formData.get("meeting_point") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const includes = (formData.get("includes") as string)?.trim();
  const what_to_bring = (formData.get("what_to_bring") as string)?.trim();

  if (
    !title ||
    !activity_type ||
    !destination ||
    !difficulty ||
    !date_start ||
    isNaN(price) ||
    isNaN(total_slots) ||
    !meeting_point ||
    !description
  ) {
    return { error: "Please fill in all required fields." };
  }

  const slug = `${slugify(title)}-${Date.now().toString(36)}`;

  const { error } = await supabase.from("trips").insert({
    title,
    slug,
    activity_type,
    destination,
    difficulty,
    date_start,
    price,
    total_slots,
    remaining_slots: total_slots,
    meeting_point,
    description,
    includes: includes || null,
    what_to_bring: what_to_bring || null,
    status: "active",
    organizer_id: organizer.id,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/organizer/dashboard");
}
