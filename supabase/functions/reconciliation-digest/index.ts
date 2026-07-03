import { createClient } from "jsr:@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

// Daily reconciliation heartbeat (resilience fix L1). Surfaces the same
// money-in-limbo states as the admin Operations tab, emailed to the admin once a
// day. An "all clear" digest is sent on purpose even when every count is zero so
// the absence of problems is confirmed, not indistinguishable from a broken cron.

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";
const SITE_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "https://sama.com.ph";

const LIST_CAP = 20;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDatePH(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
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

// Dead-man's-switch ping. On a fully successful run we ping Healthchecks.io so an
// external monitor alarms if this heartbeat ever goes silent (CRON_SECRET drift,
// unset ADMIN_EMAIL, Resend outage, pg_cron not firing). The ping is additive and
// must never break the digest: a missing URL only warns, and a ping error is caught
// and logged so a monitoring outage cannot fail an otherwise good run.
async function pingDeadMansSwitch(): Promise<void> {
  const url = Deno.env.get("HEALTHCHECK_DIGEST_URL");
  if (!url) {
    console.warn("HEALTHCHECK_DIGEST_URL not set, skipping dead-mans-switch ping");
    return;
  }
  try {
    await fetch(url);
  } catch (err) {
    console.error("[reconciliation-digest] dead-mans-switch ping failed:", err);
  }
}

type RefundRow = {
  id: number;
  booking_id: number;
  source: string;
  amount: number;
  status: string;
  attempts: number | null;
  last_error: string | null;
  created_at: string;
  bookings: { full_name: string | null; email: string | null } | null;
};

type BookingRow = {
  id: number;
  full_name: string | null;
  total_amount: number | null;
  amount_due: number | null;
  created_at: string;
  trips: { title: string | null } | null;
};

// Build an HTML table for a category, capped at LIST_CAP rows with an overflow note.
function renderSection(title: string, count: number, headerCells: string, bodyRows: string): string {
  if (count === 0) {
    return `
      <h3 style="margin:24px 0 8px;font-size:15px;">${escapeHtml(title)} <span style="color:#16a34a;font-weight:normal;">(all clear)</span></h3>
    `;
  }
  return `
    <h3 style="margin:24px 0 8px;font-size:15px;">${escapeHtml(title)} <span style="color:#b91c1c;">(${count})</span></h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead>
        <tr style="background:#44403c;color:#fff;">${headerCells}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${count > LIST_CAP ? `<p style="font-size:12px;color:#78716c;">and ${count - LIST_CAP} more, see the admin Operations tab.</p>` : ""}
  `;
}

function td(content: string): string {
  return `<td style="padding:6px 10px;border-bottom:1px solid #e7e5e4;">${content}</td>`;
}

function th(content: string): string {
  return `<th style="padding:6px 10px;text-align:left;">${content}</th>`;
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

  if (!ADMIN_EMAIL) {
    console.error("[reconciliation-digest] ADMIN_EMAIL not set");
    return new Response(JSON.stringify({ error: "ADMIN_EMAIL not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  // Same three queries the admin Operations tab runs.
  const [refundsRes, stuckRes, balancesRes] = await Promise.all([
    supabase
      .from("refunds")
      .select("id, booking_id, source, amount, status, attempts, last_error, created_at, bookings!refunds_booking_id_fkey(full_name, email)")
      .in("status", ["owed", "failed", "manual", "exhausted"])
      .order("created_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("id, full_name, total_amount, amount_due, created_at, trips!bookings_trip_id_fkey(title)")
      .eq("status", "payment_pending")
      .is("payment_gateway_status", null)
      .lt("created_at", thirtyMinAgo)
      .order("created_at", { ascending: true }),
    supabase
      .from("bookings")
      .select("id, full_name, total_amount, amount_due, created_at, trips!bookings_trip_id_fkey(title)")
      .eq("status", "confirmed")
      .not("balance_payment_id", "is", null)
      .is("balance_payment_gateway_status", null)
      .order("created_at", { ascending: true }),
  ]);

  const firstError = refundsRes.error ?? stuckRes.error ?? balancesRes.error;
  if (firstError) {
    console.error("[reconciliation-digest] query error:", firstError.message);
    return new Response(JSON.stringify({ error: firstError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const refunds = (refundsRes.data ?? []) as unknown as RefundRow[];
  const stuck = (stuckRes.data ?? []) as unknown as BookingRow[];
  const balances = (balancesRes.data ?? []) as unknown as BookingRow[];

  const total = refunds.length + stuck.length + balances.length;

  const refundsHeader = [th("Customer"), th("Amount"), th("Source"), th("Status"), th("Attempts"), th("Age"), th("Last error")].join("");
  const refundsBody = refunds.slice(0, LIST_CAP).map((r) =>
    `<tr>${[
      td(escapeHtml(r.bookings?.full_name ?? `Booking ${r.booking_id}`)),
      td(formatCurrency(Number(r.amount))),
      td(escapeHtml(r.source)),
      td(`<strong>${escapeHtml(r.status)}</strong>`),
      td(String(r.attempts ?? 0)),
      td(formatDatePH(r.created_at)),
      td(escapeHtml((r.last_error ?? "").slice(0, 120))),
    ].join("")}</tr>`
  ).join("");

  const stuckHeader = [th("Customer"), th("Trip"), th("Amount"), th("Age")].join("");
  const stuckBody = stuck.slice(0, LIST_CAP).map((b) =>
    `<tr>${[
      td(escapeHtml(b.full_name ?? `Booking ${b.id}`)),
      td(escapeHtml(b.trips?.title ?? "—")),
      td(formatCurrency(Number(b.amount_due ?? b.total_amount ?? 0))),
      td(formatDatePH(b.created_at)),
    ].join("")}</tr>`
  ).join("");

  const balancesHeader = [th("Customer"), th("Trip"), th("Balance"), th("Age")].join("");
  const balancesBody = balances.slice(0, LIST_CAP).map((b) => {
    const balanceAmount = Number(b.total_amount ?? 0) - Number(b.amount_due ?? 0);
    return `<tr>${[
      td(escapeHtml(b.full_name ?? `Booking ${b.id}`)),
      td(escapeHtml(b.trips?.title ?? "—")),
      td(formatCurrency(balanceAmount)),
      td(formatDatePH(b.created_at)),
    ].join("")}</tr>`;
  }).join("");

  const summaryLine = total === 0
    ? `<p style="color:#16a34a;font-weight:600;">All clear. No money-in-limbo states need attention.</p>`
    : `<p>${total} item${total !== 1 ? "s" : ""} need attention across the categories below.</p>`;

  const html = `
    <p>Hi,</p>
    <p>Daily reconciliation summary for Sama.</p>
    ${summaryLine}
    ${renderSection("Outstanding refunds", refunds.length, refundsHeader, refundsBody)}
    ${renderSection("Stuck pending payments", stuck.length, stuckHeader, stuckBody)}
    ${renderSection("Unconfirmed balances", balances.length, balancesHeader, balancesBody)}
    <p style="margin-top:24px;">Open the <a href="${SITE_URL}/admin?tab=operations">admin Operations tab</a> to review and resolve.</p>
    <p>Sama System</p>
  `;

  const subject = total === 0
    ? "Sama daily reconciliation: all clear"
    : `Sama daily reconciliation: ${total} item${total !== 1 ? "s" : ""} need attention`;

  try {
    await sendEmail(ADMIN_EMAIL, subject, html);
    console.log(`[reconciliation-digest] sent: ${total} item(s) (refunds ${refunds.length}, stuck ${stuck.length}, balances ${balances.length})`);
  } catch (err) {
    console.error("[reconciliation-digest] failed to send digest:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fully successful run: the three queries ran and the digest email was sent.
  // Fire the dead-man's-switch ping LAST, only here, so it can never produce a
  // false all-clear. Every earlier failure path returns before reaching this
  // point and therefore never pings, which is what lets the external monitor
  // alarm on the absence of a ping.
  await pingDeadMansSwitch();

  return new Response(
    JSON.stringify({
      total,
      refunds: refunds.length,
      stuckPending: stuck.length,
      unconfirmedBalances: balances.length,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
