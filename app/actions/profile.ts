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
    .select("id, photo_url, cover_image_url")
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
  const { data: userBookings } = await admin
    .from("bookings")
    .select("id")
    .eq("user_id", user.id);

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

  if (userBookings && userBookings.length > 0) {
    const bookingIds = userBookings.map((b) => b.id);
    await admin
      .from("booking_participants")
      .update({
        full_name: "Deleted User",
        emergency_contact_name: null,
        emergency_contact_phone: null,
        medical_notes: null,
      })
      .in("booking_id", bookingIds);
  }

  await admin.from("waitlist").delete().eq("user_id", user.id);

  await admin
    .from("reviews")
    .update({ full_name: "Deleted User" })
    .eq("user_id", user.id);

  // Remove organizer row if present; delete uploaded photos from Storage first.
  if (organizerRow) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const org = organizerRow as { id: string; photo_url: string | null; cover_image_url: string | null };

    // Delete organizer profile photo and cover image.
    const orgPhotoPaths: string[] = [];
    for (const url of [org.photo_url, org.cover_image_url]) {
      if (url && supabaseUrl) {
        const prefix = `${supabaseUrl}/storage/v1/object/public/organizer-photos/`;
        if (url.startsWith(prefix)) {
          orgPhotoPaths.push(url.slice(prefix.length));
        }
      }
    }
    if (orgPhotoPaths.length > 0) {
      await admin.storage.from("organizer-photos").remove(orgPhotoPaths);
    }

    // Delete trip photos for all trips owned by this organizer.
    const { data: tripRows } = await admin
      .from("trips")
      .select("photos")
      .eq("organizer_id", org.id);

    if (tripRows && tripRows.length > 0 && supabaseUrl) {
      const tripPhotoPrefix = `${supabaseUrl}/storage/v1/object/public/trip-photos/`;
      const tripPhotoPaths: string[] = [];
      for (const trip of tripRows) {
        const photos = (trip.photos as string[] | null) ?? [];
        for (const url of photos) {
          if (url.startsWith(tripPhotoPrefix)) {
            tripPhotoPaths.push(url.slice(tripPhotoPrefix.length));
          }
        }
      }
      if (tripPhotoPaths.length > 0) {
        await admin.storage.from("trip-photos").remove(tripPhotoPaths);
      }
    }

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

export async function saveEmergencyContact(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const name = (formData.get("emergency_contact_name") as string)?.trim();
  const phone = (formData.get("emergency_contact_phone") as string)?.trim();

  if (!name || !phone) return { error: "Both name and phone are required." };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .upsert({
      id: user.id,
      emergency_contact_name: name,
      emergency_contact_phone: phone,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };
  return { success: true };
}

export async function saveUserProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const first_name = (formData.get("first_name") as string)?.trim();
  const last_name = (formData.get("last_name") as string)?.trim();
  const nickname = (formData.get("nickname") as string)?.trim() || null;
  const pronouns = (formData.get("pronouns") as string)?.trim() || null;
  const address = (formData.get("address") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const facebook_url = (formData.get("facebook_url") as string)?.trim() || null;

  if (!first_name) return { error: "First name is required." };
  if (!last_name) return { error: "Last name is required." };

  if (facebook_url) {
    if (
      !facebook_url.startsWith("https://facebook.com/") &&
      !facebook_url.startsWith("https://www.facebook.com/") &&
      !facebook_url.startsWith("https://m.facebook.com/")
    ) {
      return { error: "Please enter a valid Facebook profile URL starting with https://facebook.com/" };
    }
  }

  const full_name = `${first_name} ${last_name}`;
  const { error: authError } = await supabase.auth.updateUser({ data: { full_name, first_name, last_name } });
  if (authError) return { error: authError.message };

  const admin = createSupabaseAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({
      id: user.id,
      first_name,
      last_name,
      nickname,
      pronouns,
      address,
      phone,
      facebook_url,
      updated_at: new Date().toISOString(),
    });

  if (profileError) return { error: profileError.message };

  revalidatePath("/profile");
  return { success: true };
}
