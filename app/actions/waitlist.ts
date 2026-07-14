"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/booking-status";
import { organizerOwns } from "@/lib/authz";

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
    .in("status", [...ACTIVE_BOOKING_STATUSES])
    .maybeSingle();

  if (existingBooking) {
    return { error: "You already have a booking for this trip." };
  }

  const { data: tripForSlotCheck, error: tripFetchError } = await admin
    .from("trips")
    .select("remaining_slots")
    .eq("id", input.tripId)
    .maybeSingle();

  if (tripFetchError) {
    console.error("[join-waitlist] trip slot-check fetch failed:", tripFetchError);
    Sentry.captureException(tripFetchError, {
      extra: { context: "join-waitlist-trip-fetch-failed", tripId: input.tripId, userId: user.id },
    });
  }
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
    const { data: trip, error: tripError } = await admin
      .from("trips")
      .select("title, date_start, organizer_id")
      .eq("id", input.tripId)
      .maybeSingle();

    if (tripError) {
      console.error("[join-waitlist] trip fetch failed:", tripError);
      Sentry.captureException(tripError, {
        extra: { context: "join-waitlist-notify-trip-fetch-failed", tripId: input.tripId },
      });
    }
    if (trip?.organizer_id) {
      const { data: organizer, error: organizerError } = await admin
        .from("organizers")
        .select("email")
        .eq("id", trip.organizer_id)
        .maybeSingle();

      if (organizerError) {
        console.error("[join-waitlist] organizer fetch failed:", organizerError);
        Sentry.captureException(organizerError, {
          extra: { context: "join-waitlist-organizer-fetch-failed", organizerId: trip.organizer_id, tripId: input.tripId },
        });
      }
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
    Sentry.captureException(err, {
      extra: { context: "join-waitlist-email-failed", tripId: input.tripId, userId: user.id },
    });
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

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[notify-waitlist-entry] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "notify-waitlist-entry-organizer-fetch-failed", userId: user.id, entryId: id },
    });
  }
  if (!organizer || organizer.status !== "approved") return;

  const admin = createSupabaseAdminClient();

  const { data: entry, error: entryError } = await admin
    .from("waitlist")
    .select("id, full_name, email, notified, trips(title, slug, organizer_id, date_start)")
    .eq("id", id)
    .maybeSingle();

  if (entryError) {
    console.error("[notify-waitlist-entry] waitlist entry fetch failed:", entryError);
    Sentry.captureException(entryError, {
      extra: { context: "notify-waitlist-entry-entry-fetch-failed", entryId: id, organizerId: organizer.id },
    });
  }
  if (!entry) return;
  if (entry.notified) return;

  type TripRef = { title: string; slug: string; organizer_id: string; date_start: string };
  const trip = entry.trips as unknown as TripRef | null;
  if (!trip || !organizerOwns(trip.organizer_id, organizer.id)) return;

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
    Sentry.captureException(err, {
      extra: { context: "notify-waitlist-entry-email-failed", entryId: id, tripSlug: trip.slug },
    });
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

  const { data: entry, error: entryError } = await admin
    .from("waitlist")
    .select("id, user_id, trips(slug)")
    .eq("id", id)
    .maybeSingle();

  if (entryError) {
    console.error("[remove-waitlist-entry] entry fetch failed:", entryError);
    Sentry.captureException(entryError, {
      extra: { context: "remove-waitlist-entry-entry-fetch-failed", entryId: id, userId: user.id },
    });
  }
  if (!entry || entry.user_id !== user.id) return;

  const { error: deleteError } = await admin.from("waitlist").delete().eq("id", id);
  if (deleteError) {
    console.error("[remove-waitlist-entry] delete failed:", deleteError);
    Sentry.captureException(deleteError, {
      extra: { context: "remove-waitlist-entry-delete-failed", entryId: id, userId: user.id },
    });
  }

  type TripRef = { slug: string };
  const trip = entry.trips as unknown as TripRef | null;
  if (trip?.slug) revalidatePath(`/trips/${trip.slug}`);
  revalidatePath("/profile");
}
