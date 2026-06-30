import { createClient } from "jsr:@supabase/supabase-js@2";

// Data-retention purge: medical and emergency-contact data is only operationally
// relevant up to and shortly after a trip runs. RETENTION_DAYS after a trip ends
// we null the six sensitive columns below. Waiver consent proof, financial/payout
// data, and account basics (name/email/phone) are deliberately KEPT.
const RETENTION_DAYS = 90;

// Cap per run so a single invocation is bounded. The purge is idempotent (it only
// touches rows that still have data), so any backlog drains over subsequent runs.
const TRIP_LIMIT = 200;

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

  // Cutoff = Manila "today" minus RETENTION_DAYS, as a YYYY-MM-DD string. trips.date_start
  // and trips.date_end are date-typed (no time component), so a string comparison against
  // a YYYY-MM-DD cutoff is exact and matches the Manila date logic used elsewhere
  // (pre-trip-reminder, booking/cancel gates).
  const cutoffSource = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const cutoff = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(cutoffSource);

  // Trips that ended more than RETENTION_DAYS ago. Trip end is COALESCE(date_end, date_start)
  // because date_end is null for single-day trips. PostgREST cannot express a COALESCE in a
  // single filter, so we split it: multi-day trips compare on date_end, single-day trips
  // (date_end IS NULL) compare on date_start.
  const { data: endedTrips, error: tripsError } = await supabase
    .from("trips")
    .select("id, date_start, date_end")
    .or(`date_end.lt.${cutoff},and(date_end.is.null,date_start.lt.${cutoff})`)
    .limit(TRIP_LIMIT);

  if (tripsError) {
    console.error("[purge-expired-medical-data] trips fetch error:", tripsError.message);
    return new Response(JSON.stringify({ error: tripsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tripIds = (endedTrips ?? []).map((t) => t.id);

  if (tripIds.length === 0) {
    console.log("[purge-expired-medical-data] no ended trips past retention window, nothing to purge");
    return new Response(
      JSON.stringify({ tripsConsidered: 0, bookingsPurged: 0, participantsPurged: 0 }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // Null the three medical/emergency columns on bookings for ended trips, but only on rows
  // that still hold any of the data. The "at least one not null" guard keeps re-runs cheap
  // and makes the returned count reflect rows actually changed. We select id back so the
  // count is accurate; no sensitive values are read or logged.
  const { data: purgedBookings, error: bookingsError } = await supabase
    .from("bookings")
    .update({
      medical_notes: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
    })
    .in("trip_id", tripIds)
    .or("medical_notes.not.is.null,emergency_contact_name.not.is.null,emergency_contact_phone.not.is.null")
    .select("id");

  if (bookingsError) {
    console.error("[purge-expired-medical-data] bookings purge error:", bookingsError.message);
    return new Response(JSON.stringify({ error: bookingsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve all booking ids on the ended trips so we can null the matching participant rows.
  // We purge participants for every booking on an ended trip (not just the ones purged above),
  // because a booking's own medical columns may already be null while its participant rows
  // still hold data.
  const { data: tripBookings, error: tripBookingsError } = await supabase
    .from("bookings")
    .select("id")
    .in("trip_id", tripIds);

  if (tripBookingsError) {
    console.error("[purge-expired-medical-data] booking id fetch error:", tripBookingsError.message);
    return new Response(JSON.stringify({ error: tripBookingsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bookingIds = (tripBookings ?? []).map((b) => b.id);

  let participantsPurged = 0;
  if (bookingIds.length > 0) {
    const { data: purgedParticipants, error: participantsError } = await supabase
      .from("booking_participants")
      .update({
        medical_notes: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
      })
      .in("booking_id", bookingIds)
      .or("medical_notes.not.is.null,emergency_contact_name.not.is.null,emergency_contact_phone.not.is.null")
      .select("id");

    if (participantsError) {
      console.error("[purge-expired-medical-data] participants purge error:", participantsError.message);
      return new Response(JSON.stringify({ error: participantsError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    participantsPurged = (purgedParticipants ?? []).length;
  }

  const bookingsPurged = (purgedBookings ?? []).length;

  console.log(
    `[purge-expired-medical-data] cutoff ${cutoff}: considered ${tripIds.length} ended trip(s), ` +
      `purged ${bookingsPurged} booking(s) and ${participantsPurged} participant(s)`,
  );

  return new Response(
    JSON.stringify({
      tripsConsidered: tripIds.length,
      bookingsPurged,
      participantsPurged,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
