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

  const is_template = formData.get("is_template") === "true";
  const template_id = (formData.get("template_id") as string) || null;
  const title = (formData.get("title") as string)?.trim();
  const activity_type = formData.get("activity_type") as string;
  const destination = (formData.get("destination") as string)?.trim();
  const difficulty = formData.get("difficulty") as string;
  const duration = (formData.get("duration") as string) || null;
  const date_start = is_template ? "2099-12-31" : (formData.get("date_start") as string);
  const price = is_template ? 0 : parseFloat(formData.get("price") as string);
  const total_slots = is_template ? 0 : parseInt(formData.get("total_slots") as string, 10);
  type MeetingPoint = { location: string; time: string };
  let meeting_points: MeetingPoint[] = [];
  if (!is_template) {
    const mpJson = formData.get("meeting_points") as string | null;
    try { meeting_points = mpJson ? JSON.parse(mpJson) : []; } catch { return { error: "Invalid meeting points data." }; }
  }
  const description = (formData.get("description") as string)?.trim();
  const includes = (formData.get("includes") as string)?.trim();
  const what_to_bring = (formData.get("what_to_bring") as string)?.trim();
  const photosJson = formData.get("photos_json") as string | null;
  const photos: string[] = photosJson ? JSON.parse(photosJson) : [];
  const payment_type = (formData.get("payment_type") as string) || "full";
  const min_downpayment_raw = formData.get("min_downpayment") as string;
  const min_downpayment = payment_type === "downpayment" && min_downpayment_raw
    ? parseFloat(min_downpayment_raw)
    : null;
  const cancellation_policy = (formData.get("cancellation_policy") as string) || "flexible";
  const cancellation_policy_custom = cancellation_policy === "custom"
    ? ((formData.get("cancellation_policy_custom") as string)?.trim() || null)
    : null;

  if (!title || !activity_type || !destination || !difficulty || !description) {
    return { error: "Please fill in all required fields." };
  }

  if (!is_template && (!date_start || isNaN(price) || isNaN(total_slots))) {
    return { error: "Please fill in all required fields." };
  }

  if (!is_template && meeting_points.length === 0) {
    return { error: "Please add at least one meeting point." };
  }

  if (!is_template && payment_type === "downpayment" && (!min_downpayment || isNaN(min_downpayment))) {
    return { error: "Please enter a minimum downpayment amount." };
  }

  if (!is_template && cancellation_policy === "custom" && !cancellation_policy_custom) {
    return { error: "Please enter your custom cancellation policy." };
  }

  const slug = `${slugify(title)}-${Date.now().toString(36)}`;

  const { error } = await supabase.from("trips").insert({
    title,
    slug,
    activity_type,
    destination,
    difficulty,
    duration: duration || null,
    date_start,
    price,
    total_slots,
    remaining_slots: is_template ? 0 : total_slots,
    meeting_points: is_template ? [] : meeting_points,
    description,
    includes: includes || null,
    what_to_bring: what_to_bring || null,
    photos,
    status: "active",
    organizer_id: organizer.id,
    payment_type,
    min_downpayment,
    cancellation_policy,
    cancellation_policy_custom,
    is_template,
    template_id: template_id || null,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/organizer/dashboard");
}

export async function updateTrip(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/organizer/apply");

  const rawTripId = formData.get("trip_id");
  const tripId = parseInt(rawTripId as string, 10);

  const { data: existing, error: fetchError } = await supabase
    .from("trips")
    .select("id, organizer_id, total_slots, remaining_slots")
    .eq("id", tripId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: "Trip not found or you don't have permission to edit it." };
  }

  if (existing.organizer_id?.toString().trim() !== organizer.id?.toString().trim()) {
    return { error: "Trip not found or you don't have permission to edit it." };
  }

  const is_template = formData.get("is_template") === "true";
  const template_id = (formData.get("template_id") as string) || null;
  const title = (formData.get("title") as string)?.trim();
  const activity_type = formData.get("activity_type") as string;
  const destination = (formData.get("destination") as string)?.trim();
  const difficulty = formData.get("difficulty") as string;
  const duration = (formData.get("duration") as string) || null;
  const date_start = is_template ? "2099-12-31" : (formData.get("date_start") as string);
  const price = is_template ? 0 : parseFloat(formData.get("price") as string);
  const total_slots = is_template ? 0 : parseInt(formData.get("total_slots") as string, 10);
  type MeetingPoint = { location: string; time: string };
  let meeting_points: MeetingPoint[] = [];
  if (!is_template) {
    const mpJson = formData.get("meeting_points") as string | null;
    try { meeting_points = mpJson ? JSON.parse(mpJson) : []; } catch { return { error: "Invalid meeting points data." }; }
  }
  const description = (formData.get("description") as string)?.trim();
  const includes = (formData.get("includes") as string)?.trim();
  const what_to_bring = (formData.get("what_to_bring") as string)?.trim();
  const photosJson = formData.get("photos_json") as string | null;
  const photos: string[] = photosJson ? JSON.parse(photosJson) : [];
  const payment_type = (formData.get("payment_type") as string) || "full";
  const min_downpayment_raw = formData.get("min_downpayment") as string;
  const min_downpayment = payment_type === "downpayment" && min_downpayment_raw
    ? parseFloat(min_downpayment_raw)
    : null;
  const cancellation_policy = (formData.get("cancellation_policy") as string) || "flexible";
  const cancellation_policy_custom = cancellation_policy === "custom"
    ? ((formData.get("cancellation_policy_custom") as string)?.trim() || null)
    : null;

  if (!title || !activity_type || !destination || !difficulty || !description) {
    return { error: "Please fill in all required fields." };
  }

  if (!is_template && (!date_start || isNaN(price) || isNaN(total_slots))) {
    return { error: "Please fill in all required fields." };
  }

  if (!is_template && meeting_points.length === 0) {
    return { error: "Please add at least one meeting point." };
  }

  if (!is_template && payment_type === "downpayment" && (!min_downpayment || isNaN(min_downpayment))) {
    return { error: "Please enter a minimum downpayment amount." };
  }

  if (!is_template && cancellation_policy === "custom" && !cancellation_policy_custom) {
    return { error: "Please enter your custom cancellation policy." };
  }

  const slotDiff = is_template ? 0 : total_slots - existing.total_slots;
  const remaining_slots = is_template
    ? existing.remaining_slots
    : Math.max(0, existing.remaining_slots + slotDiff);

  const { error } = await supabase
    .from("trips")
    .update({
      title,
      activity_type,
      destination,
      difficulty,
      duration: duration || null,
      date_start,
      price,
      total_slots,
      remaining_slots,
      meeting_points: is_template ? [] : meeting_points,
      description,
      includes: includes || null,
      what_to_bring: what_to_bring || null,
      photos,
      payment_type,
      min_downpayment,
      cancellation_policy,
      cancellation_policy_custom,
      is_template,
      template_id: template_id || null,
    })
    .eq("id", tripId);

  if (error) return { error: error.message };

  redirect("/organizer/dashboard");
}
