"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export async function createTrip(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/trips/new");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") {
    redirect("/organizer/apply");
  }

  const is_template = formData.get("is_template") === "true";
  const template_id = (formData.get("template_id") as string) || null;
  const title = (formData.get("title") as string)?.trim();
  const activity_type = formData.get("activity_type") as string;
  const destination = (formData.get("destination") as string)?.trim();
  const difficulty = formData.get("difficulty") as string;
  const duration = (formData.get("duration") as string) || null;
  const date_start = is_template ? "2099-12-31" : (formData.get("date_start") as string);
  const date_end = is_template ? null : ((formData.get("date_end") as string) || null);
  const price = is_template ? 0 : parseFloat(formData.get("price") as string);
  const total_slots = is_template ? 0 : parseInt(formData.get("total_slots") as string, 10);
  type MeetingPoint = { location: string; time: string };
  let meeting_points: MeetingPoint[] = [];
  if (!is_template) {
    const mpJson = formData.get("meeting_points") as string | null;
    try { meeting_points = mpJson ? JSON.parse(mpJson) : []; } catch { return { error: "Invalid meeting points data." }; }
  }
  const description = (formData.get("description") as string)?.trim();
  const includes = (formData.get("includes") as string)?.trim();
  const what_to_bring = (formData.get("what_to_bring") as string)?.trim();
  const photosJson = formData.get("photos_json") as string | null;
  let photos: string[] = [];
  try { photos = photosJson ? JSON.parse(photosJson) : []; } catch { return { error: "Invalid photo data." }; }
  const payment_type = (formData.get("payment_type") as string) || "full";
  const min_downpayment_raw = formData.get("min_downpayment") as string;
  const min_downpayment = payment_type === "downpayment" && min_downpayment_raw
    ? parseFloat(min_downpayment_raw)
    : null;
  const downpayment_cutoff_days_raw = formData.get("downpayment_cutoff_days") as string;
  const _cutoffParsed = payment_type === "downpayment" && downpayment_cutoff_days_raw
    ? parseInt(downpayment_cutoff_days_raw, 10)
    : null;
  const downpayment_cutoff_days = _cutoffParsed !== null
    ? (isNaN(_cutoffParsed) || _cutoffParsed < 0 ? 10 : _cutoffParsed)
    : null;
  const cancellation_policy = (formData.get("cancellation_policy") as string) || "flexible";
  const cancellation_policy_custom = cancellation_policy === "custom"
    ? ((formData.get("cancellation_policy_custom") as string)?.trim() || null)
    : null;
  const waiver_text = (formData.get("waiver_text") as string)?.trim() || null;
  const messenger_gc_link = (formData.get("messenger_gc_link") as string)?.trim() || null;
  const status = (formData.get("status") as string) === "draft" ? "draft" : "active";
  const isDraft = status === "draft";

  if (!title) {
    return { error: "Please enter a trip title." };
  }

  if (!isDraft) {
    if (!activity_type || !destination || !difficulty || !description) {
      return { error: "Please fill in all required fields." };
    }
    if (!is_template && (!date_start || isNaN(price) || isNaN(total_slots))) {
      return { error: "Please fill in all required fields." };
    }
    if (!is_template && meeting_points.length === 0) {
      return { error: "Please add at least one meeting point." };
    }
    if (!is_template && payment_type === "downpayment" && (!min_downpayment || isNaN(min_downpayment))) {
      return { error: "Please enter a minimum downpayment amount." };
    }
    if (!is_template && cancellation_policy === "custom" && !cancellation_policy_custom) {
      return { error: "Please enter your custom cancellation policy." };
    }
    if (!is_template) {
      if (price < 0) return { error: "Price cannot be negative." };
      if (total_slots < 1) return { error: "Total slots must be at least 1." };
      if (payment_type === "downpayment" && min_downpayment !== null) {
        if (min_downpayment < 0) return { error: "Minimum downpayment cannot be negative." };
        if (price > 0 && min_downpayment >= price) return { error: "Minimum downpayment must be less than the full price." };
      }
      const today = new Date().toISOString().split("T")[0];
      if (date_start < today) return { error: "Trip date cannot be in the past." };
      if (date_end && date_end < date_start) return { error: "End date cannot be before start date." };
      if (duration && duration !== "Day tour" && !date_end) return { error: "Please enter an end date for overnight/multi-day trips." };
      const hasGcash = organizer.payout_method === "gcash" && !!organizer.gcash_number;
      const hasBank = organizer.payout_method === "bank_transfer" && !!organizer.bank_account_number;
      if (!hasGcash && !hasBank) {
        return { error: "Please add your payout details (GCash or bank account) in your organizer profile before publishing a trip. This is required to receive payments from bookings." };
      }
    }
  }

  // Normalise numerics for drafts so the DB insert never gets NaN.
  const safePrice = isNaN(price) ? 0 : price;
  const safeTotalSlots = isNaN(total_slots) ? 0 : total_slots;
  const safeDateStart = is_template ? "2099-12-31" : (date_start || "2099-12-31");
  // Free trips cannot have a downpayment requirement.
  const effectivePaymentType = safePrice === 0 ? "full" : payment_type;
  const effectiveMinDownpayment = safePrice === 0 ? null : min_downpayment;

  const slug = `${slugify(title)}-${Date.now().toString(36)}`;

  const { error } = await supabase.from("trips").insert({
    title,
    slug,
    activity_type: activity_type || null,
    destination: destination || null,
    difficulty: difficulty || null,
    duration: duration || null,
    date_start: safeDateStart,
    date_end: date_end || null,
    price: safePrice,
    total_slots: safeTotalSlots,
    remaining_slots: safeTotalSlots,
    meeting_points: is_template ? [] : meeting_points,
    description: description || null,
    includes: includes || null,
    what_to_bring: what_to_bring || null,
    photos,
    status,
    organizer_id: organizer.id,
    payment_type: effectivePaymentType,
    min_downpayment: effectiveMinDownpayment,
    downpayment_cutoff_days,
    cancellation_policy,
    cancellation_policy_custom,
    waiver_text,
    messenger_gc_link,
    is_template,
    template_id: template_id || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/trips");
  revalidatePath("/organizer/dashboard");
  redirect("/organizer/dashboard");
}

export async function updateTrip(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/organizer/apply");

  const rawTripId = formData.get("trip_id");
  const tripId = parseInt(rawTripId as string, 10);

  const { data: existing, error: fetchError } = await supabase
    .from("trips")
    .select("id, slug, status, title, organizer_id, total_slots, remaining_slots, date_start, date_end, price, meeting_points")
    .eq("id", tripId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: "Trip not found or you don't have permission to edit it." };
  }

  if (existing.organizer_id?.toString().trim() !== organizer.id?.toString().trim()) {
    return { error: "Trip not found or you don't have permission to edit it." };
  }

  const is_template = formData.get("is_template") === "true";
  const template_id = (formData.get("template_id") as string) || null;
  const title = (formData.get("title") as string)?.trim();
  const activity_type = formData.get("activity_type") as string;
  const destination = (formData.get("destination") as string)?.trim();
  const difficulty = formData.get("difficulty") as string;
  const duration = (formData.get("duration") as string) || null;
  const date_start = is_template ? "2099-12-31" : (formData.get("date_start") as string);
  const date_end = is_template ? null : ((formData.get("date_end") as string) || null);
  const price = is_template ? 0 : parseFloat(formData.get("price") as string);
  const total_slots = is_template ? 0 : parseInt(formData.get("total_slots") as string, 10);
  type MeetingPoint = { location: string; time: string };
  let meeting_points: MeetingPoint[] = [];
  if (!is_template) {
    const mpJson = formData.get("meeting_points") as string | null;
    try { meeting_points = mpJson ? JSON.parse(mpJson) : []; } catch { return { error: "Invalid meeting points data." }; }
  }
  const description = (formData.get("description") as string)?.trim();
  const includes = (formData.get("includes") as string)?.trim();
  const what_to_bring = (formData.get("what_to_bring") as string)?.trim();
  const photosJson = formData.get("photos_json") as string | null;
  let photos: string[] = [];
  try { photos = photosJson ? JSON.parse(photosJson) : []; } catch { return { error: "Invalid photo data." }; }
  const payment_type = (formData.get("payment_type") as string) || "full";
  const min_downpayment_raw = formData.get("min_downpayment") as string;
  const min_downpayment = payment_type === "downpayment" && min_downpayment_raw
    ? parseFloat(min_downpayment_raw)
    : null;
  const downpayment_cutoff_days_raw = formData.get("downpayment_cutoff_days") as string;
  const _cutoffParsed2 = payment_type === "downpayment" && downpayment_cutoff_days_raw
    ? parseInt(downpayment_cutoff_days_raw, 10)
    : null;
  const downpayment_cutoff_days = _cutoffParsed2 !== null
    ? (isNaN(_cutoffParsed2) || _cutoffParsed2 < 0 ? 10 : _cutoffParsed2)
    : null;
  const cancellation_policy = (formData.get("cancellation_policy") as string) || "flexible";
  const cancellation_policy_custom = cancellation_policy === "custom"
    ? ((formData.get("cancellation_policy_custom") as string)?.trim() || null)
    : null;
  const waiver_text = (formData.get("waiver_text") as string)?.trim() || null;
  const messenger_gc_link = (formData.get("messenger_gc_link") as string)?.trim() || null;
  const statusInput = formData.get("status") as string | null;
  const status = statusInput === "active" ? "active" : statusInput === "draft" ? "draft" : (existing.status ?? "active");
  const isDraft = status === "draft";

  if (!title) {
    return { error: "Please enter a trip title." };
  }

  if (!isDraft && !activity_type || !isDraft && !destination || !isDraft && !difficulty || !isDraft && !description) {
    return { error: "Please fill in all required fields." };
  }

  if (!isDraft && !is_template && (!date_start || isNaN(price) || isNaN(total_slots))) {
    return { error: "Please fill in all required fields." };
  }

  if (!isDraft && !is_template && meeting_points.length === 0) {
    return { error: "Please add at least one meeting point." };
  }

  if (!isDraft && !is_template && payment_type === "downpayment" && (!min_downpayment || isNaN(min_downpayment))) {
    return { error: "Please enter a minimum downpayment amount." };
  }

  if (!isDraft && !is_template && cancellation_policy === "custom" && !cancellation_policy_custom) {
    return { error: "Please enter your custom cancellation policy." };
  }

  if (!isDraft && !is_template) {
    if (price < 0) return { error: "Price cannot be negative." };
    if (total_slots < 1) return { error: "Total slots must be at least 1." };
    if (payment_type === "downpayment" && min_downpayment !== null) {
      if (min_downpayment < 0) return { error: "Minimum downpayment cannot be negative." };
      if (price > 0 && min_downpayment >= price) return { error: "Minimum downpayment must be less than the full price." };
    }
    const today = new Date().toISOString().split("T")[0];
    if (date_start < today) return { error: "Trip date cannot be in the past." };
    if (date_end && date_end < date_start) return { error: "End date cannot be before start date." };
    if (duration && duration !== "Day tour" && !date_end) return { error: "Please enter an end date for overnight/multi-day trips." };
    const hasGcash = organizer.payout_method === "gcash" && !!organizer.gcash_number;
    const hasBank = organizer.payout_method === "bank_transfer" && !!organizer.bank_account_number;
    if (!hasGcash && !hasBank) {
      return { error: "Please add your payout details (GCash or bank account) in your organizer profile before publishing a trip. This is required to receive payments from bookings." };
    }
  }

  if (!isDraft && !is_template && total_slots < existing.total_slots) {
    const admin = createSupabaseAdminClient();
    const { count } = await admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .in("status", ["confirmed", "pending"]);
    const confirmed = count ?? 0;
    if (total_slots < confirmed) {
      return { error: `Cannot reduce slots below current confirmed bookings (${confirmed} confirmed).` };
    }
  }

  // Block moving a trip with active bookings back to draft.
  if (status === "draft" && existing.status === "active") {
    const adminForDraftCheck = createSupabaseAdminClient();
    const { count: activeBookingCount } = await adminForDraftCheck
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId)
      .in("status", ["confirmed", "pending"]);
    if ((activeBookingCount ?? 0) > 0) {
      return { error: "This trip has confirmed bookings and cannot be moved to draft. Cancel the trip instead." };
    }
  }

  const slotDiff = (isDraft || is_template) ? 0 : total_slots - existing.total_slots;
  const remaining_slots = (isDraft || is_template)
    ? existing.remaining_slots
    : Math.max(0, existing.remaining_slots + slotDiff);

  // Normalise numerics for drafts.
  const safePrice = isDraft && isNaN(price) ? existing.price ?? 0 : price;
  const safeTotalSlots = isDraft && isNaN(total_slots) ? existing.total_slots ?? 0 : total_slots;
  const safeDateStart = is_template ? "2099-12-31" : (isDraft && !date_start ? existing.date_start ?? "2099-12-31" : date_start);
  // Free trips cannot have a downpayment requirement.
  const effectivePaymentType = safePrice === 0 ? "full" : payment_type;
  const effectiveMinDownpayment = safePrice === 0 ? null : min_downpayment;

  const { error } = await supabase
    .from("trips")
    .update({
      title,
      activity_type: activity_type || null,
      destination: destination || null,
      difficulty: difficulty || null,
      duration: duration || null,
      date_start: safeDateStart,
      date_end: date_end || null,
      price: safePrice,
      total_slots: safeTotalSlots,
      remaining_slots,
      meeting_points: is_template ? [] : meeting_points,
      description: description || null,
      includes: includes || null,
      what_to_bring: what_to_bring || null,
      photos,
      status,
      payment_type: effectivePaymentType,
      min_downpayment: effectiveMinDownpayment,
      downpayment_cutoff_days,
      cancellation_policy,
      cancellation_policy_custom,
      waiver_text,
      messenger_gc_link,
      is_template,
      template_id: template_id || null,
    })
    .eq("id", tripId);

  if (error) return { error: error.message };

  // Notify confirmed/pending bookers if key booking fields changed.
  if (!is_template) {
    const dateChanged = existing.date_start && (existing.date_start !== date_start || (existing.date_end ?? null) !== (date_end ?? null));
    const priceChanged = existing.price != null && existing.price !== price;
    const mpChanged = JSON.stringify(existing.meeting_points ?? []) !== JSON.stringify(meeting_points);

    if (dateChanged || priceChanged || mpChanged) {
      const admin = createSupabaseAdminClient();
      const { data: affectedBookings } = await admin
        .from("bookings")
        .select("id, full_name, email")
        .eq("trip_id", tripId)
        .in("status", ["confirmed", "pending"]);

      if (affectedBookings && affectedBookings.length > 0) {
        const fmt = (d: string) => new Intl.DateTimeFormat("en-PH", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        }).format(new Date(d));

        const changeLines: string[] = [];
        if (dateChanged) {
          const oldRange = existing.date_end ? `${fmt(existing.date_start)} – ${fmt(existing.date_end)}` : fmt(existing.date_start);
          const newRange = date_end ? `${fmt(date_start)} – ${fmt(date_end)}` : fmt(date_start);
          changeLines.push(`<li><strong>Date:</strong> ${oldRange} → ${newRange}</li>`);
        }
        if (priceChanged) {
          changeLines.push(`<li><strong>Price:</strong> ₱${Number(existing.price).toLocaleString()} → ₱${price.toLocaleString()}</li>`);
        }
        if (mpChanged) {
          changeLines.push(`<li><strong>Meeting point:</strong> updated — check the trip page for details</li>`);
        }

        const changeHtml = `<ul>${changeLines.join("")}</ul>`;

        for (const booking of affectedBookings) {
          try {
            await resend.emails.send({
              from: FROM_ADDRESS,
              to: booking.email,
              replyTo: REPLY_TO_ADDRESS,
              subject: `Important update to your booking: ${title}`,
              html: `
                <p>Hi ${escapeHtml(booking.full_name)},</p>
                <p>The organizer has made changes to <strong>${escapeHtml(title)}</strong> that may affect your booking:</p>
                ${changeHtml}
                <p>Please review the updated trip details here: <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://sama.ph"}/trips/${existing.slug}">sama.ph/trips/${existing.slug}</a></p>
                <p>If you have questions, contact <a href="mailto:sama.com.ph@gmail.com">sama.com.ph@gmail.com</a>.</p>
                <p>— The Sama Team</p>
              `,
            });
          } catch (err) {
            console.error("[email] failed to notify booking change", booking.id, err);
          }
        }
      }
    }
  }

  // Notify waitlist when the organizer increases slots on a previously full trip
  if (existing.remaining_slots === 0 && remaining_slots > 0) {
    const admin = createSupabaseAdminClient();
    const { data: waitlistEntries } = await admin
      .from("waitlist")
      .select("id, full_name, email")
      .eq("trip_id", tripId)
      .eq("notified", false);

    if (waitlistEntries && waitlistEntries.length > 0) {
      for (const entry of waitlistEntries) {
        try {
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: entry.email,
            replyTo: REPLY_TO_ADDRESS,
            subject: `Slots available — ${title}`,
            html: `
              <p>Hi ${escapeHtml(entry.full_name)},</p>
              <p>Good news! New slots have opened up for <strong>${escapeHtml(title)}</strong>. Book now before it fills up again:</p>
              <p><a href="https://sama.ph/trips/${existing.slug}">sama.ph/trips/${existing.slug}</a></p>
              <p>— The Sama Team</p>
            `,
          });
        } catch (err) {
          console.error("[email] failed to notify waitlist slot available", entry.id, err);
        }
        try {
          await admin.from("waitlist").update({ notified: true }).eq("id", entry.id);
        } catch (err) {
          console.error("[db] failed to mark waitlist notified", entry.id, err);
        }
      }
    }
  }

  revalidatePath("/trips");
  revalidatePath(`/trips/${existing.slug}`);
  revalidatePath("/organizer/dashboard");
  redirect("/organizer/dashboard");
}

