"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ProfileState = { success: true } | { error: string } | null;

export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const birthdate = formData.get("birthdate") as string | null;
  const emergencyContactName = formData.get("emergency_contact_name") as string | null;
  const emergencyContactPhone = formData.get("emergency_contact_phone") as string | null;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .upsert({
      id: user.id,
      birthdate: birthdate || null,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_phone: emergencyContactPhone || null,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };
  revalidatePath("/profile");
  return { success: true };
}

export async function saveUserProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const full_name = (formData.get("full_name") as string)?.trim();

  if (!full_name) return { error: "Full name is required." };

  const { error: authError } = await supabase.auth.updateUser({ data: { full_name } });
  if (authError) return { error: authError.message };

  revalidatePath("/profile");
  return { success: true };
}
