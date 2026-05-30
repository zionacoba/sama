"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? (() => { throw new Error("ADMIN_EMAIL environment variable is not set"); })();

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
  const facebookUrl = (formData.get("facebook_url") as string)?.trim();
  const pastTripsEvidence = (formData.get("past_trips_evidence") as string)?.trim();
  const activityTypes = formData.getAll("activity_types") as string[];
  const yearsOfExperience = Number((formData.get("years_of_experience") as string)?.trim());
  const emergencyCertified = formData.get("emergency_certified") === "on";
  const termsAgreed = formData.get("terms_agreed") === "on";
  const accuracyConfirmed = formData.get("accuracy_confirmed") === "on";

  if (!displayName || !fullName || !bio || !phone || !facebookUrl || !pastTripsEvidence) {
    return { error: "All required fields must be filled in." };
  }
  if (!termsAgreed || !accuracyConfirmed) {
    return { error: "You must agree to the terms and confirm the accuracy of your application." };
  }
  if (activityTypes.length === 0) {
    return { error: "Please select at least one activity type." };
  }
  if (!yearsOfExperience || yearsOfExperience < 1) {
    return { error: "Please enter your years of experience." };
  }

  const { error } = await supabase.from("organizers").insert({
    user_id: user.id,
    email: user.email,
    display_name: displayName,
    full_name: fullName,
    bio,
    phone,
    facebook_url: facebookUrl,
    past_trips_evidence: pastTripsEvidence,
    activity_types: activityTypes,
    years_of_experience: yearsOfExperience,
    emergency_certified: emergencyCertified,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You have already submitted an application." };
    }
    return { error: "Something went wrong. Please try again." };
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: user.email!,
      replyTo: REPLY_TO_ADDRESS,
      subject: "We received your Sama organizer application!",
      html: `
        <p>Hi ${escapeHtml(fullName)},</p>
        <p>Thanks for applying to be a Sama organizer. We'll review your application and get back to you within 24 hours.</p>
        <p>In the meantime, feel free to browse trips at <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}">${process.env.NEXT_PUBLIC_SITE_URL?.replace("https://", "") || "sama.com.ph"}</a>.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send organizer application confirmation", err);
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAIL,
      replyTo: REPLY_TO_ADDRESS,
      subject: `New organizer application: ${escapeHtml(displayName)}`,
      html: `
        <p>A new organizer application has been submitted.</p>
        <ul>
          <li><strong>Name:</strong> ${escapeHtml(fullName)}</li>
          <li><strong>Display name:</strong> ${escapeHtml(displayName)}</li>
          <li><strong>Email:</strong> ${escapeHtml(user.email!)}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/admin">Review it in the admin dashboard</a></p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to notify admin of new organizer application", err);
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

  const payout_method = (formData.get("payout_method") as string)?.trim() || null;
  const gcash_number = payout_method === "gcash" ? (formData.get("gcash_number") as string)?.trim() || null : null;
  const gcash_name = payout_method === "gcash" ? (formData.get("gcash_name") as string)?.trim() || null : null;
  const bank_name = payout_method === "bank_transfer" ? (formData.get("bank_name") as string)?.trim() || null : null;
  const bank_account_number = payout_method === "bank_transfer" ? (formData.get("bank_account_number") as string)?.trim() || null : null;
  const bank_account_name = payout_method === "bank_transfer" ? (formData.get("bank_account_name") as string)?.trim() || null : null;

  if (!display_name || !full_name || !phone || !bio) {
    return { error: "Please fill in all required fields." };
  }
  if (bio.length > 1000) {
    return { error: "Bio must be 1000 characters or fewer." };
  }

  const urlFields = [social_links.facebook, social_links.instagram, social_links.tiktok];
  if (urlFields.some((u) => u && !u.startsWith("https://"))) {
    return { error: "Social links must start with https://" };
  }

  const admin = createSupabaseAdminClient();

  // Prevent removing payout details while confirmed bookings on upcoming trips exist.
  if (!payout_method) {
    const now = new Date().toISOString();
    const { data: upcomingTrips } = await admin
      .from("trips")
      .select("id")
      .eq("organizer_id", organizer.id)
      .eq("status", "active")
      .gt("date_start", now);

    const tripIds = (upcomingTrips ?? []).map((t) => t.id);
    if (tripIds.length > 0) {
      const { count } = await admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("trip_id", tripIds)
        .eq("status", "confirmed");

      if ((count ?? 0) > 0) {
        return { error: "You cannot remove your payout details while you have active confirmed bookings." };
      }
    }
  }

  const { error } = await admin
    .from("organizers")
    .update({
      display_name, full_name, phone, bio, photo_url, cover_image_url, social_links,
      payout_method, gcash_number, gcash_name,
      bank_name, bank_account_number, bank_account_name,
    })
    .eq("id", organizer.id);

  if (error) return { error: error.message };

  revalidatePath("/trips");
  revalidatePath(`/organizers/${organizer.id}`);
  redirect("/organizer/dashboard");
}

export async function toggleFoundingPartner(formData: FormData) {
  const id = formData.get("id") as string;
  const value = formData.get("is_founding_partner") === "true";

  if (!id) return;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user?.email !== ADMIN_EMAIL) return;

  await supabase.from("organizers").update({ is_founding_partner: value }).eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/organizers/${id}`);
  redirect("/admin?tab=organizers&_r=" + Date.now());
}
