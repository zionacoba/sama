// Shared email helpers for the Supabase edge functions (Deno runtime).
//
// These functions cannot import from the Node `lib/` tree, so this module is the
// Deno-side equivalent: a single canonical escapeHtml and Resend send helper
// that every edge function imports instead of hand-rolling its own copy.

const FROM_ADDRESS = Deno.env.get("RESEND_FROM_EMAIL") ?? "Sama <hello@sama.com.ph>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

/**
 * Canonical HTML escaper for the edge functions. This matches the version that
 * was duplicated verbatim across all 6 functions: it escapes &, <, >, and ".
 *
 * NOTE: unlike the Node `lib/escape-html.ts` (which also escapes the single
 * quote to &#039;), this edge version intentionally does not, to preserve the
 * exact output the functions have always produced. This is a pure dedup, not a
 * behavior change.
 *
 * A nullish argument returns an empty string and logs, rather than throwing:
 * a throw inside an email template would silently prevent the send, since the
 * per-booking catch swallows it and still returns 200.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) {
    console.error("[escape-html] received a nullish argument");
    return "";
  }

  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send an email through Resend. Mirrors the helper that was copied into each
 * edge function: fixed reply-to of hello@sama.com.ph, from address from
 * RESEND_FROM_EMAIL (falling back to "Sama <hello@sama.com.ph>"), and a throw
 * on any non-2xx response so callers can catch and decide what to do.
 */
export async function sendEmail(to: string, subject: string, html: string) {
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
