"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type ProfileState = { success: true } | { error: string } | null;

export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const birthdate = formData.get("birthdate") as string | null;

  const { error } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      birthdate: birthdate || null,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };
  revalidatePath("/dashboard/profile");
  return { success: true };
}