export async function cancelTrip(tripSlug: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/organizer/apply");

  const admin = createSupabaseAdminClient();

  const { data: trip } = await admin
    .from("trips")
    .select("id, title, date_start, total_slots, organizer_id, status")
    .eq("slug", tripSlug)
    .maybeSingle();

  if (!trip) return;
  if (String(trip.organizer_id) !== String(organizer.id)) return;
  if (trip.status !== "active") return;

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, full_name, email")
    .eq("trip_id", trip.id)
    .in("status", ["pending", "confirmed"]);

  await admin
    .from("trips")
    .update({ status: "cancelled", remaining_slots: trip.total_slots })
    .eq("id", trip.id);

  await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("trip_id", trip.id)
    .in("status", ["pending", "confirmed"]);

  const tripDate = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(trip.date_start));

  const { data: waitlistEntries } = await admin
    .from("waitlist")
    .select("id, full_name, email")
    .eq("trip_id", trip.id);

  await admin.from("waitlist").delete().eq("trip_id", trip.id);

  for (const booking of bookings ?? []) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Trip cancelled — ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>We're sorry to inform you that <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been cancelled by the organizer.</p>
          <p>If you paid a downpayment, please email <a href="mailto:sama.com.ph@gmail.com">sama.com.ph@gmail.com</a> and we will process your refund within 3–5 business days.</p>
          <p>We hope to see you on a future trip!</p>
          <p>— The Sama Team</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to notify booking cancellation", booking.id, err);
    }
  }
  for (const entry of waitlistEntries ?? []) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: entry.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Trip cancelled: ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(entry.full_name)},</p>
          <p><strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been cancelled by the organizer.</p>
          <p>If you have questions, please contact <a href="mailto:sama.com.ph@gmail.com">sama.com.ph@gmail.com</a>.</p>
          <p>— The Sama Team</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to notify waitlist cancellation", entry.id, err);
    }
  }

  revalidatePath("/trips");
  revalidatePath("/organizer/dashboard");
  revalidatePath(`/trips/${tripSlug}`);
  redirect("/organizer/dashboard");
}
