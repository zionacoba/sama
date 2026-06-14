"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

type JoinWaitlistInput = {
  tripId: number;
  tripSlug: string;
  fullName: string;
  email: string;
  phone: string;
  slots: number;
};

export async function joinWaitlist(
  input: JoinWaitlistInput,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to join the waitlist." };

  const admin = createSupabaseAdminClient();

  const { data: existingBooking } = await admin
    .from("bookings")
    .select("id")
    .eq("trip_id", input.tripId)
    .eq("user_id", user.id)
    .in("status", ["confirmed", "pending", "payment_pending"])
    .maybeSingle();

  if (existingBooking) {
    return { error: "You already have a booking for this trip." };
  }

  const { data: tripForSlotCheck } = await admin
    .from("trips")
    .select("remaining_slots")
    .eq("id", input.tripId)
    .maybeSingle();

  if (!tripForSlotCheck) return { error: "Trip not found." };
  if ((tripForSlotCheck.remaining_slots ?? 0) > 0) {
    return { error: "This trip has available slots — you can book directly instead of joining the waitlist." };
  }

  const { error } = await admin.from("waitlist").insert({
    trip_id: input.tripId,
    user_id: user.id,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone || null,
    slots: input.slots,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You're already on the waitlist for this trip." };
    }
    return { error: error.message };
  }

  // Notify the organizer of the new waitlist entry.
  try {
    const { data: trip } = await admin
      .from("trips")
      .select("title, date_start, organizer_id")
      .eq("id", input.tripId)
      .maybeSingle();

    if (trip?.organizer_id) {
      const { data: organizer } = await admin
        .from("organizers")
        .select("email")
        .eq("id", trip.organizer_id)
        .maybeSingle();

      if (organizer?.email) {
        const tripDate = new Intl.DateTimeFormat("en-PH", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Manila",
        }).format(new Date(trip.date_start));

        await resend.emails.send({
          from: FROM_ADDRESS,
          to: organizer.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `New waitlist entry for ${trip.title}`,
          html: `
            <p>Hi,</p>
            <p><strong>${escapeHtml(input.fullName)}</strong> has joined the waitlist for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate}. They'll be notified automatically if you add more slots.</p>
            <p>Sama</p>
          `,
        });
      }
    }
  } catch (err) {
    console.error("[email] failed to notify organizer of waitlist entry", err);
  }

  revalidatePath(`/trips/${input.tripSlug}`);
  return { success: true as const };
}

export async function notifyWaitlistEntry(formData: FormData): Promise<void> {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") return;

  const admin = createSupabaseAdminClient();

  const { data: entry } = await admin
    .from("waitlist")
    .select("id, full_name, email, notified, trips(title, slug, organizer_id, date_start)")
    .eq("id", id)
    .maybeSingle();

  if (!entry) return;
  if (entry.notified) return;

  type TripRef = { title: string; slug: string; organizer_id: string; date_start: string };
  const trip = entry.trips as unknown as TripRef | null;
  if (!trip || String(trip.organizer_id) !== String(organizer.id)) return;

  const tripDate = new Intl.DateTimeFormat("en-PH", {
    month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: entry.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: `A slot just opened for ${trip.title}`,
      html: `
        <p>Hi ${escapeHtml(entry.full_name)},</p>
        <p>A slot just opened for <strong>${escapeHtml(trip.title)}</strong> on ${tripDate}. Spots are limited and it's first come, first served, so book soon. Book now at <a href="${SITE_URL}/trips/${trip.slug}">${SITE_URL.replace("https://", "")}/trips/${trip.slug}</a>.</p>
        <p>Sama</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to notify waitlist entry of open slot", err);
  }

  // Stamp notified_at so this manual notify counts toward the 12-hour debounce
  // used by the automatic paths and isn't immediately re-sent by them.
  await admin
    .from("waitlist")
    .update({ notified: true, notified_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath(`/organizer/trips/${trip.slug}/bookings`);
}

export async function removeWaitlistEntry(formData: FormData): Promise<void> {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createSupabaseAdminClient();

  const { data: entry } = await admin
    .from("waitlist")
    .select("id, user_id, trips(slug)")
    .eq("id", id)
    .maybeSingle();

  if (!entry || entry.user_id !== user.id) return;

  await admin.from("waitlist").delete().eq("id", id);

  type TripRef = { slug: string };
  const trip = entry.trips as unknown as TripRef | null;
  if (trip?.slug) revalidatePath(`/trips/${trip.slug}`);
  revalidatePath("/profile");
}
