"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { sendAdminAlert } from "@/lib/admin-alert";
import { escapeHtml } from "@/lib/escape-html";
import { safeExternalUrl } from "@/lib/safe-url";
import { resolveGuardCount, resolveGuardRows } from "@/lib/payout-details-guard";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

export async function applyToBeOrganizer(
  _prevState: { error: string } | { success: true } | null,
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/apply");

  const displayName = (formData.get("display_name") as string)?.trim();
  const fullName = (formData.get("full_name") as string)?.trim();
  const bio = (formData.get("bio") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();
  const personalFacebookUrl = (formData.get("personal_facebook_url") as string)?.trim();
  const organizerFacebookUrl = (formData.get("organizer_facebook_url") as string)?.trim();
  const instagram = (formData.get("instagram") as string)?.trim() || null;
  const tripsPerMonth = (formData.get("trips_per_month") as string)?.trim();
  const operatingLocations = (formData.get("operating_locations") as string)?.trim();
  const activityTypes = formData.getAll("activity_types") as string[];
  const yearsOfExperience = Number((formData.get("years_of_experience") as string)?.trim());
  const emergencyCertified = formData.get("emergency_certified") === "on";
  const termsAgreed = formData.get("terms_agreed") === "on";
  const accuracyConfirmed = formData.get("accuracy_confirmed") === "on";

  if (!displayName || !fullName || !bio || !phone || !personalFacebookUrl || !organizerFacebookUrl || !tripsPerMonth || !operatingLocations) {
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

  const validPersonalFacebookUrl = safeExternalUrl(personalFacebookUrl);
  const validOrganizerFacebookUrl = safeExternalUrl(organizerFacebookUrl);
  const validInstagram = instagram ? safeExternalUrl(instagram) : null;
  if (!validPersonalFacebookUrl || !validOrganizerFacebookUrl || (instagram && !validInstagram)) {
    return { error: "Please enter a valid Facebook or Instagram link starting with http:// or https://" };
  }

  const admin = createSupabaseAdminClient();

  const { data: takenName, error: takenNameError } = await admin
    .from("organizers")
    .select("id")
    .ilike("display_name", displayName)
    .in("status", ["approved", "pending"])
    .maybeSingle();

  if (takenNameError) {
    console.error("[organizer] display name check failed", takenNameError);
    Sentry.captureException(takenNameError, {
      extra: { context: "apply-to-be-organizer-display-name-check-failed", userId: user.id },
    });
    return { error: "Something went wrong. Please try again." };
  }

  if (takenName) {
    return { error: "This display name is already taken. Please choose a different one." };
  }

  // Check if this user already has an organizer row.
  const { data: existingOrganizer, error: existingOrganizerError } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingOrganizerError) {
    console.error("[organizer] duplicate application check failed", existingOrganizerError);
    Sentry.captureException(existingOrganizerError, {
      extra: { context: "apply-to-be-organizer-duplicate-check-failed", userId: user.id },
    });
    return { error: "Something went wrong. Please try again." };
  }

  if (existingOrganizer) {
    if (existingOrganizer.status !== "rejected") {
      return { error: "You have already submitted an application." };
    }

    // Rejected — allow reapplication by updating the existing row and resetting to pending.
    const { data: reapplyData, error: reapplyError } = await admin
      .from("organizers")
      .update({
        display_name: displayName,
        full_name: fullName,
        bio,
        phone,
        facebook_url: validPersonalFacebookUrl,
        social_links: { facebook: validOrganizerFacebookUrl, instagram: validInstagram },
        activity_types: activityTypes,
        years_experience: yearsOfExperience,
        emergency_certified: emergencyCertified,
        trips_per_month: tripsPerMonth,
        operating_locations: operatingLocations,
        status: "pending",
      })
      .eq("id", existingOrganizer.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (reapplyError) {
      console.error("[organizer] reapply update failed", reapplyError);
      Sentry.captureException(reapplyError, {
        extra: { context: "apply-to-be-organizer-reapply-update-failed", organizerId: existingOrganizer.id, userId: user.id },
      });
      if (reapplyError.code === "23505" && reapplyError.message?.includes("organizers_display_name_unique")) {
        return { error: "This display name is already taken. Please choose a different one." };
      }
      return { error: "Something went wrong. Please try again." };
    }

    if (!reapplyData) {
      console.error("[organizer] reapply update affected no rows", { organizerId: existingOrganizer.id, userId: user.id });
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
          <p>Thanks for reapplying to be a Sama organizer. We'll review your application and get back to you within a few days.</p>
          <p>In the meantime, feel free to browse trips at <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}">${process.env.NEXT_PUBLIC_SITE_URL?.replace("https://", "") || "sama.com.ph"}</a>.</p>
          <p>Sama</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to send organizer reapplication confirmation", err);
      Sentry.captureException(err, {
        extra: { context: "apply-to-be-organizer-reapply-email-failed", userId: user.id },
      });
    }

    await sendAdminAlert(
      `Organizer reapplication: ${escapeHtml(displayName)}`,
      `
          <p>A rejected organizer has reapplied.</p>
          <ul>
            <li><strong>Name:</strong> ${escapeHtml(fullName)}</li>
            <li><strong>Display name:</strong> ${escapeHtml(displayName)}</li>
            <li><strong>Email:</strong> ${escapeHtml(user.email!)}</li>
          </ul>
          <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/admin">Review it in the admin dashboard</a></p>
        `,
    );

    return { success: true };
  }

  let insertError;
  try {
    const { error } = await supabase.from("organizers").insert({
      user_id: user.id,
      email: user.email,
      display_name: displayName,
      full_name: fullName,
      bio,
      phone,
      facebook_url: validPersonalFacebookUrl,
      social_links: { facebook: validOrganizerFacebookUrl, instagram: validInstagram },
      activity_types: activityTypes,
      years_experience: yearsOfExperience,
      emergency_certified: emergencyCertified,
      trips_per_month: tripsPerMonth,
      operating_locations: operatingLocations,
    });
    insertError = error;
  } catch (err) {
    console.error("[organizer] insert failed", err);
    Sentry.captureException(err, {
      extra: { context: "apply-to-be-organizer-insert-failed", userId: user.id },
    });
    return { error: "Something went wrong. Please try again." };
  }

  if (insertError) {
    console.error("[organizer] insert error", insertError);
    Sentry.captureException(insertError, {
      extra: { context: "apply-to-be-organizer-insert-error", userId: user.id },
    });
    if (insertError.code === "23505") {
      if (insertError.message?.includes("organizers_display_name_unique")) {
        return { error: "This display name is already taken. Please choose a different one." };
      }
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
        <p>Thanks for applying to be a Sama organizer. We'll review your application and get back to you within a few days.</p>
        <p>In the meantime, feel free to browse trips at <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}">${process.env.NEXT_PUBLIC_SITE_URL?.replace("https://", "") || "sama.com.ph"}</a>.</p>
        <p>Sama</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send organizer application confirmation", err);
    Sentry.captureException(err, {
      extra: { context: "apply-to-be-organizer-confirmation-email-failed", userId: user.id },
    });
  }

  await sendAdminAlert(
    `New organizer application: ${escapeHtml(displayName)}`,
    `
        <p>A new organizer application has been submitted.</p>
        <ul>
          <li><strong>Name:</strong> ${escapeHtml(fullName)}</li>
          <li><strong>Display name:</strong> ${escapeHtml(displayName)}</li>
          <li><strong>Email:</strong> ${escapeHtml(user.email!)}</li>
        </ul>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/admin">Review it in the admin dashboard</a></p>
      `,
  );

  return { success: true };
}

export async function updateOrganizerProfile(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/profile");

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[update-organizer-profile] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "update-organizer-profile-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer || organizer.status !== "approved") redirect("/apply");

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

  const validatedSocialLinks = {
    facebook: social_links.facebook ? safeExternalUrl(social_links.facebook) : null,
    instagram: social_links.instagram ? safeExternalUrl(social_links.instagram) : null,
    tiktok: social_links.tiktok ? safeExternalUrl(social_links.tiktok) : null,
  };
  if (
    (social_links.facebook && !validatedSocialLinks.facebook) ||
    (social_links.instagram && !validatedSocialLinks.instagram) ||
    (social_links.tiktok && !validatedSocialLinks.tiktok)
  ) {
    return { error: "Social links must be valid links starting with http:// or https://" };
  }

  const admin = createSupabaseAdminClient();

  const { data: takenName, error: takenNameError } = await admin
    .from("organizers")
    .select("id")
    .ilike("display_name", display_name)
    .in("status", ["approved", "pending"])
    .neq("id", organizer.id)
    .maybeSingle();

  if (takenNameError) {
    Sentry.captureException(takenNameError, {
      extra: { context: "update-organizer-profile-display-name-check-failed", organizerId: organizer.id },
    });
    return { error: "Something went wrong updating your profile. Please try again." };
  }

  if (takenName) {
    return { error: "This display name is already taken. Please choose a different one." };
  }

  // Prevent removing or blanking payout details while a payout is pending remittance.
  const wouldHaveNoPayout =
    !payout_method ||
    (payout_method === "gcash" && !gcash_number) ||
    (payout_method === "bank_transfer" && !bank_account_number);

  if (wouldHaveNoPayout) {
    const { count: pendingPayoutCount, error: pendingPayoutError } = await (admin
      .from("payouts" as "trips")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", organizer.id)
      .eq("status", "pending") as unknown as Promise<{ count: number | null; error: unknown }>);

    const pendingPayoutGate = resolveGuardCount(pendingPayoutCount, pendingPayoutError);
    if (pendingPayoutGate.kind === "fetch-error") {
      Sentry.captureException(
        pendingPayoutError ?? new Error("update-organizer-profile-pending-payout-count-failed with no error object (anomalous null result)"),
        { extra: { context: "update-organizer-profile-pending-payout-count-failed", organizerId: organizer.id } },
      );
      return { error: "Something went wrong updating your profile. Please try again." };
    }

    if (pendingPayoutGate.count > 0) {
      return { error: "You have a pending payout. Please keep your payout details active until it has been sent." };
    }
  }

  // Prevent removing payout details while confirmed bookings on upcoming trips exist.
  if (!payout_method) {
    const now = new Date().toISOString();
    const { data: upcomingTrips, error: upcomingTripsError } = await admin
      .from("trips")
      .select("id")
      .eq("organizer_id", organizer.id)
      .eq("status", "active")
      .gt("date_start", now);

    const upcomingTripsGate = resolveGuardRows(upcomingTrips, upcomingTripsError);
    if (upcomingTripsGate.kind === "fetch-error") {
      Sentry.captureException(
        upcomingTripsError ?? new Error("update-organizer-profile-upcoming-trips-fetch-failed with no error object (anomalous null result)"),
        { extra: { context: "update-organizer-profile-upcoming-trips-fetch-failed", organizerId: organizer.id } },
      );
      return { error: "Something went wrong updating your profile. Please try again." };
    }

    const tripIds = upcomingTripsGate.rows.map((t) => t.id);
    if (tripIds.length > 0) {
      const { count, error: confirmedBookingsError } = await admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("trip_id", tripIds)
        .eq("status", "confirmed");

      const confirmedBookingsGate = resolveGuardCount(count, confirmedBookingsError);
      if (confirmedBookingsGate.kind === "fetch-error") {
        Sentry.captureException(
          confirmedBookingsError ?? new Error("update-organizer-profile-confirmed-bookings-count-failed with no error object (anomalous null result)"),
          { extra: { context: "update-organizer-profile-confirmed-bookings-count-failed", organizerId: organizer.id } },
        );
        return { error: "Something went wrong updating your profile. Please try again." };
      }

      if (confirmedBookingsGate.count > 0) {
        return { error: "You cannot remove your payout details while you have active confirmed bookings." };
      }
    }
  }

  const { error } = await admin
    .from("organizers")
    .update({
      display_name, full_name, phone, bio, photo_url, cover_image_url,
      social_links: validatedSocialLinks,
      payout_method, gcash_number, gcash_name,
      bank_name, bank_account_number, bank_account_name,
    })
    .eq("id", organizer.id);

  if (error) {
    if (error.code === "23505" && error.message?.includes("organizers_display_name_unique")) {
      return { error: "This display name is already taken. Please choose a different one." };
    }
    return { error: "Something went wrong updating your profile. Please try again." };
  }

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

  const { error } = await supabase.from("organizers").update({ is_founding_partner: value }).eq("id", id);
  if (error) {
    console.error("[toggle-founding-partner] update failed:", error);
    Sentry.captureException(error, {
      extra: { context: "toggle-founding-partner-update-failed", organizerId: id },
    });
  }

  revalidatePath("/admin");
  revalidatePath(`/organizers/${id}`);
  redirect("/admin?tab=organizers&_r=" + Date.now());
}
