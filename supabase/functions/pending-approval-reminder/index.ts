import { createClient } from "jsr:@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://sama.com.ph";

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || !token || !constantTimeEqual(token, cronSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Initial grace: a booking must have been pending for more than 24 hours
  // before its FIRST reminder, measured against created_at.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Re-send window: nudge again roughly every other day until the booking is
  // resolved. We use 47 hours, not 48, on purpose: the cron runs daily at 09:00
  // UTC, so a strict 48h comparison would land exactly on the boundary and slip
  // the re-send to the third day. 47h makes it reliably re-fire every other day.
  const resendCutoff = new Date(Date.now() - 47 * 60 * 60 * 1000).toISOString();

  // Today's date in Manila (YYYY-MM-DD) for the trip-not-passed guard below.
  // trips.date_start / date_end are date-typed (no time component), so a string
  // compare against this cutoff is exact and matches the Manila date logic used
  // elsewhere (purge-expired-medical-data, pre-trip-reminder).
  const todayManila = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // Find pending bookings past the 24h grace that either have never been
  // reminded or were last reminded more than 47h ago. Bound the page so a
  // single run can never do unbounded work; oldest first.
  const { data: pendingBookings, error } = await supabase
    .from("bookings")
    .select("id, full_name, created_at, trip_id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${resendCutoff}`)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[pending-approval-reminder] fetch error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Batch the trip + organizer lookups instead of querying per booking (N+1).
  // Collect the trip ids from this page, fetch those trips in one query, then
  // collect their organizer ids and fetch those organizers in one query.
  const tripIds = [...new Set((pendingBookings ?? []).map((b) => b.trip_id))];
  const tripMap = new Map<string, { id: string; title: string; slug: string; date_start: string; date_end: string | null; organizer_id: string }>();
  if (tripIds.length > 0) {
    const { data: trips } = await supabase
      .from("trips")
      .select("id, title, slug, date_start, date_end, organizer_id")
      .in("id", tripIds);
    for (const t of trips ?? []) tripMap.set(t.id, t);
  }

  const organizerIds = [...new Set([...tripMap.values()].map((t) => t.organizer_id))];
  const organizerMap = new Map<string, { email: string; full_name: string }>();
  if (organizerIds.length > 0) {
    const { data: organizers } = await supabase
      .from("organizers")
      .select("id, email, full_name")
      .in("id", organizerIds);
    for (const o of organizers ?? []) organizerMap.set(o.id, o);
  }

  let sent = 0;
  let failed = 0;

  for (const booking of pendingBookings ?? []) {
    // Read trip and organizer details from the batched maps.
    const trip = tripMap.get(booking.trip_id);
    if (!trip) continue;

    const organizer = organizerMap.get(trip.organizer_id);
    if (!organizer?.email) continue;

    // Stop nagging once the trip is over. Effective trip end is
    // COALESCE(date_end, date_start) because date_end is null for single-day
    // trips. Keep reminding while the effective end is today or later (Manila).
    const effectiveEnd = (trip.date_end ?? trip.date_start).slice(0, 10);
    if (effectiveEnd < todayManila) continue;

    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date(trip.date_start));

    const bookingsUrl = `${SITE_URL}/organizer/trips/${trip.slug}/bookings`;

    // Atomic claim before send: re-stamp reminder_sent_at to now() guarded by
    // the same "never reminded OR last reminded > 47h ago" predicate as the
    // page query, so only one of two concurrent runs wins the row (the first
    // update moves reminder_sent_at to now(), which no longer matches the
    // predicate for the second). Re-stamping on every send restarts the 47h
    // window. If we did not claim it, another run already sent (or is sending),
    // so skip. On send failure we un-stamp so a genuine failure retries next run.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", booking.id)
      .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${resendCutoff}`)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      await sendEmail(
        organizer.email,
        `Action needed: Pending booking approval for ${trip.title}`,
        `
          <p>Hi ${escapeHtml(organizer.full_name)},</p>
          <p><strong>${escapeHtml(booking.full_name)}</strong> booked <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} and is waiting for your approval.</p>
          <p>Please log in to your dashboard to approve or reject their booking:</p>
          <p><a href="${bookingsUrl}">${bookingsUrl}</a></p>
          <p>Sama</p>
        `,
      );
      sent++;
    } catch (err) {
      // Un-stamp so a real send failure retries next run.
      await supabase
        .from("bookings")
        .update({ reminder_sent_at: null })
        .eq("id", booking.id);
      console.error(`[pending-approval-reminder] failed for booking ${booking.id}:`, err);
      failed++;
    }
  }

  console.log(`[pending-approval-reminder] sent=${sent} failed=${failed} total=${(pendingBookings ?? []).length}`);

  return new Response(JSON.stringify({ sent, failed, total: (pendingBookings ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
