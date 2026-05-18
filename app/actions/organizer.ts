"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const ADMIN_EMAIL = "acobapaulzion@gmail.com";

export async function applyToBeOrganizer(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/apply");

  const fullName = (formData.get("full_name") as string)?.trim();
  const bio = (formData.get("bio") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();

  if (!fullName || !bio || !phone) {
    return { error: "All fields are required." };
  }

  const { error } = await supabase.from("organizers").insert({
    user_id: user.id,
    email: user.email,
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

  redirect("/organizer/apply");
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

  revalidatePath("/admin");
}
