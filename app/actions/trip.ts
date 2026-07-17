"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { sendAdminAlert } from "@/lib/admin-alert";
import { escapeHtml } from "@/lib/escape-html";
import { reverseBookingCredit } from "@/lib/organizer-credits";
import { type RefundResult } from "@/lib/paymongo-refund";
import { cancellationRefundLine } from "@/lib/refund-email-copy";
import { issueAndRecordRefund } from "@/lib/refunds";
import { amountJoinerPaid, computeRefundSplit } from "@/lib/booking-finance";
import { resolveCancellationCascade } from "@/lib/cancellation-cascade";
import { computeTripCancelSummary, type TripCancelSummary } from "@/lib/trip-cancel-summary";
import { resolveTripSlotSummary, isActiveCapacityChange, type TripSlotSummary } from "@/lib/trip-slot-summary";
import { SLOT_CONSUMING_STATUSES, SLOT_HOLDING_STATUSES, TRIP_CANCELLATION_REFUND_STATUSES } from "@/lib/booking-status";
import { organizerOwns } from "@/lib/authz";
import { sendInChunks } from "@/lib/send-in-chunks";
import { notifyWaitlistSlotOpened } from "@/lib/waitlist-notify";
import { formatPeso } from "@/lib/format";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function buildBaseSlug(title: string, dateStart: string): string {
  const base = slugify(title);
  if (dateStart === "2099-12-31") return base;
  const d = new Date(dateStart + "T00:00:00");
  return `${base}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

type SupabaseClientForSlug = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function makeUniqueSlug(base: string, client: SupabaseClientForSlug, excludeId?: number): Promise<string> {
  let candidate = base;
  for (let suffix = 2; ; suffix++) {
    const query = client.from("trips").select("id").eq("slug", candidate).limit(1);
    const { data } = excludeId !== undefined
      ? await query.neq("id", excludeId).maybeSingle()
      : await query.maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${suffix}`;
  }
}

export async function createTrip(
  _prevState: { error: string } | { success: true; slug: string; tripId: string | number; warning?: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/trips/new");

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[create-trip] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "create-trip-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer || organizer.status !== "approved") {
    redirect("/apply");
  }

  const is_template = formData.get("is_template") === "true";
  const template_id = (formData.get("template_id") as string) || null;
  const title = (formData.get("title") as string)?.trim();
  const activity_type = formData.get("activity_type") as string;
  const destination = (formData.get("destination") as string)?.trim();
  const region_raw = (formData.get("region") as string) || null;
  const region = (region_raw === "Luzon" || region_raw === "Visayas" || region_raw === "Mindanao") ? region_raw : null;
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
    try {
      const parsed = mpJson ? JSON.parse(mpJson) : [];
      if (!Array.isArray(parsed) || !parsed.every((mp: unknown) => typeof (mp as MeetingPoint)?.location === "string" && typeof (mp as MeetingPoint)?.time === "string")) {
        return { error: "Invalid pickup points format." };
      }
      meeting_points = parsed.filter((mp: MeetingPoint) => mp.location.trim() !== "");
    } catch { return { error: "Invalid meeting points data." }; }
  }
  const description = (formData.get("description") as string)?.trim();
  const includes = (formData.get("includes") as string)?.trim();
  const what_to_bring = (formData.get("what_to_bring") as string)?.trim();
  const photosJson = formData.get("photos_json") as string | null;
  let photos: string[] = [];
  try { photos = photosJson ? JSON.parse(photosJson) : []; } catch { return { error: "Invalid photo data." }; }
  if (photos.length > 5) return { error: "Maximum 5 photos allowed." };
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
    ? (isNaN(_cutoffParsed) || _cutoffParsed < 1 ? 1 : _cutoffParsed)
    : null;
  const cancellation_policy = (formData.get("cancellation_policy") as string) || "flexible";
  const cancellation_policy_custom = cancellation_policy === "custom"
    ? ((formData.get("cancellation_policy_custom") as string)?.trim() || null)
    : null;
  const waiver_text = (formData.get("waiver_text") as string)?.trim() || null;
  const custom_questions_raw = (formData.get("custom_questions") as string) || "[]";
  let custom_questions: string[] | null = null;
  try {
    const parsed = JSON.parse(custom_questions_raw) as unknown;
    const arr = Array.isArray(parsed) ? (parsed as unknown[]).map(String).filter((q) => q.trim()) : [];
    custom_questions = arr.length > 0 ? arr.slice(0, 3) : null;
  } catch {
    custom_questions = null;
  }
  const messengerRaw = (formData.get("messenger_gc_link") as string)?.trim() || null;
  let messenger_gc_link: string | null = null;
  if (messengerRaw) {
    const validPrefixes = [
      "https://m.me/",
      "https://www.messenger.com/",
      "https://messenger.com/",
      "https://www.facebook.com/groups/",
      "https://facebook.com/groups/",
    ];
    if (!validPrefixes.some((prefix) => messengerRaw.startsWith(prefix))) {
      return { error: "Please enter a valid Messenger or Facebook group link." };
    }
    messenger_gc_link = messengerRaw;
  }
  const status = (formData.get("status") as string) === "draft" ? "draft" : "active";
  const isDraft = status === "draft";

  if (is_template && !isDraft) {
    return { error: "Templates can't be published directly. Go to your dashboard and create a run from this template to list a specific date." };
  }

  if (!title) {
    return { error: "Please enter a trip title." };
  }

  if (!isDraft && title && title.length > 100) {
    return { error: "Trip title must be 100 characters or fewer." };
  }

  if (!["flexible", "moderate", "strict"].includes(cancellation_policy)) {
    return { error: "Invalid cancellation policy." };
  }

  if (!isDraft) {
    if (!activity_type || !destination || !difficulty || !description) {
      return { error: "Please fill in all required fields." };
    }
    if (description && description.length > 5000) return { error: "Description must be 5000 characters or fewer." };
    if (waiver_text && waiver_text.length > 10000) return { error: "Waiver text must be 10000 characters or fewer." };
    if (!region) {
      return { error: "Please select a region (Luzon, Visayas, or Mindanao)." };
    }
    if (!is_template && (!date_start || isNaN(price) || isNaN(total_slots))) {
      return { error: "Please fill in all required fields." };
    }
    if (!is_template && payment_type === "downpayment" && (!min_downpayment || isNaN(min_downpayment))) {
      return { error: "Please enter a minimum downpayment amount." };
    }
    if (!is_template) {
      if (price < 0) return { error: "Price cannot be negative." };
      if (price > 100000) return { error: "Trip price cannot exceed ₱100,000." };
      if (total_slots < 1) return { error: "Total slots must be at least 1." };
      if (total_slots > 500) return { error: "Total slots cannot exceed 500." };
      if (payment_type === "downpayment" && min_downpayment !== null) {
        if (min_downpayment < 0) return { error: "Minimum downpayment cannot be negative." };
        const minAllowed = Math.round(price * 0.10);
        if (min_downpayment < minAllowed) return { error: `Minimum downpayment must be at least ₱${minAllowed.toLocaleString()} (10% of the trip price).` };
        if (price > 0 && min_downpayment >= price) return { error: "Minimum downpayment must be less than the full price." };
      }
      const today = new Date().toISOString().split("T")[0];
      if (date_start < today) return { error: "Trip date cannot be in the past." };
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 2);
      if (date_start > maxDate.toISOString().split("T")[0]) {
        return { error: "Trip date cannot be more than 2 years in the future." };
      }
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

  const slug = await makeUniqueSlug(buildBaseSlug(title, safeDateStart), supabase);

  // Write through the admin client. Authorization is enforced in code above:
  // the organizer row is looked up by the current user's id and must be
  // approved, and organizer_id below is that exact row.
  const adminForInsert = createSupabaseAdminClient();
  const { data: insertedRow, error } = await adminForInsert.from("trips").insert({
    title,
    slug,
    activity_type: activity_type || null,
    destination: destination || null,
    region,
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
    custom_questions,
    messenger_gc_link,
    is_template,
    template_id: template_id || null,
  }).select("id").single();

  if (error || !insertedRow) {
    return { error: error?.message ?? "Failed to create trip." };
  }

  const tripId = insertedRow.id as string | number;

  revalidatePath("/trips");
  revalidatePath("/organizer/dashboard");

  const warning = (status === "active" && !is_template && !messenger_gc_link)
    ? "You haven't added a Messenger Group Chat link. Participants won't receive a group chat link in their confirmation email. You can add it anytime by editing the trip."
    : undefined;

  return { success: true as const, slug, tripId, ...(warning ? { warning } : {}) };
}

