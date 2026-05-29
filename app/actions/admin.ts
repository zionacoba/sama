"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? (() => { throw new Error("ADMIN_EMAIL environment variable is not set"); })();

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) throw new Error("Unauthorized");
}

export async function approveOrganizer(id: string): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: organizer } = await admin
    .from("organizers")
    .select("email, full_name, display_name")
    .eq("id", id)
    .maybeSingle();

  if (!organizer) return;

  await admin.from("organizers").update({ status: "approved" }).eq("id", id);

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: organizer.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: "Your Sama organizer application has been approved!",
      html: `
        <p>Hi ${escapeHtml(organizer.full_name)},</p>
        <p>Great news — your application to become a Sama organizer has been <strong>approved</strong>!</p>
        <p>You can now log in to your organizer dashboard to create and publish trips:</p>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/organizer/dashboard">${(process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph").replace("https://", "")}/organizer/dashboard</a></p>
        <p>Welcome to the Sama community. We're excited to have you on board.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send organizer approval email", err);
  }

  revalidatePath("/admin");
  redirect("/admin?tab=organizers");
}

export async function rejectOrganizer(id: string): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: organizer } = await admin
    .from("organizers")
    .select("email, full_name")
    .eq("id", id)
    .maybeSingle();

  if (!organizer) return;

  await admin.from("organizers").update({ status: "rejected" }).eq("id", id);

  // Unpublish all active trips for this organizer.
  const { data: activeTrips } = await admin
    .from("trips")
    .select("id, title, slug")
    .eq("organizer_id", id)
    .eq("status", "active");

  const tripIds = (activeTrips ?? []).map((t) => t.id);

  if (tripIds.length > 0) {
    await admin
      .from("trips")
      .update({ status: "draft" })
      .in("id", tripIds);

    // Fetch and cancel all confirmed/pending bookings for affected trips.
    const { data: affectedBookings } = await admin
      .from("bookings")
      .select("id, email, full_name, trip_id, slots")
      .in("trip_id", tripIds)
      .in("status", ["confirmed", "pending"]);

    if ((affectedBookings ?? []).length > 0) {
      await admin
        .from("bookings")
        .update({ status: "cancelled" })
        .in("trip_id", tripIds)
        .in("status", ["confirmed", "pending"]);

      // Restore slots for each cancelled booking.
      for (const booking of affectedBookings ?? []) {
        const { error: slotErr } = await admin.rpc("restore_slot", {
          p_trip_id: booking.trip_id,
          p_slots_requested: booking.slots,
        });
        if (slotErr) {
          console.error(`[rejectOrganizer] restore_slot failed for booking ${booking.id}:`, slotErr.message);
        }
      }
    }

    const tripMap = new Map(
      (activeTrips ?? []).map((t) => [t.id, t]),
    );

    // Notify participants.
    for (const booking of affectedBookings ?? []) {
      const trip = tripMap.get(booking.trip_id);
      if (!trip) continue;
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: booking.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `Important update about your booking: ${trip.title}`,
          html: `
            <p>Hi ${escapeHtml(booking.full_name)},</p>
            <p>We're sorry to inform you that <strong>${escapeHtml(trip.title)}</strong> is no longer available on Sama.</p>
            <p>Your booking has been cancelled and you will receive a <strong>full refund</strong> to your original payment method within 3–5 business days.</p>
            <p>If you have any questions, please contact us at <a href="mailto:sama.com.ph@gmail.com">sama.com.ph@gmail.com</a>.</p>
            <p>We apologise for the inconvenience.</p>
            <p>— The Sama Team</p>
          `,
        });
      } catch (err) {
        console.error("[email] failed to send trip cancellation notice to participant", err);
      }
    }
  }

  // Notify the organizer their account has been rejected and trips unpublished.
  const tripsUnpublishedNote =
    tripIds.length > 0
      ? `<p>As a result, the following trip${tripIds.length > 1 ? "s have" : " has"} been unpublished: <strong>${(activeTrips ?? []).map((t) => escapeHtml(t.title)).join(", ")}</strong>. Participants with confirmed or pending bookings will be notified and issued full refunds.</p>`
      : "";

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: organizer.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: "Update on your Sama organizer application",
      html: `
        <p>Hi ${escapeHtml(organizer.full_name)},</p>
        <p>Thank you for your interest in becoming a Sama organizer.</p>
        <p>After reviewing your application, we're unable to approve it at this time.</p>
        ${tripsUnpublishedNote}
        <p>If you have questions or would like to reapply in the future, feel free to reach out to us.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send organizer rejection email", err);
  }

  revalidatePath("/admin");
  redirect("/admin?tab=organizers");
}

export async function updateCommissionRate(formData: FormData): Promise<void> {
  await requireAdmin();
  const organizerId = formData.get("organizerId") as string;
  const ratePercent = parseFloat(formData.get("ratePercent") as string);

  if (!organizerId || isNaN(ratePercent) || ratePercent < 1 || ratePercent > 20) {
    redirect("/admin?tab=organizers&commissionError=1");
  }

  const rate = Number((ratePercent / 100).toFixed(4));
  const admin = createSupabaseAdminClient();
  await admin.from("organizers").update({ commission_rate: rate }).eq("id", organizerId);

  revalidatePath("/admin");
  redirect("/admin?tab=organizers&_r=" + Date.now());
}
