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

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
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

  for (const trip of trips ?? []) {
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, full_name, email, total_amount, amount_due, meeting_point")
      .eq("trip_id", trip.id)
      .eq("status", "confirmed")
      .is("pre_trip_reminder_sent_at", null);

    if (bookingsError) {
      console.error(`[pre-trip-reminder] bookings fetch error for trip ${trip.id}:`, bookingsError.message);
      continue;
    }

    const tripDate = new Intl.DateTimeFormat("en-PH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date(trip.date_start));

    const fmtPHP = (n: number) =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 0,
      }).format(n);

    for (const booking of bookings ?? []) {
      const amountPaid =
        booking.total_amount != null && booking.amount_due != null
          ? booking.total_amount - booking.amount_due
          : booking.total_amount;
      const balance =
        booking.amount_due != null && booking.amount_due > 0 ? booking.amount_due : null;

      const bookingUrl = `${SITE_URL}/profile/bookings/${booking.id}`;

      try {
        await sendEmail(
          booking.email,
          `Your trip is in 3 days — ${trip.title}`,
          `
            <p>Hi ${escapeHtml(booking.full_name)}, your trip is coming up!</p>
            <ul>
              <li><strong>Trip:</strong> ${escapeHtml(trip.title)}</li>
              <li><strong>Date:</strong> ${tripDate}</li>
              ${booking.meeting_point ? `<li><strong>Meeting point:</strong> ${escapeHtml(booking.meeting_point)}</li>` : ""}
              ${amountPaid != null ? `<li><strong>Amount paid:</strong> ${fmtPHP(amountPaid)}</li>` : ""}
              ${balance != null ? `<li><strong>Remaining balance:</strong> ${fmtPHP(balance)}</li>` : ""}
            </ul>
            ${trip.messenger_gc_link ? `<p>Join the group chat to stay updated:<br><a href="${escapeHtml(trip.messenger_gc_link)}">${escapeHtml(trip.messenger_gc_link)}</a></p>` : ""}
            <p><a href="${bookingUrl}">View your booking details</a></p>
            <p>If you have any questions, reply to this email or contact your organizer.</p>
            <p>— The Sama Team</p>
          `,
        );
        await supabase
          .from("bookings")
          .update({ pre_trip_reminder_sent_at: new Date().toISOString() })
          .eq("id", booking.id);
        sent++;
      } catch (err) {
        console.error(`[pre-trip-reminder] failed for booking ${booking.id}:`, err);
        failed++;
      }
    }
  }

  console.log(`[pre-trip-reminder] sent=${sent} failed=${failed} trips=${(trips ?? []).length}`);

  return new Response(JSON.stringify({ sent, failed, trips: (trips ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
