"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { processPayMongoRefund, type RefundResult } from "@/lib/paymongo-refund";
import { amountSamaHolds } from "@/lib/booking-finance";

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

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

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
    if (!is_template && cancellation_policy === "custom" && !cancellation_policy_custom) {
      return { error: "Please enter your custom cancellation policy." };
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

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/apply");

  const rawTripId = formData.get("trip_id");
  const tripId = parseInt(rawTripId as string, 10);

  const { data: existing, error: fetchError } = await supabase
    .from("trips")
    .select("id, slug, status, title, organizer_id, total_slots, remaining_slots, date_start, date_end, price, meeting_points, difficulty, payment_type, min_downpayment, photos")
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
        await adminForStorage.storage.from("trip-photos").remove(removedPaths);
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

  if (!isDraft && !is_template && cancellation_policy === "custom" && !cancellation_policy_custom) {
    return { error: "Please enter your custom cancellation policy." };
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

  // Single booking query covers all five edge-case checks below.
  let bookedSlots = 0;
  let activeBookingCount = 0;
  let pendingBalanceCount = 0;
  if (!isDraft && !is_template) {
    const adminForChecks = createSupabaseAdminClient();
    const { data: activeBookings } = await adminForChecks
      .from("bookings")
      .select("slots, amount_due, total_amount")
      .eq("trip_id", tripId)
      .in("status", ["confirmed", "pending", "payment_pending"]);
    bookedSlots = (activeBookings ?? []).reduce((sum, b) => sum + (b.slots ?? 0), 0);
    activeBookingCount = activeBookings?.length ?? 0;
    pendingBalanceCount = (activeBookings ?? []).filter(
      (b) => b.amount_due != null && b.total_amount != null && Number(b.amount_due) < Number(b.total_amount)
    ).length;
  }

  // 1. Block reducing total_slots below confirmed + pending slot sum.
  if (!isDraft && !is_template && total_slots < existing.total_slots) {
    if (total_slots < bookedSlots) {
      return { error: `Cannot reduce total slots below your current confirmed bookings (${bookedSlots} slots booked). Cancel bookings first if you need to reduce capacity.` };
    }
  }

  // 2. Block difficulty change to Advanced while bookings exist.
  if (!isDraft && !is_template && difficulty === "Advanced" && existing.difficulty !== "Advanced" && activeBookingCount > 0) {
    return { error: "Cannot change difficulty to Advanced while confirmed bookings exist. Advanced trips require organizer approval for new bookings, which would create an inconsistent experience for existing participants." };
  }

  // Block moving a trip with active bookings back to draft.
  if (status === "draft" && existing.status === "active") {
    if (activeBookingCount > 0) {
      return { error: "This trip has confirmed bookings and cannot be moved to draft. Cancel the trip instead." };
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

  // 5. Recalculate remaining_slots from actual bookings when total_slots changes.
  let remaining_slots: number;
  if (isDraft || is_template) {
    remaining_slots = existing.remaining_slots ?? 0;
  } else if (total_slots !== existing.total_slots) {
    remaining_slots = Math.max(0, total_slots - bookedSlots);
  } else {
    remaining_slots = existing.remaining_slots ?? 0;
  }

  // Normalise numerics for drafts.
  const safePrice = isDraft && isNaN(price) ? existing.price ?? 0 : price;
  const safeTotalSlots = isDraft && isNaN(total_slots) ? existing.total_slots ?? 0 : total_slots;
  const safeDateStart = is_template ? "2099-12-31" : (isDraft && !date_start ? existing.date_start ?? "2099-12-31" : date_start);
  // Free trips cannot have a downpayment requirement.
  const effectivePaymentType = safePrice === 0 ? "full" : payment_type;
  const effectiveMinDownpayment = safePrice === 0 ? null : min_downpayment;

  const titleChanged = title !== existing.title;
  const startDateChanged = safeDateStart !== existing.date_start;
  let newSlug: string | undefined;
  if (titleChanged || startDateChanged) {
    newSlug = await makeUniqueSlug(buildBaseSlug(title, safeDateStart), supabase, tripId);
    const adminForRedirect = createSupabaseAdminClient();
    await adminForRedirect.from("trip_slug_redirects").upsert(
      { old_slug: existing.slug, new_slug: newSlug, trip_id: tripId },
      { onConflict: "old_slug" }
    );
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
      custom_questions,
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
          weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila",
        }).format(new Date(d));

        const changeLines: string[] = [];
        if (dateChanged) {
          const oldRange = existing.date_end ? `${fmt(existing.date_start)} to ${fmt(existing.date_end)}` : fmt(existing.date_start);
          const newRange = date_end ? `${fmt(date_start)} to ${fmt(date_end)}` : fmt(date_start);
          changeLines.push(`<li><strong>Date:</strong> ${oldRange} → ${newRange}</li>`);
        }
        if (priceChanged) {
          changeLines.push(`<li><strong>Price:</strong> ₱${Number(existing.price).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} → ₱${price.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</li>`);
        }
        if (mpChanged) {
          changeLines.push(`<li><strong>Meeting point:</strong> updated. Check the trip page for details</li>`);
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
                <p>Please review the updated trip details here: <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/trips/${newSlug ?? existing.slug}">${(process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph").replace("https://", "")}/trips/${newSlug ?? existing.slug}</a></p>
                <p>If you have questions, contact <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>
                <p>Sama</p>
              `,
            });
          } catch (err) {
            console.error("[email] failed to notify booking change", booking.id, err);
          }
        }
      }
    }
  }

  // Notify all waitlisted members when the organizer increases slots on a previously full trip
  if (existing.remaining_slots === 0 && remaining_slots > 0) {
    const admin = createSupabaseAdminClient();
    // This slot increase is a genuine opening, so we still notify everyone on
    // the waitlist — but to close the cancel/rebook email-spam loop we debounce
    // per member: only those never notified, or last notified more than 12 hours
    // ago, are emailed. The debounce is driven entirely by notified_at (not a
    // notified=false reset), so notifying twice within 12 hours can never
    // double-blast the same person. Joiners who booked have their waitlist row
    // deleted on booking, so this never emails someone who already has a spot.
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: waitlistEntries } = await admin
      .from("waitlist")
      .select("id, full_name, email")
      .eq("trip_id", tripId)
      .or(`notified_at.is.null,notified_at.lt.${twelveHoursAgo}`)
      .order("created_at", { ascending: true });

    if (waitlistEntries && waitlistEntries.length > 0) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
      const slotTripDate = new Intl.DateTimeFormat("en-PH", {
        month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
      }).format(new Date(safeDateStart));

      await Promise.allSettled(waitlistEntries.map(async (entry) => {
        try {
          await resend.emails.send({
            from: FROM_ADDRESS,
            to: entry.email,
            replyTo: REPLY_TO_ADDRESS,
            subject: `A slot just opened for ${title}`,
            html: `
              <p>Hi ${escapeHtml(entry.full_name)},</p>
              <p>A slot just opened for <strong>${escapeHtml(title)}</strong> on ${slotTripDate}. Spots are limited and it's first come, first served, so book soon. Book now at <a href="${siteUrl}/trips/${existing.slug}">${siteUrl.replace("https://", "")}/trips/${existing.slug}</a>.</p>
              <p>Sama</p>
            `,
          });
        } catch (err) {
          console.error("[email] failed to notify waitlist slot available", entry.id, err);
        }
      }));

      await admin
        .from("waitlist")
        .update({ notified: true, notified_at: new Date().toISOString() })
        .in("id", waitlistEntries.map((e) => e.id));
    }
  }

  // Notify participants with outstanding balances when payment type switches to full.
  if (downpaymentDisabled && pendingBalanceCount > 0) {
    const admin = createSupabaseAdminClient();
    const { data: balanceBookings } = await admin
      .from("bookings")
      .select("id, full_name, email, total_amount, amount_due")
      .eq("trip_id", tripId)
      .in("status", ["confirmed", "pending"]);

    const fmt = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
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

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status, payout_method, gcash_number, bank_account_number")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") return { error: "Not authorized." };

  const { data: tripData } = await supabase
    .from("trips")
    .select("is_template")
    .eq("slug", tripSlug)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  if (tripData?.is_template) {
    return { error: "Templates can't be published directly. Go to your dashboard and create a run from this template to list a specific date." };
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
  | { bookingCount: number; paymongoCount: number; manualCount: number; pendingEarningsNet: number }
> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer) return { error: "Not an organizer." };

  const admin = createSupabaseAdminClient();

  const { data: trip } = await admin
    .from("trips")
    .select("id, organizer_id")
    .eq("slug", tripSlug)
    .maybeSingle();

  if (!trip || String(trip.organizer_id) !== String(organizer.id)) {
    return { error: "Trip not found." };
  }

  const { data: bookings } = await admin
    .from("bookings")
    .select("paymongo_payment_id, status, payout_status, total_amount, amount_due, payment_option, balance_collected, balance_payment_gateway_status, platform_commission")
    .eq("trip_id", trip.id)
    .in("status", ["pending", "confirmed", "payment_pending"]);

  const all = bookings ?? [];
  const bookingCount = all.length;
  const paymongoCount = all.filter((b) => !!b.paymongo_payment_id).length;
  const manualCount = bookingCount - paymongoCount;

  let pendingEarningsNet = 0;
  for (const b of all) {
    if (b.status !== "confirmed" || b.payout_status !== "unpaid") continue;
    // Gross is what Sama actually received online — for downpayment bookings
    // whose balance was collected in cash, that's only the downpayment.
    const gross = amountSamaHolds(b);
    // platform_commission is the full commission, already deducted from the downpayment. No pro-rating.
    const commission = Number(b.platform_commission ?? 0);
    const net = Math.round((gross - commission) * 100) / 100;
    pendingEarningsNet = Math.round((pendingEarningsNet + net) * 100) / 100;
  }

  return { bookingCount, paymongoCount, manualCount, pendingEarningsNet };
}

export async function cancelTrip(tripSlug: string): Promise<{ error: string } | void> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status, full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/apply");

  const admin = createSupabaseAdminClient();

  const { data: trip } = await admin
    .from("trips")
    .select("id, title, date_start, total_slots, organizer_id, status")
    .eq("slug", tripSlug)
    .maybeSingle();

  if (!trip) return { error: "Trip not found." };
  if (String(trip.organizer_id) !== String(organizer.id)) return { error: "You don't have permission to cancel this trip." };
  if (trip.status === "cancelled") return { error: "This trip is already cancelled." };
  if (trip.status !== "active") return { error: "Only active trips can be cancelled." };
  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (trip.date_start < todayPH) return { error: "This trip has already taken place and cannot be cancelled." };

  await admin
    .from("trips")
    .update({ status: "cancelled", remaining_slots: trip.total_slots })
    .eq("id", trip.id);

  // Only refund/notify bookings THIS call actually transitioned. The status-guarded
  // update returns exactly the rows still cancellable at update time, so a booking
  // already cancelled by a concurrent path (partialCancelBooking/cancelBooking) is
  // excluded and never receives a second refund.
  const { data: bookings } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("trip_id", trip.id)
    .in("status", ["pending", "confirmed", "payment_pending"])
    .select("id, full_name, email, total_amount, amount_due, payment_option, paymongo_payment_id, balance_paymongo_payment_id, payment_method, balance_payment_gateway_status");

  const tripDate = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));

  const { data: waitlistEntries } = await admin
    .from("waitlist")
    .select("id, full_name, email")
    .eq("trip_id", trip.id);

  await admin.from("waitlist").delete().eq("trip_id", trip.id);

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);

  // Process refunds — a failed refund never blocks cancellation emails or flow.
  const refundResultMap = new Map<number, { initial: RefundResult | null, balance: RefundResult | null }>();
  const manualRefundList: Array<{ id: number, full_name: string, email: string, amount: number }> = [];

  await Promise.allSettled((bookings ?? []).map(async (booking) => {
    const amountPaid =
      booking.payment_option === "downpayment" && booking.amount_due != null
        ? booking.amount_due
        : (booking.total_amount ?? 0);

    let initialResult: RefundResult | null = null;
    let balanceResult: RefundResult | null = null;

    if (booking.paymongo_payment_id) {
      initialResult = await processPayMongoRefund({
        paymentId: booking.paymongo_payment_id,
        paymentMethod: booking.payment_method,
        amountPesos: amountPaid,
        notes: 'Organizer cancelled trip',
      });
      if (!initialResult.success) {
        if (!initialResult.requiresManualProcessing) {
          console.error('[refund] cancelTrip initial refund failed', booking.id, initialResult.error);
        }
        manualRefundList.push({ id: booking.id, full_name: booking.full_name, email: booking.email, amount: amountPaid });
      }
    }

    if (booking.balance_paymongo_payment_id && booking.balance_payment_gateway_status === 'paid') {
      const balanceAmount = (booking.total_amount ?? 0) - (booking.amount_due ?? 0);
      if (balanceAmount > 0) {
        balanceResult = await processPayMongoRefund({
          paymentId: booking.balance_paymongo_payment_id,
          paymentMethod: booking.payment_method,
          amountPesos: balanceAmount,
          notes: 'Organizer cancelled trip - balance refund',
        });
        if (!balanceResult.success) {
          if (!balanceResult.requiresManualProcessing) {
            console.error('[refund] cancelTrip balance refund failed', booking.id, balanceResult.error);
          }
          if (!manualRefundList.some((b) => b.id === booking.id)) {
            manualRefundList.push({ id: booking.id, full_name: booking.full_name, email: booking.email, amount: balanceAmount });
          }
        }
      }
    }

    refundResultMap.set(booking.id, { initial: initialResult, balance: balanceResult });
  }));

  await Promise.allSettled((bookings ?? []).map(async (booking) => {
    const amountPaid =
      booking.payment_option === "downpayment" && booking.amount_due != null
        ? booking.amount_due
        : (booking.total_amount ?? 0);
    const refundSucceeded = refundResultMap.get(booking.id)?.initial?.success === true;
    const refundLine =
      amountPaid > 0
        ? (refundSucceeded
            ? `<p>A full refund of <strong>${fmtCurrency(amountPaid)}</strong> has been processed and will reflect within 24 hours.</p>`
            : `<p>You will receive a full refund of <strong>${fmtCurrency(amountPaid)}</strong>. Please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> to process your refund within 3 to 5 business days.</p>`)
        : `<p>If you have questions, please contact <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>`;
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
    }
  }));

  await Promise.allSettled((waitlistEntries ?? []).map(async (entry) => {
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
    }
  }));

  // Send consolidated manual refund alert if any bookings couldn't be automatically refunded.
  if (manualRefundList.length > 0) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      try {
        const rows = manualRefundList
          .map((b) => `<li>Booking ${b.id}, ${escapeHtml(b.full_name)} (${escapeHtml(b.email)}): ${fmtCurrency(b.amount)}</li>`)
          .join('\n');
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: adminEmail,
          replyTo: REPLY_TO_ADDRESS,
          subject: `[Admin] Manual refunds required: ${escapeHtml(trip.title)}`,
          html: `
            <p>The following bookings for <strong>${escapeHtml(trip.title)}</strong> could not be automatically refunded (QR Ph payments or API errors). Please process these manually:</p>
            <ul>${rows}</ul>
            <p>Sama System</p>
          `,
        });
      } catch (err) {
        console.error('[email] failed to send manual refund alert for trip cancellation', err);
      }
    }
  }

  // Notify admin.
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: adminEmail,
        replyTo: REPLY_TO_ADDRESS,
        subject: `[Admin] Trip cancelled: ${escapeHtml(trip.title)}`,
        html: `
          <p>Organizer <strong>${escapeHtml(organizer.full_name ?? user.email ?? "Unknown")}</strong> cancelled <strong>${escapeHtml(trip.title)}</strong> scheduled for ${tripDate}.</p>
          <p>${(bookings ?? []).length} participant${(bookings ?? []).length !== 1 ? "s were" : " was"} affected and notified.</p>
          <p>Sama System</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to send admin trip cancellation notification", err);
    }
  }

  revalidatePath("/trips");
  revalidatePath("/organizer/dashboard");
  revalidatePath(`/trips/${tripSlug}`);
  redirect("/organizer/dashboard");
}
