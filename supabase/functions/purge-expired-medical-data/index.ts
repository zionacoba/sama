import { createClient } from "jsr:@supabase/supabase-js@2";

// Data-retention purge: medical and emergency-contact data is only operationally
// relevant up to and shortly after a trip runs. RETENTION_DAYS after a trip ends
// we null the six sensitive columns below. Waiver consent proof, financial/payout
// data, and account basics (name/email/phone) are deliberately KEPT.
const RETENTION_DAYS = 90;

// Page size for the keyset-paginated trips selection. Every eligible trip is
// considered every run; this limit only bounds how many trip ids each page holds
// in memory and passes to the downstream queries.
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

// Dead-man's-switch ping (success-only). On a fully completed run we ping
// Healthchecks.io so an external monitor alarms if this purge ever goes silent
// (CRON_SECRET drift, pg_cron not firing, an unhandled outage). If the purge
// silently stops, expired medical data is retained past its window, which is a
// privacy problem, so this one job earns a monitor even though there is no
// per-item alert path. There is no /fail signal here: the only thing worth
// confirming is that the daily purge ran to completion. The ping is additive and
// must never break the purge: a missing URL only warns, and a ping error is
// caught and logged so a monitoring outage cannot fail an otherwise good run.
async function pingDeadMansSwitch(): Promise<void> {
  const url = Deno.env.get("HEALTHCHECK_PURGE_MEDICAL_URL");
  if (!url) {
    console.warn("HEALTHCHECK_PURGE_MEDICAL_URL not set, skipping dead-mans-switch ping");
    return;
  }
  try {
    await fetch(url);
  } catch (err) {
    console.error("[purge-expired-medical-data] dead-mans-switch ping failed:", err);
  }
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
  //
  // The selection is keyset-paginated on id (ordered ascending, each page resuming after the
  // last id of the previous page) so every eligible trip is considered in a single run. A
  // plain LIMIT with no ORDER BY could return the same already-purged trips every run and
  // starve newer ones once more than TRIP_LIMIT trips are past the retention window.
  let tripsConsidered = 0;
  let bookingsPurged = 0;
  let participantsPurged = 0;
  let lastSeenId: number | null = null;

  while (true) {
    let tripsQuery = supabase
      .from("trips")
      .select("id, date_start, date_end")
      .or(`date_end.lt.${cutoff},and(date_end.is.null,date_start.lt.${cutoff})`);
    if (lastSeenId !== null) {
      tripsQuery = tripsQuery.gt("id", lastSeenId);
    }
    const { data: endedTrips, error: tripsError } = await tripsQuery
      .order("id", { ascending: true })
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
      if (tripsConsidered === 0) {
        console.log("[purge-expired-medical-data] no ended trips past retention window, nothing to purge");
        // A run that finds nothing past the retention window still ran to completion,
        // so it counts as a successful daily purge and must ping. Otherwise the monitor
        // would false-alarm on every quiet day. Reached only after the trips query
        // succeeded; the 401 gate and the trips-fetch 500 both return before here.
        await pingDeadMansSwitch();
        return new Response(
          JSON.stringify({ tripsConsidered: 0, bookingsPurged: 0, participantsPurged: 0 }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      // The previous page was exactly TRIP_LIMIT rows and this one is empty: pagination
      // is exhausted, fall through to the success path with the accumulated totals.
      break;
    }

    lastSeenId = tripIds[tripIds.length - 1];
    tripsConsidered += tripIds.length;

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

    bookingsPurged += (purgedBookings ?? []).length;

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

      participantsPurged += (purgedParticipants ?? []).length;
    }

    // A page shorter than TRIP_LIMIT means the selection is exhausted; skip the extra
    // empty-page round trip.
    if (tripIds.length < TRIP_LIMIT) break;
  }

  console.log(
    `[purge-expired-medical-data] cutoff ${cutoff}: considered ${tripsConsidered} ended trip(s), ` +
      `purged ${bookingsPurged} booking(s) and ${participantsPurged} participant(s)`,
  );

  // Fully successful run: every page's trips query, purge updates, and booking-id
  // fetch all completed. Fire the dead-man's-switch ping LAST, only here, so it can
  // never produce a false all-clear. Every earlier failure path (the 401 gate and
  // each error 500) returns before this point and therefore never pings, which is
  // what lets the external monitor alarm on the absence of a ping.
  await pingDeadMansSwitch();

  return new Response(
    JSON.stringify({
      tripsConsidered,
      bookingsPurged,
      participantsPurged,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
