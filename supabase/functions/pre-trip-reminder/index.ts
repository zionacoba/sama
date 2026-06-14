import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://sama.com.ph";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FROM_ADDRESS = Deno.env.get("RESEND_FROM_EMAIL") ?? "Sama <hello@sama.com.ph>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html, reply_to: "hello@sama.com.ph" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

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

  // Target date: 3 days from now in Philippine time (Asia/Manila = UTC+8).
  const now = new Date();
  const targetDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const targetDatePH = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(targetDate);

  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("id, title, slug, date_start, messenger_gc_link")
    .eq("date_start", targetDatePH)
    .eq("status", "active");

  if (tripsError) {
    console.error("[pre-trip-reminder] trips fetch error:", tripsError.message);
    return new Response(JSON.stringify({ error: tripsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  const fmtPHP = (n: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(n);

  // Collect candidate bookings across all target trips, bounded to 100 total so
  // a single run can never do unbounded work. Each candidate carries its trip so
  // we can format per-trip details without a second lookup.
  const MAX_BOOKINGS_PER_RUN = 100;
  type TripRow = NonNullable<typeof trips>[number];
  type BookingRow = {
    id: string;
    full_name: string;
    email: string;
    total_amount: number | null;
    amount_due: number | null;
    meeting_point: string | null;
  };
  const candidates: Array<{ trip: TripRow; booking: BookingRow }> = [];

  for (const trip of trips ?? []) {
    if (candidates.length >= MAX_BOOKINGS_PER_RUN) break;
    const remaining = MAX_BOOKINGS_PER_RUN - candidates.length;
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, full_name, email, total_amount, amount_due, meeting_point")
      .eq("trip_id", trip.id)
      .eq("status", "confirmed")
      .is("pre_trip_reminder_sent_at", null)
      .order("created_at", { ascending: true })
      .limit(remaining);

    if (bookingsError) {
      console.error(`[pre-trip-reminder] bookings fetch error for trip ${trip.id}:`, bookingsError.message);
      continue;
    }

    for (const booking of bookings ?? []) {
      candidates.push({ trip, booking: booking as BookingRow });
    }
  }

  // Batch the incomplete-participant lookups: one query for all candidate
  // bookings instead of one per booking, keyed by booking_id into a Map.
  const candidateBookingIds = candidates.map((c) => c.booking.id);
  const participantsMap = new Map<string, Array<{ slot_number: number; token: string }>>();
  if (candidateBookingIds.length > 0) {
    const { data: participants, error: participantsError } = await supabase
      .from("booking_participants")
      .select("booking_id, slot_number, token")
      .in("booking_id", candidateBookingIds)
      .eq("completed", false)
      .order("slot_number", { ascending: true });

    if (participantsError) {
      console.error(`[pre-trip-reminder] participants fetch error:`, participantsError.message);
    }

    for (const p of participants ?? []) {
      const list = participantsMap.get(p.booking_id) ?? [];
      list.push({ slot_number: p.slot_number, token: p.token });
      participantsMap.set(p.booking_id, list);
    }
  }

  for (const { trip, booking } of candidates) {
    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date(trip.date_start));

    const amountPaid =
      booking.total_amount != null && booking.amount_due != null
        ? booking.total_amount - booking.amount_due
        : booking.total_amount;
    const balance =
      booking.amount_due != null && booking.amount_due > 0 ? booking.amount_due : null;

    const bookingUrl = `${SITE_URL}/profile/bookings/${booking.id}`;

    // For multi-slot bookings, surface any participants who still need to
    // complete their details and sign the waiver, with their join links.
    // Read from the batched participants Map instead of querying per booking.
    const incompleteParticipants = participantsMap.get(booking.id);

    const incompleteSection =
      incompleteParticipants && incompleteParticipants.length > 0
        ? `
          <p><strong>Some participants still need to complete their details and sign their waiver before the trip.</strong></p>
          <p>Please forward the right link below to each person as soon as possible:</p>
          <ul>${incompleteParticipants
            .map(
              (p) =>
                `<li>Participant ${p.slot_number + 1}: <a href="${SITE_URL}/join/${p.token}">${SITE_URL}/join/${p.token}</a></li>`,
            )
            .join("")}</ul>
        `
        : "";

    // Atomic claim before send: stamp the sent_at column guarded by .is(null)
    // so only one of two concurrent runs wins the row. If we did not claim it,
    // another run already sent (or is sending), so skip. On send failure we
    // un-stamp so a genuine failure retries next run.
    const { data: claimed } = await supabase
      .from("bookings")
      .update({ pre_trip_reminder_sent_at: new Date().toISOString() })
      .eq("id", booking.id)
      .is("pre_trip_reminder_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    try {
      await sendEmail(
        booking.email,
        `Your trip is in 3 days: ${trip.title}`,
        `
          <p>Hi ${escapeHtml(booking.full_name)}, your trip is coming up!</p>
          <ul>
            <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
            <li><strong>Date:</strong> ${tripDate}</li>
            ${booking.meeting_point ? `<li><strong>Meeting point:</strong> ${escapeHtml(booking.meeting_point)}</li>` : ""}
            ${amountPaid != null ? `<li><strong>Amount paid:</strong> ${fmtPHP(amountPaid)}</li>` : ""}
            ${balance != null ? `<li><strong>Remaining balance:</strong> ${fmtPHP(balance)}</li>` : ""}
          </ul>
          ${incompleteSection}
          ${trip.messenger_gc_link ? `<p>Join the group chat to stay updated:<br><a href="${escapeHtml(trip.messenger_gc_link)}">${escapeHtml(trip.messenger_gc_link)}</a></p>` : ""}
          <p><a href="${bookingUrl}">View your booking details</a></p>
          <p>If you have any questions, reply to this email or contact your organizer.</p>
          <p>Sama</p>
        `,
      );
      sent++;
    } catch (err) {
      // Un-stamp so a real send failure retries next run.
      await supabase
        .from("bookings")
        .update({ pre_trip_reminder_sent_at: null })
        .eq("id", booking.id);
      console.error(`[pre-trip-reminder] failed for booking ${booking.id}:`, err);
      failed++;
    }
  }

  console.log(`[pre-trip-reminder] sent=${sent} failed=${failed} trips=${(trips ?? []).length}`);

  return new Response(JSON.stringify({ sent, failed, trips: (trips ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
