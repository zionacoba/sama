"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function deleteAccount(): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();

  // Block deletion if the user has upcoming confirmed bookings.
  const { data: confirmedBookings } = await admin
    .from("bookings")
    .select("id, trip:trips!bookings_trip_id_fkey(date_start)")
    .eq("user_id", user.id)
    .eq("status", "confirmed");

  const now = new Date().toISOString();
  const upcoming = (confirmedBookings ?? []).filter((b) => {
    const t = b.trip as unknown as { date_start: string } | null;
    return t && t.date_start > now;
  });

  if (upcoming.length > 0) {
    return { error: "You have upcoming confirmed bookings. Please cancel them before deleting your account." };
  }

  // Block deletion if the user is an organizer with active trips.
  const { data: organizerRow } = await admin
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerRow) {
    const { count: activeTripsCount } = await admin
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizerRow.id)
      .eq("status", "active");

    if ((activeTripsCount ?? 0) > 0) {
      return { error: "Please unpublish all your trips before deleting your account." };
    }
  }

  // Anonymize all booking records — retained for legal/financial purposes.
  await admin
    .from("bookings")
    .update({
      full_name: "Deleted User",
      email: "deleted@sama.com.ph",
      phone: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      medical_notes: null,
    })
    .eq("user_id", user.id);

  // Remove organizer row if present.
  if (organizerRow) {
    await admin.from("organizers").delete().eq("id", organizerRow.id);
  }

  // Remove the profile row.
  await admin.from("profiles").delete().eq("id", user.id);

  // Sign the user out before removing the auth record so the cookie is cleared.
  await supabase.auth.signOut();

  // Hard-delete the auth user (service-role required).
  await admin.auth.admin.deleteUser(user.id);

  return { success: true };
}

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
  const phone = (formData.get("phone") as string)?.trim() || null;

  if (!full_name) return { error: "Full name is required." };

  const { error: authError } = await supabase.auth.updateUser({ data: { full_name } });
  if (authError) return { error: authError.message };

  const admin = createSupabaseAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: user.id, phone, updated_at: new Date().toISOString() });

  if (profileError) return { error: profileError.message };

  revalidatePath("/profile");
  return { success: true };
}