export async function updateTrip(
  _prevState: { error: string } | { success: true; slug: string; warning?: string } | null,
  formData: FormData,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[update-trip] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "update-trip-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer || organizer.status !== "approved") redirect("/apply");

  const rawTripId = formData.get("trip_id");
  const tripId = parseInt(rawTripId as string, 10);

  const { data: existing, error: fetchError } = await supabase
    .from("trips")
    .select("id, slug, status, title, organizer_id, total_slots, remaining_slots, date_start, date_end, price, meeting_points, difficulty, payment_type, min_downpayment, photos")
    .eq("id", tripId)
    .maybeSingle();

  if (fetchError) {
    console.error("[update-trip] trip fetch failed:", fetchError);
    Sentry.captureException(fetchError, {
      extra: { context: "update-trip-trip-fetch-failed", tripId, userId: user.id },
    });
  }
  if (fetchError || !existing) {
    return { error: "Trip not found or you don't have permission to edit it." };
  }

  if (!organizerOwns(existing.organizer_id, organizer.id)) {
    return { error: "Trip not found or you don't have permission to edit it." };
  }

  const is_template = formData.get("is_template") === "true";
  const template_id = (formData.get("template_id") as string) || null;
  const title = (formData.get("title") as string)?.trim();
  const activity_type = formData.get("activity_type") as string;
  const destination = (formData.get("destination") as string)?.trim();
  const difficulty = formData.get("difficulty") as string;
  const duration = (formData.get("duration") as string) || null;
  const region_raw = (formData.get("region") as string) || null;
  const region = (region_raw === "Luzon" || region_raw === "Visayas" || region_raw === "Mindanao") ? region_raw : null;
  const date_start = is_template ? "2099-12-31" : (formData.get("date_start") as string);
  const date_end = is_template ? null : ((formData.get("date_end") as string) || null);
  const price = is_template ? 0 : parseFloat(formData.get("price") as string);
  const total_slots = is_template ? 0 : parseInt(formData.get("total_slots") as string, 10);
  type MeetingPoint = { location: string; time: string };
  let meeting_points: MeetingPoint[] = [];
  if (!is_template) {
    const mpJson = formData.get("meeting_points") as string | null;
    try {
      const parsed = mpJson ? JSON.parse(mpJson) : [];
      if (!Array.isArray(parsed) || !parsed.every((mp: unknown) => typeof (mp as MeetingPoint)?.location === "string" && typeof (mp as MeetingPoint)?.time === "string")) {
        return { error: "Invalid pickup points format." };
      }
      meeting_points = parsed.filter((mp: MeetingPoint) => mp.location.trim() !== "");
    } catch { return { error: "Invalid meeting points data." }; }
  }
  const description = (formData.get("description") as string)?.trim();
  const includes = (formData.get("includes") as string)?.trim();
  const what_to_bring = (formData.get("what_to_bring") as string)?.trim();
  const photosJson = formData.get("photos_json") as string | null;
  let photos: string[] = [];
  try { photos = photosJson ? JSON.parse(photosJson) : []; } catch { return { error: "Invalid photo data." }; }
  if (photos.length > 5) return { error: "Maximum 5 photos allowed." };

  // Delete photos removed from the trip during editing.
  const existingPhotos = Array.isArray(existing.photos) ? (existing.photos as string[]) : [];
  if (existingPhotos.length > 0) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
      const prefix = `${supabaseUrl}/storage/v1/object/public/trip-photos/`;
      const removedPaths = existingPhotos
        .filter((url) => !photos.includes(url) && url.startsWith(prefix))
        .map((url) => url.slice(prefix.length));
      if (removedPaths.length > 0) {
        const adminForStorage = createSupabaseAdminClient();
        const { error: photoRemoveError } = await adminForStorage.storage.from("trip-photos").remove(removedPaths);
        if (photoRemoveError) {
          console.error("[update-trip] removed photo cleanup failed:", photoRemoveError);
          Sentry.captureException(photoRemoveError, {
            extra: { context: "update-trip-photo-cleanup-failed", tripId, userId: user.id },
          });
        }
      }
    }
  }

  const payment_type = (formData.get("payment_type") as string) || "full";
  const min_downpayment_raw = formData.get("min_downpayment") as string;
  const min_downpayment = payment_type === "downpayment"
    ? (min_downpayment_raw ? parseFloat(min_downpayment_raw) : (existing.min_downpayment ?? null))
    : null;
  const downpayment_cutoff_days_raw = formData.get("downpayment_cutoff_days") as string;
  const _cutoffParsed2 = payment_type === "downpayment" && downpayment_cutoff_days_raw
    ? parseInt(downpayment_cutoff_days_raw, 10)
    : null;
  const downpayment_cutoff_days = _cutoffParsed2 !== null
    ? (isNaN(_cutoffParsed2) || _cutoffParsed2 < 1 ? 1 : _cutoffParsed2)
    : null;
  const cancellation_policy = (formData.get("cancellation_policy") as string) || "flexible";
  const cancellation_policy_custom = cancellation_policy === "custom"
    ? ((formData.get("cancellation_policy_custom") as string)?.trim() || null)
    : null;
  const waiver_text = (formData.get("waiver_text") as string)?.trim() || null;
  const custom_questions_raw2 = (formData.get("custom_questions") as string) || "[]";
  let custom_questions: string[] | null = null;
  try {
    const parsed2 = JSON.parse(custom_questions_raw2) as unknown;
    const arr2 = Array.isArray(parsed2) ? (parsed2 as unknown[]).map(String).filter((q) => q.trim()) : [];
    custom_questions = arr2.length > 0 ? arr2.slice(0, 3) : null;
  } catch {
    custom_questions = null;
  }
  const messengerRaw = (formData.get("messenger_gc_link") as string)?.trim() || null;
  let messenger_gc_link: string | null = null;
  if (messengerRaw) {
    const validPrefixes = [
      "https://m.me/",
      "https://www.messenger.com/",
      "https://messenger.com/",
      "https://www.facebook.com/groups/",
      "https://facebook.com/groups/",
    ];
    if (!validPrefixes.some((prefix) => messengerRaw.startsWith(prefix))) {
      return { error: "Please enter a valid Messenger or Facebook group link." };
    }
    messenger_gc_link = messengerRaw;
  }
  const statusInput = formData.get("status") as string | null;
  const status = statusInput === "active" ? "active" : statusInput === "draft" ? "draft" : (existing.status ?? "active");
  const isDraft = status === "draft";

  if (is_template && !isDraft) {
    return { error: "Templates can't be published directly. Go to your dashboard and create a run from this template to list a specific date." };
  }

  if (!title) {
    return { error: "Please enter a trip title." };
  }
  if (!isDraft && title && title.length > 100) {
    return { error: "Trip title must be 100 characters or fewer." };
  }

  if (!["flexible", "moderate", "strict"].includes(cancellation_policy)) {
    return { error: "Invalid cancellation policy." };
  }

  if (!isDraft && !activity_type || !isDraft && !destination || !isDraft && !difficulty || !isDraft && !description) {
    return { error: "Please fill in all required fields." };
  }

  if (!isDraft && description && description.length > 5000) return { error: "Description must be 5000 characters or fewer." };
  if (!isDraft && waiver_text && waiver_text.length > 10000) return { error: "Waiver text must be 10000 characters or fewer." };

  if (!isDraft && !region) {
    return { error: "Please select a region (Luzon, Visayas, or Mindanao)." };
  }

  if (!isDraft && !is_template && (!date_start || isNaN(price) || isNaN(total_slots))) {
    return { error: "Please fill in all required fields." };
  }

  if (!isDraft && !is_template && payment_type === "downpayment" && (!min_downpayment || isNaN(min_downpayment))) {
    return { error: "Please enter a minimum downpayment amount." };
  }

  if (!isDraft && !is_template) {
    if (price < 0) return { error: "Price cannot be negative." };
    if (price > 100000) return { error: "Trip price cannot exceed ₱100,000." };
    if (total_slots < 1) return { error: "Total slots must be at least 1." };
    if (total_slots > 500) return { error: "Total slots cannot exceed 500." };
    if (payment_type === "downpayment" && min_downpayment !== null) {
      if (min_downpayment < 0) return { error: "Minimum downpayment cannot be negative." };
      const minAllowed = Math.round(price * 0.10);
      if (min_downpayment < minAllowed) return { error: `Minimum downpayment must be at least ₱${minAllowed.toLocaleString()} (10% of the trip price).` };
      if (price > 0 && min_downpayment >= price) return { error: "Minimum downpayment must be less than the full price." };
    }
    const today = new Date().toISOString().split("T")[0];
    if (date_start < today) return { error: "Trip date cannot be in the past." };
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);
    if (date_start > maxDate.toISOString().split("T")[0]) {
      return { error: "Trip date cannot be more than 2 years in the future." };
    }
    if (date_end && date_end < date_start) return { error: "End date cannot be before start date." };
    if (duration && duration !== "Day tour" && !date_end) return { error: "Please enter an end date for overnight/multi-day trips." };
    const hasGcash = organizer.payout_method === "gcash" && !!organizer.gcash_number;
    const hasBank = organizer.payout_method === "bank_transfer" && !!organizer.bank_account_number;
    if (!hasGcash && !hasBank) {
      return { error: "Please add your payout details (GCash or bank account) in your organizer profile before publishing a trip. This is required to receive payments from bookings." };
    }
  }

  // Single booking query covers all five edge-case checks below. Queried over
  // SLOT_CONSUMING_STATUSES (not just ACTIVE) because transferred and no_show
  // bookings still hold their slots; resolveTripSlotSummary splits the rows
  // into the per-purpose counters (see lib/trip-slot-summary.ts for which
  // counter uses which status set).
  //
  // The gate includes the unpublish path: isDraft is true when moving an
  // active trip back to draft, but the active-to-draft guard below needs a
  // real liveBookingCount, so the summary must be fetched for that path too.
  // The guards fail closed: if the summary cannot be determined the edit is
  // rejected rather than evaluated against a zeroed summary that would let
  // every guard pass.
  let slotSummary: TripSlotSummary = {
    consumedSlots: 0,
    activeBookingCount: 0,
    pendingBalanceCount: 0,
    liveBookingCount: 0,
  };
  const isUnpublishing = status === "draft" && existing.status === "active";
  if ((!isDraft || isUnpublishing) && !is_template) {
    const adminForChecks = createSupabaseAdminClient();
    const { data: consumingBookings, error: consumingBookingsError } = await adminForChecks
      .from("bookings")
      .select("status, slots, amount_due, total_amount")
      .eq("trip_id", tripId)
      .in("status", [...SLOT_CONSUMING_STATUSES]);
    const resolvedSummary = resolveTripSlotSummary(consumingBookings, consumingBookingsError);
    if ("failure" in resolvedSummary) {
      console.error("[update-trip] slot-summary bookings fetch failed:", consumingBookingsError);
      Sentry.captureException(
        consumingBookingsError ?? new Error("update-trip slot-summary bookings query returned no data"),
        {
          extra: {
            context: "update-trip-slot-summary-fetch-failed",
            failure: resolvedSummary.failure,
            tripId,
            organizerId: organizer.id,
            userId: user.id,
          },
        },
      );
      return { error: "Could not verify this trip's bookings, please retry." };
    }
    slotSummary = resolvedSummary.summary;
  }
  const { consumedSlots, activeBookingCount, pendingBalanceCount, liveBookingCount } = slotSummary;

  // 1. Block reducing total_slots below the slots bookings still consume
  // (confirmed + pending + payment_pending + transferred + no_show).
  if (!isDraft && !is_template && total_slots < existing.total_slots) {
    if (total_slots < consumedSlots) {
      return { error: `Cannot reduce total slots below your current bookings (${consumedSlots} slots booked, including transfers). Cancel bookings first if you need to reduce capacity.` };
    }
  }

  // 2. Block difficulty change to Advanced while bookings exist.
  if (!isDraft && !is_template && difficulty === "Advanced" && existing.difficulty !== "Advanced" && activeBookingCount > 0) {
    return { error: "Cannot change difficulty to Advanced while confirmed bookings exist. Advanced trips require organizer approval for new bookings, which would create an inconsistent experience for existing participants." };
  }

  // Block moving a trip back to draft while anyone is still attending. Uses
  // liveBookingCount (ACTIVE plus transferred), not activeBookingCount: a trip
  // whose only booking is transferred still has a replacement participant on
  // it and must stay visible.
  if (status === "draft" && existing.status === "active") {
    if (liveBookingCount > 0) {
      return { error: "This trip has confirmed or transferred bookings and cannot be moved to draft. Cancel the trip instead." };
    }
  }

  // 3+4. Collect warnings for price change and downpayment-to-full switch.
  let saveWarning: string | undefined;
  let downpaymentDisabled = false;
  if (!isDraft && !is_template) {
    const priceChanged = !isNaN(price) && existing.price != null && existing.price !== price;
    if (priceChanged && activeBookingCount > 0) {
      saveWarning = `Price updated. This only affects new bookings. ${activeBookingCount} existing booking${activeBookingCount !== 1 ? "s" : ""} will keep their original price.`;
    }
    downpaymentDisabled = existing.payment_type === "downpayment" && payment_type === "full";
    if (downpaymentDisabled && pendingBalanceCount > 0) {
      const balanceMsg = `Payment type updated. ${pendingBalanceCount} participant${pendingBalanceCount !== 1 ? "s" : ""} have already paid a downpayment and still owe a balance. They will need to settle directly with you.`;
      saveWarning = saveWarning ? `${saveWarning} ${balanceMsg}` : balanceMsg;
    }
    if (!messenger_gc_link && status === "active" && existing.status === "draft") {
      const gcMsg = "You haven't added a Messenger Group Chat link. Participants won't receive a group chat link in their confirmation email. You can add it anytime by editing the trip.";
      saveWarning = saveWarning ? `${saveWarning} ${gcMsg}` : gcMsg;
    }
  }

  // 5. Slot fields on a capacity change are owned by the atomic set_total_slots
  // RPC, not by the main .update() below. useCapacityRpc is TRUE only when
  // total_slots actually changed on an active (non-draft, non-template) trip.
  // On that path both total_slots and remaining_slots are omitted from the
  // payload and set together atomically by the RPC after the main update, which
  // adjusts remaining_slots against the LIVE row (remaining + (new_total -
  // old_total)) so a concurrent book_slot decrement or restore_slot restore
  // cannot be clobbered. On every other path (draft/template, or unchanged
  // capacity) the payload writes total_slots (unchanged value is harmless) and
  // never writes remaining_slots, leaving it to the incremental slot RPCs.
  const useCapacityRpc = isActiveCapacityChange({
    isDraft,
    isTemplate: is_template,
    newTotalSlots: total_slots,
    existingTotalSlots: existing.total_slots ?? 0,
  });

  // Normalise numerics for drafts.
  const safePrice = isDraft && isNaN(price) ? existing.price ?? 0 : price;
  const safeTotalSlots = isDraft && isNaN(total_slots) ? existing.total_slots ?? 0 : total_slots;
  const safeDateStart = is_template ? "2099-12-31" : (isDraft && !date_start ? existing.date_start ?? "2099-12-31" : date_start);
  // Free trips cannot have a downpayment requirement.
  const effectivePaymentType = safePrice === 0 ? "full" : payment_type;
  const effectiveMinDownpayment = safePrice === 0 ? null : min_downpayment;

  const titleChanged = title !== existing.title;
  const startDateChanged = (safeDateStart ?? "").slice(0, 10) !== (existing.date_start ?? "").slice(0, 10);
  let newSlug: string | undefined;
  if (titleChanged || startDateChanged) {
    newSlug = await makeUniqueSlug(buildBaseSlug(title, safeDateStart), supabase, tripId);
    const adminForRedirect = createSupabaseAdminClient();
    const { error: slugRedirectError } = await adminForRedirect.from("trip_slug_redirects").upsert(
      { old_slug: existing.slug, new_slug: newSlug, trip_id: tripId },
      { onConflict: "old_slug" }
    );
    if (slugRedirectError) {
      console.error("[update-trip] slug redirect upsert failed:", slugRedirectError);
      Sentry.captureException(slugRedirectError, {
        extra: { context: "update-trip-slug-redirect-upsert-failed", tripId },
      });
    }
  }

  // Write through the admin client. Authorization is enforced in code above:
  // the organizer is looked up by the current user's id and must be approved,
  // and the trip's organizer_id is verified to match that org before this point.
  const adminForUpdate = createSupabaseAdminClient();
  const { error } = await adminForUpdate
    .from("trips")
    .update({
      title,
      ...(newSlug ? { slug: newSlug } : {}),
      activity_type: activity_type || null,
      destination: destination || null,
      difficulty: difficulty || null,
      region,
      duration: duration || null,
      date_start: safeDateStart,
      date_end: date_end || null,
      price: safePrice,
      // Capacity-RPC path: omit BOTH slot fields; set_total_slots (called after
      // this update) sets total_slots and remaining_slots together atomically,
      // so the main update never clobbers the live remaining_slots. Otherwise
      // write total_slots (unchanged value is harmless) and never remaining_slots.
      ...(useCapacityRpc ? {} : { total_slots: safeTotalSlots }),
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
      custom_questions,
      messenger_gc_link,
      is_template,
      template_id: template_id || null,
    })
    .eq("id", tripId);

  if (error) return { error: error.message };

  // On a capacity change the slot fields were omitted from the update above;
  // set_total_slots now writes total_slots and remaining_slots together in one
  // atomic UPDATE (remaining_slots = greatest(0, remaining + (new_total -
  // old_total)), reading the LIVE row) so a concurrent booking or cancel is not
  // clobbered. It returns the resulting remaining_slots.
  //
  // Failure severity: unlike a fire-and-forget restore_slot, a failure here is
  // worse. The payload no longer writes total_slots on this path, so if the RPC
  // fails the capacity change did NOT apply at all while the other field edits
  // DID: the edit is partially applied. We surface an error so the organizer
  // retries; re-submitting the same form is safe because set_total_slots is an
  // idempotent set-to-new-total against the live row (running it again just
  // reasserts the same total and re-derives remaining from live consumption).
  // A null/undefined return means the UPDATE matched zero rows (the trip row
  // vanished between the update and the RPC); treat that as a failure too.
  // Returning here also skips the notifications below, which is correct: on
  // retry they run once against the fully-applied edit, never double-sent.
  if (useCapacityRpc) {
    const { data: newRemaining, error: slotRpcError } = await adminForUpdate.rpc("set_total_slots", {
      p_trip_id: tripId,
      p_new_total: safeTotalSlots,
    });
    if (slotRpcError || newRemaining == null) {
      Sentry.captureException(
        slotRpcError ?? new Error("set_total_slots returned null (trip row not found)"),
        { extra: { context: "updateTrip-set_total_slots", tripId, newTotal: safeTotalSlots } },
      );
      return { error: "Could not update trip capacity, please retry." };
    }
  }

  // Notify confirmed/pending bookers if key booking fields changed.
  if (!is_template) {
    const dateChanged = existing.date_start && (
      (existing.date_start ?? "").slice(0, 10) !== (date_start ?? "").slice(0, 10)
      || (existing.date_end ?? "").slice(0, 10) !== (date_end ?? "").slice(0, 10)
    );
    const priceChanged = existing.price != null && existing.price !== price;
    const existingMeetingPoints = (existing.meeting_points ?? []).filter((mp: MeetingPoint) => mp.location.trim() !== "");
    const mpChanged = JSON.stringify(existingMeetingPoints) !== JSON.stringify(meeting_points);

    if (dateChanged || priceChanged || mpChanged) {
      const admin = createSupabaseAdminClient();
      const { data: affectedBookings, error: affectedBookingsError } = await admin
        .from("bookings")
        .select("id, full_name, email")
        .eq("trip_id", tripId)
        .in("status", [...SLOT_HOLDING_STATUSES]);

      if (affectedBookingsError) {
        console.error("[update-trip] affected bookings fetch failed:", affectedBookingsError);
        Sentry.captureException(affectedBookingsError, {
          extra: { context: "update-trip-affected-bookings-fetch-failed", tripId },
        });
      }
      if (affectedBookings && affectedBookings.length > 0) {
        const fmt = (d: string) => new Intl.DateTimeFormat("en-PH", {
          weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
        }).format(new Date(d));

        const changeLines: string[] = [];
        if (dateChanged) {
          const oldRange = existing.date_end ? `${fmt(existing.date_start)} to ${fmt(existing.date_end)}` : fmt(existing.date_start);
          const newRange = date_end ? `${fmt(date_start)} to ${fmt(date_end)}` : fmt(date_start);
          changeLines.push(`<li><strong>Date:</strong> ${oldRange} → ${newRange}</li>`);
        }
        if (priceChanged) {
          changeLines.push(`<li><strong>Price:</strong> ${formatPeso(Number(existing.price))} → ${formatPeso(price)}</li>`);
        }
        if (mpChanged) {
          changeLines.push(`<li><strong>Meeting point:</strong> updated. Check the trip page for details</li>`);
        }

        const changeHtml = `<ul>${changeLines.join("")}</ul>`;

        await sendInChunks(affectedBookings, async (booking) => {
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
                <p>Please review the updated trip details here: <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/trips/${newSlug ?? existing.slug}">${(process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph").replace("https://", "")}/trips/${newSlug ?? existing.slug}</a></p>
                <p>If you have questions, contact <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>
                <p>Sama</p>
              `,
            });
          } catch (err) {
            console.error("[email] failed to notify booking change", booking.id, err);
            Sentry.captureException(err, {
              extra: { context: "update-trip-booking-change-email-failed", bookingId: booking.id, tripId },
            });
          }
        });
      }
    }
  }

  // Notify all waitlisted members when the organizer increases slots on a
  // previously full trip. This slot increase is a genuine opening, so the
  // shared helper handles the 12-hour debounce, rate-limit-safe sending, and
  // success-only stamping.
  //
  // Gate on the capacity delta itself (was full, and total_slots increased),
  // not on a post-write remaining_slots value: on the capacity-RPC path the JS
  // no longer holds the written remaining_slots. A failed capacity RPC returns
  // above, so reaching here means the increase actually applied.
  if (existing.remaining_slots === 0 && safeTotalSlots > (existing.total_slots ?? 0)) {
    await notifyWaitlistSlotOpened(tripId, {
      title,
      slug: existing.slug,
      dateStart: safeDateStart,
    });
  }

  // Notify participants with outstanding balances when payment type switches to full.
  if (downpaymentDisabled && pendingBalanceCount > 0) {
    const admin = createSupabaseAdminClient();
    const { data: balanceBookings, error: balanceBookingsError } = await admin
      .from("bookings")
      .select("id, full_name, email, total_amount, amount_due")
      .eq("trip_id", tripId)
      .in("status", [...SLOT_HOLDING_STATUSES]);

    if (balanceBookingsError) {
      console.error("[update-trip] balance bookings fetch failed:", balanceBookingsError);
      Sentry.captureException(balanceBookingsError, {
        extra: { context: "update-trip-balance-bookings-fetch-failed", tripId },
      });
    }

    const fmt = (n: number) => formatPeso(n);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

    for (const booking of balanceBookings ?? []) {
      if (booking.amount_due == null || booking.total_amount == null) continue;
      const balance = Number(booking.total_amount) - Number(booking.amount_due);
      if (balance <= 0) continue;
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: booking.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `Action required: remaining balance for ${title}`,
          html: `
            <p>Hi ${escapeHtml(booking.full_name)},</p>
            <p>The organizer of <strong>${escapeHtml(title)}</strong> has switched to full payment. Your booking requires the remaining balance to be settled.</p>
            <p>Amount paid: <strong>${fmt(Number(booking.amount_due))}</strong><br>
            Remaining balance: <strong>${fmt(balance)}</strong></p>
            <p>You can pay your balance online: <a href="${siteUrl}/profile/bookings/${booking.id}">${siteUrl.replace("https://", "")}/profile/bookings/${booking.id}</a>.</p>
            <p>If you have questions, email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>
            <p>Sama</p>
          `,
        });
      } catch (err) {
        console.error("[email] failed to notify balance due after payment type change", booking.id, err);
        Sentry.captureException(err, {
          extra: { context: "update-trip-balance-due-email-failed", bookingId: booking.id, tripId },
        });
      }
    }
  }

  revalidatePath("/trips");
  revalidatePath(`/trips/${existing.slug}`);
  if (newSlug) revalidatePath(`/trips/${newSlug}`);
  revalidatePath("/organizer/dashboard");

  return {
    success: true as const,
    slug: newSlug ?? existing.slug,
    ...(saveWarning ? { warning: saveWarning } : {}),
  };
}

export async function publishTrip(tripSlug: string): Promise<{ error: string } | { success: true }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[publish-trip] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "publish-trip-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer || organizer.status !== "approved") return { error: "Not authorized." };

  const { data: tripData, error: tripFetchError } = await supabase
    .from("trips")
    .select("is_template, date_start")
    .eq("slug", tripSlug)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  // Fail closed: the template and past-date guards below must never run
  // against a missing row. A fetch error or an unmatched slug rejects the
  // publish instead of letting the guards pass vacuously.
  if (tripFetchError || !tripData) {
    console.error("[publish-trip] trip fetch failed:", tripFetchError);
    Sentry.captureException(
      tripFetchError ?? new Error("publish-trip trip fetch returned no row"),
      {
        extra: { context: "publish-trip-trip-fetch-failed", tripSlug, organizerId: organizer.id },
      },
    );
    return { error: "Trip not found or you don't have permission to publish it." };
  }

  if (tripData.is_template) {
    return { error: "Templates can't be published directly. Go to your dashboard and create a run from this template to list a specific date." };
  }

  // Re-check the start date before publishing. A draft saved earlier with a
  // future date may have since passed; publishing it would create an active but
  // already-past trip whose bookings fail the same date gate. Mirror the Manila
  // (Asia/Manila) past-date comparison used by the booking and cancel gates so a
  // past date is rejected uniformly.
  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (tripData.date_start && tripData.date_start < todayPH) {
    return { error: "This trip's start date has already passed. Please update the date before publishing." };
  }

  const hasGcash = organizer.payout_method === "gcash" && !!organizer.gcash_number;
  const hasBank = organizer.payout_method === "bank_transfer" && !!organizer.bank_account_number;
  if (!hasGcash && !hasBank) {
    return { error: "Please add your payout details (GCash or bank account) in your organizer profile before publishing." };
  }

  // Write through the admin client. Authorization is enforced in code: the
  // organizer is looked up by the current user's id and must be approved, and
  // the update itself is scoped to that org's id so it can only ever touch the
  // current user's own draft trip.
  const adminForPublish = createSupabaseAdminClient();
  const { error } = await adminForPublish
    .from("trips")
    .update({ status: "active" })
    .eq("slug", tripSlug)
    .eq("organizer_id", organizer.id)
    .eq("status", "draft");

  if (error) return { error: error.message };

  revalidatePath("/organizer/dashboard");
  return { success: true };
}

export async function getTripCancelSummary(tripSlug: string): Promise<
  | { error: string }
  | TripCancelSummary
> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[get-trip-cancel-summary] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "get-trip-cancel-summary-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer) return { error: "Not an organizer." };

  const admin = createSupabaseAdminClient();

  const { data: trip, error: tripError } = await admin
    .from("trips")
    .select("id, organizer_id")
    .eq("slug", tripSlug)
    .maybeSingle();

  if (tripError) {
    console.error("[get-trip-cancel-summary] trip fetch failed:", tripError);
    Sentry.captureException(tripError, {
      extra: { context: "get-trip-cancel-summary-trip-fetch-failed", organizerId: organizer.id, userId: user.id },
    });
  }
  if (!trip || !organizerOwns(trip.organizer_id, organizer.id)) {
    return { error: "Trip not found." };
  }

  // Query the SAME set cancelTrip sweeps and refunds. Anything narrower (the
  // old ACTIVE_BOOKING_STATUSES query) makes the confirmation dialog undercount
  // what the cancellation actually does; transferred bookings in particular are
  // refunded to the original payer and drop out of payout eligibility.
  const { data: bookings } = await admin
    .from("bookings")
    .select("paymongo_payment_id, balance_paymongo_payment_id, payment_method, status, payout_status, total_amount, amount_due, payment_option, balance_payment_gateway_status, platform_commission")
    .eq("trip_id", trip.id)
    .in("status", [...TRIP_CANCELLATION_REFUND_STATUSES]);

  return computeTripCancelSummary(bookings ?? []);
}

export async function cancelTrip(tripSlug: string): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, status, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[cancel-trip] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "cancel-trip-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer || organizer.status !== "approved") redirect("/apply");

  const admin = createSupabaseAdminClient();

  const { data: trip, error: tripError } = await admin
    .from("trips")
    .select("id, title, date_start, total_slots, organizer_id, status")
    .eq("slug", tripSlug)
    .maybeSingle();

  if (tripError) {
    console.error("[cancel-trip] trip fetch failed:", tripError);
    Sentry.captureException(tripError, {
      extra: { context: "cancel-trip-trip-fetch-failed", organizerId: organizer.id, userId: user.id },
    });
  }
  if (!trip) return { error: "Trip not found." };
  if (!organizerOwns(trip.organizer_id, organizer.id)) return { error: "You don't have permission to cancel this trip." };
  if (trip.status === "cancelled") return { error: "This trip is already cancelled." };
  if (trip.status !== "active") return { error: "Only active trips can be cancelled." };
  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (trip.date_start < todayPH) return { error: "This trip has already taken place and cannot be cancelled." };

  const { error: tripCancelError } = await admin
    .from("trips")
    .update({ status: "cancelled", remaining_slots: trip.total_slots })
    .eq("id", trip.id);

  if (tripCancelError) {
    console.error("[cancel-trip] trip status update failed:", tripCancelError);
    Sentry.captureException(tripCancelError, {
      extra: { context: "cancel-trip-status-update-failed", tripId: trip.id, organizerId: organizer.id },
    });
    return { error: "Could not cancel this trip, please retry." };
  }

  // Only refund/notify bookings THIS call actually transitioned. The status-guarded
  // update returns exactly the rows still cancellable at update time, so a booking
  // already cancelled by a concurrent path (partialCancelBooking/cancelBooking) is
  // excluded and never receives a second refund. Includes "transferred": on a whole-
  // trip cancellation the original payer is refunded and the booking leaves
  // ATTENDED_STATUSES payout eligibility.
  const { data: cancelledRows, error: bookingsCancelError } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("trip_id", trip.id)
    .in("status", [...TRIP_CANCELLATION_REFUND_STATUSES])
    .select("id, full_name, email, total_amount, amount_due, payment_option, paymongo_payment_id, balance_paymongo_payment_id, payment_method, balance_payment_gateway_status, payout_status, payout_id");

  const cascade = resolveCancellationCascade(cancelledRows, bookingsCancelError);
  if ("failure" in cascade) {
    console.error("[cancel-trip] bookings cancel update failed:", bookingsCancelError ?? "no rows returned");
    Sentry.captureException(
      bookingsCancelError ?? new Error(`cancelTrip bookings update returned null rows for trip ${trip.id}`),
      {
        extra: { context: "cancel-trip-bookings-cancel-failed", failure: cascade.failure, tripId: trip.id, organizerId: organizer.id },
      },
    );
    await sendAdminAlert(
      `[Admin] Action needed: participant processing did not run for cancelled trip: ${escapeHtml(trip.title)}`,
      `
            <p>Trip <strong>${escapeHtml(trip.title)}</strong> was marked cancelled, but the follow-up update that cancels its bookings failed or returned no data. Refunds and notifications did not run for its participants or waitlist.</p>
            <p><strong>Trip ID:</strong> ${trip.id}</p>
            <p>Please review this trip's bookings and process cancellations, refunds, and notifications manually.</p>
            <p>Sama System</p>
          `,
    );
    return { error: "The trip was cancelled, but participant refunds and notifications could not be processed. Sama has been alerted." };
  }
  const bookings = cascade.rows;

  const tripDate = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));

  const { data: waitlistEntries, error: waitlistFetchError } = await admin
    .from("waitlist")
    .select("id, full_name, email")
    .eq("trip_id", trip.id);

  if (waitlistFetchError) {
    // Never delete entries we could not snapshot for notification; the rows
    // stay so a retry or manual pass can still reach these users. Refunds
    // below must not be blocked by this.
    console.error("[cancel-trip] waitlist fetch failed:", waitlistFetchError);
    Sentry.captureException(waitlistFetchError, {
      extra: { context: "cancel-trip-waitlist-fetch-failed", tripId: trip.id },
    });
  } else {
    const { error: waitlistDeleteError } = await admin.from("waitlist").delete().eq("trip_id", trip.id);
    if (waitlistDeleteError) {
      console.error("[cancel-trip] waitlist delete failed:", waitlistDeleteError);
      Sentry.captureException(waitlistDeleteError, {
        extra: {
          context: "cancel-trip-waitlist-delete-failed",
          tripId: trip.id,
          residue: "waitlist rows linger on a cancelled trip",
        },
      });
    }
  }

  const fmtCurrency = (n: number) =>
    formatPeso(n);

  // Process refunds — a failed refund never blocks cancellation emails or flow.
  const refundResultMap = new Map<number, { initial: RefundResult | null, balance: RefundResult | null }>();
  const manualRefundList: Array<{ id: number, full_name: string, email: string, amount: number }> = [];

  const refundSettlements = await Promise.allSettled((bookings ?? []).map(async (booking) => {
    // Organizer cancellation is a full (100%) refund of what the joiner paid
    // online, split across the downpayment and balance payment sources. Using
    // amountJoinerPaid here (rather than a raw amount_due fallback) is what keeps
    // a downpayment booking whose balance was paid online from being undercounted.
    const refundAmount = amountJoinerPaid(booking);
    const { downpaymentRefund, balanceRefund } = computeRefundSplit(booking, refundAmount);
    const downpaymentRefundAmount = downpaymentRefund ?? 0;

    // Flag the associated payout for reconciliation whenever cancellation happens after payout creation.
    if (booking.payout_id && (booking.payout_status === "remitted" || booking.payout_status === "included")) {
      const { error: reconciliationFlagError } = await admin
        .from("payouts" as "trips")
        .update({ needs_reconciliation: true } as never)
        .eq("id", booking.payout_id);
      if (reconciliationFlagError) {
        // Bookkeeping-flag failure must never strand the joiner's refund;
        // continue this booking's refund below.
        console.error("[cancel-trip] payout reconciliation flag failed:", booking.id, reconciliationFlagError);
        Sentry.captureException(reconciliationFlagError, {
          extra: { context: "cancel-trip-payout-reconciliation-flag-failed", bookingId: booking.id, tripId: trip.id, payoutId: booking.payout_id },
        });
      }
    }

    // Record a deduction against the organizer when a refund is issued after their payout was already remitted.
    if (booking.payout_status === "remitted" && trip.organizer_id && refundAmount > 0) {
      const { error: deductionError } = await (admin
        .from("organizer_deductions" as "trips")
        .insert({
          organizer_id: trip.organizer_id,
          booking_id: booking.id,
          amount: downpaymentRefund ?? refundAmount,
          reason: "Trip cancelled by organizer - refund after payout remitted",
          status: "pending",
        } as never) as unknown as Promise<{ error: { message: string } | null }>);
      if (deductionError) {
        console.error("[deduction] failed to record organizer deduction", booking.id, deductionError.message);
        Sentry.captureException(new Error(deductionError.message), {
          extra: { context: "cancel-trip-deduction-insert-failed", bookingId: booking.id, tripId: trip.id, organizerId: trip.organizer_id },
        });
      }
    }

    // Stage 5e: reverse any organizer credit for this booking. The base deduction
    // above claws back only the downpayment; the online balance is owned by the
    // credit ledger, so reverseBookingCredit voids/shrinks/offsets the credit
    // against the balance actually refunded to the joiner (balanceRefund).
    if (trip.organizer_id) {
      const creditReversal = await reverseBookingCredit(admin, booking.id, trip.organizer_id, balanceRefund);
      if (creditReversal.error) {
        console.error("[credit-reversal] failed to reverse organizer credit", booking.id, creditReversal.error);
        await sendAdminAlert(
          "Action needed: failed to reverse organizer credit on trip cancellation",
          `
                <p>A booking with an active organizer credit was cancelled (trip cancelled by organizer), but reversing the credit (void/shrink/offset) failed. The organizer may be over- or under-paid until this is corrected manually.</p>
                <p><strong>Booking ID:</strong> ${booking.id}</p>
                <p><strong>Action reached:</strong> ${creditReversal.action.kind}</p>
                <p><strong>Error:</strong> ${escapeHtml(creditReversal.error)}</p>
              `,
        );
      } else if (creditReversal.action.kind === "document") {
        await sendAdminAlert(
          "Action needed: organizer credit applied into an undisbursed payout flagged for review",
          `
                <p>A booking was cancelled (trip cancelled by organizer) whose balance credit had already been applied into an organizer payout that has not yet been disbursed. The payout has been flagged for reconciliation; please review and adjust it before it is remitted.</p>
                <p><strong>Booking ID:</strong> ${booking.id}</p>
              `,
        );
      }
    }

    let initialResult: RefundResult | null = null;
    let balanceResult: RefundResult | null = null;

    if (booking.paymongo_payment_id) {
      initialResult = await issueAndRecordRefund({
        admin,
        bookingId: booking.id,
        source: "downpayment",
        paymentId: booking.paymongo_payment_id,
        paymentMethod: booking.payment_method,
        amountPesos: downpaymentRefundAmount,
        notes: 'Organizer cancelled trip',
      });
      if (initialResult && !initialResult.success) {
        if (!initialResult.requiresManualProcessing) {
          console.error('[refund] cancelTrip initial refund failed', booking.id, initialResult.error);
          Sentry.captureException(new Error(initialResult.error ?? "cancelTrip initial refund failed"), {
            extra: { context: "cancel-trip-initial-refund-failed", bookingId: booking.id, tripId: trip.id },
          });
        }
        manualRefundList.push({ id: booking.id, full_name: booking.full_name, email: booking.email, amount: downpaymentRefundAmount });
      }
    }

    if (balanceRefund > 0 && booking.balance_paymongo_payment_id) {
      balanceResult = await issueAndRecordRefund({
        admin,
        bookingId: booking.id,
        source: "balance",
        paymentId: booking.balance_paymongo_payment_id,
        paymentMethod: booking.payment_method,
        amountPesos: balanceRefund,
        notes: 'Organizer cancelled trip - balance refund',
      });
      if (balanceResult && !balanceResult.success) {
        if (!balanceResult.requiresManualProcessing) {
          console.error('[refund] cancelTrip balance refund failed', booking.id, balanceResult.error);
          Sentry.captureException(new Error(balanceResult.error ?? "cancelTrip balance refund failed"), {
            extra: { context: "cancel-trip-balance-refund-failed", bookingId: booking.id, tripId: trip.id },
          });
        }
        if (!manualRefundList.some((b) => b.id === booking.id)) {
          manualRefundList.push({ id: booking.id, full_name: booking.full_name, email: booking.email, amount: balanceRefund });
        }
      }
    }

    refundResultMap.set(booking.id, { initial: initialResult, balance: balanceResult });
  }));

  refundSettlements.forEach((settlement, index) => {
    if (settlement.status === "rejected") {
      console.error("[cancel-trip] refund settlement rejected", (bookings ?? [])[index]?.id, settlement.reason);
      Sentry.captureException(settlement.reason ?? new Error("cancelTrip refund settlement rejected with no reason"), {
        extra: { context: "cancel-trip-refund-settlement-rejected", bookingId: (bookings ?? [])[index]?.id, tripId: trip.id },
      });
    }
  });

  await sendInChunks(bookings ?? [], async (booking) => {
    const bookingRefundResults = refundResultMap.get(booking.id);
    // Gate the refund copy on whether a refund is ACTUALLY being issued for this
    // booking (a real PayMongo payment id exists to refund against), not on the
    // quoted amount. See cancellationRefundLine for the never-paid rationale.
    const refundLine = cancellationRefundLine(booking, bookingRefundResults, fmtCurrency);
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: booking.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Trip cancelled: ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(booking.full_name)},</p>
          <p>We're sorry to inform you that <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been cancelled by the organizer.</p>
          ${refundLine}
          <p>We hope to see you on a future trip!</p>
          <p>Sama</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to notify booking cancellation", booking.id, err);
      Sentry.captureException(err, {
        extra: { context: "cancel-trip-booking-email-failed", bookingId: booking.id, tripId: trip.id },
      });
    }
  });

  await sendInChunks(waitlistEntries ?? [], async (entry) => {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: entry.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Trip cancelled: ${trip.title}`,
        html: `
          <p>Hi ${escapeHtml(entry.full_name)},</p>
          <p><strong>${escapeHtml(trip.title)}</strong> on ${tripDate} has been cancelled by the organizer.</p>
          <p>If you have questions, please contact <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>
          <p>Sama</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to notify waitlist cancellation", entry.id, err);
      Sentry.captureException(err, {
        extra: { context: "cancel-trip-waitlist-email-failed", waitlistEntryId: entry.id, tripId: trip.id },
      });
    }
  });

  // Send consolidated manual refund alert if any bookings couldn't be automatically refunded.
  if (manualRefundList.length > 0) {
    const rows = manualRefundList
      .map((b) => `<li>Booking ${b.id}, ${escapeHtml(b.full_name)} (${escapeHtml(b.email)}): ${fmtCurrency(b.amount)}</li>`)
      .join('\n');
    await sendAdminAlert(
      `[Admin] Manual refunds required: ${escapeHtml(trip.title)}`,
      `
            <p>The following bookings for <strong>${escapeHtml(trip.title)}</strong> could not be automatically refunded (QR Ph payments or API errors). Please process these manually:</p>
            <ul>${rows}</ul>
            <p>Sama System</p>
          `,
    );
  }

  // Notify admin.
  await sendAdminAlert(
    `[Admin] Trip cancelled: ${escapeHtml(trip.title)}`,
    `
          <p>Organizer <strong>${escapeHtml(organizer.full_name ?? user.email ?? "Unknown")}</strong> cancelled <strong>${escapeHtml(trip.title)}</strong> scheduled for ${tripDate}.</p>
          <p>${(bookings ?? []).length} participant${(bookings ?? []).length !== 1 ? "s were" : " was"} affected and notified.</p>
          <p>Sama System</p>
        `,
  );

  revalidatePath("/trips");
  revalidatePath("/organizer/dashboard");
  revalidatePath(`/trips/${tripSlug}`);
  redirect("/organizer/dashboard");
}
