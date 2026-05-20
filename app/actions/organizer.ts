"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const ADMIN_EMAIL = "acobapaulzion@gmail.com";

export async function applyToBeOrganizer(
  _prevState: { error: string } | { success: true } | null,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/apply");

  const displayName = (formData.get("display_name") as string)?.trim();
  const fullName = (formData.get("full_name") as string)?.trim();
  const bio = (formData.get("bio") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();

  if (!displayName || !fullName || !bio || !phone) {
    return { error: "All fields are required." };
  }

  const { error } = await supabase.from("organizers").insert({
    user_id: user.id,
    email: user.email,
    display_name: displayName,
    full_name: fullName,
    bio,
    phone,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You have already submitted an application." };
    }
    return { error: error.message };
  }

  return { success: true };
}

export async function updateOrganizerProfile(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/profile");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/organizer/apply");

  const display_name = (formData.get("display_name") as string)?.trim();
  const full_name = (formData.get("full_name") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const bio = (formData.get("bio") as string)?.trim();
  const photo_url = (formData.get("photo_url") as string)?.trim() || null;
  const cover_image_url = (formData.get("cover_image_url") as string)?.trim() || null;
  const social_links = {
    facebook: (formData.get("social_facebook") as string)?.trim() || null,
    instagram: (formData.get("social_instagram") as string)?.trim() || null,
    tiktok: (formData.get("social_tiktok") as string)?.trim() || null,
  };

  if (!display_name || !full_name || !phone || !bio) {
    return { error: "Please fill in all required fields." };
  }

  const { error } = await supabase
    .from("organizers")
    .update({ display_name, full_name, phone, bio, photo_url, cover_image_url, social_links })
    .eq("id", organizer.id);

  if (error) return { error: error.message };

  redirect("/organizer/dashboard");
}

export async function updateOrganizerStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const status = formData.get("status") as string;

  if (!id || !["approved", "rejected"].includes(status)) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email !== ADMIN_EMAIL) return;

  await supabase.from("organizers").update({ status }).eq("id", id);

  redirect("/admin");
}
