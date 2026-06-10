import { createClient } from "jsr:@supabase/supabase-js@2";

const FROM_ADDRESS = Deno.env.get("RESEND_FROM_EMAIL") ?? "Sama <hello@sama.com.ph>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL")!;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDatePH(date: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

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

  if (!ADMIN_EMAIL) {
    console.error("[stale-application-reminder] ADMIN_EMAIL not set");
    return new Response(JSON.stringify({ error: "ADMIN_EMAIL not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleApplicants, error } = await supabase
    .from("organizers")
    .select("id, full_name, email, created_at")
    .eq("status", "pending")
    .lt("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[stale-application-reminder] fetch error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!staleApplicants || staleApplicants.length === 0) {
    console.log("[stale-application-reminder] no stale applications found");
    return new Response(JSON.stringify({ count: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const rows = staleApplicants
    .map((a) => {
      const daysPending = Math.floor((now - new Date(a.created_at).getTime()) / 86_400_000);
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;">${escapeHtml(a.full_name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;">${escapeHtml(a.email)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;">${formatDatePH(a.created_at)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;">${daysPending} days</td>
      </tr>`;
    })
    .join("");

  const html = `
    <p>Hi Zion,</p>
    <p>The following organizer applications have been pending for over 30 days. Please review and decide whether to approve or reject each one.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead>
        <tr style="background:#44403c;color:#fff;">
          <th style="padding:8px 12px;text-align:left;">Name</th>
          <th style="padding:8px 12px;text-align:left;">Email</th>
          <th style="padding:8px 12px;text-align:left;">Applied</th>
          <th style="padding:8px 12px;text-align:left;">Pending for</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Review them in the <a href="https://sama.com.ph/admin?tab=organizers&orgFilter=pending">admin organizers panel</a>.</p>
    <p>— Sama System</p>
  `;

  try {
    await sendEmail(
      ADMIN_EMAIL,
      `[Admin] ${staleApplicants.length} stale organizer application${staleApplicants.length !== 1 ? "s" : ""} pending review`,
      html,
    );
    console.log(`[stale-application-reminder] alert sent for ${staleApplicants.length} stale application(s)`);
  } catch (err) {
    console.error("[stale-application-reminder] failed to send alert:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ count: staleApplicants.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
