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
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || token !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Find pending bookings older than 24 hours that haven't had a reminder sent.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: pendingBookings, error } = await supabase
    .from("bookings")
    .select("id, full_name, created_at, trip_id")
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .is("reminder_sent_at", null);

  if (error) {
    console.error("[pending-approval-reminder] fetch error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const booking of pendingBookings ?? []) {
    // Fetch trip and organizer details.
    const { data: trip } = await supabase
      .from("trips")
      .select("id, title, slug, date_start, organizer_id")
      .eq("id", booking.trip_id)
      .maybeSingle();

    if (!trip) continue;

    const { data: organizer } = await supabase
      .from("organizers")
      .select("email, full_name")
      .eq("id", trip.organizer_id)
      .maybeSingle();

    if (!organizer?.email) continue;

    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date(trip.date_start));

    const bookingsUrl = `${SITE_URL}/organizer/trips/${trip.slug}/bookings`;

    try {
      await sendEmail(
        organizer.email,
        `Action needed: Pending booking approval for ${trip.title}`,
        `
          <p>Hi ${escapeHtml(organizer.full_name)},</p>
          <p><strong>${escapeHtml(booking.full_name)}</strong> booked <strong>${escapeHtml(trip.title)}</strong> on ${tripDate} and is waiting for your approval.</p>
          <p>Please log in to your dashboard to approve or reject their booking:</p>
          <p><a href="${bookingsUrl}">${bookingsUrl}</a></p>
          <p>— Sama</p>
        `,
      );
      await supabase
        .from("bookings")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", booking.id);
      sent++;
    } catch (err) {
      console.error(`[pending-approval-reminder] failed for booking ${booking.id}:`, err);
      failed++;
    }
  }

  console.log(`[pending-approval-reminder] sent=${sent} failed=${failed} total=${(pendingBookings ?? []).length}`);

  return new Response(JSON.stringify({ sent, failed, total: (pendingBookings ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
