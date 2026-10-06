import { FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { sendEmailChecked } from "@/lib/send-email";
import { escapeHtml } from "@/lib/escape-html";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sama.com.ph";

/**
 * The welcome email a new user gets on first sign-in. Moved here from lib/resend.ts at v131
 * (CS-v121 (b)) so it can go through sendEmailChecked without a circular import.
 * Never throws: a refused or failed send is logged and captured to Sentry by the helper,
 * ids-only. Returns true only when Resend accepted the send.
 */
export async function sendWelcomeEmail(email: string, firstName: string): Promise<boolean> {
  return sendEmailChecked("welcome-email", {}, {
    from: FROM_ADDRESS,
    to: email,
    replyTo: REPLY_TO_ADDRESS,
    subject: "Welcome to Sama!",
    html: `
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>You're now part of Sama, the Philippine outdoor adventure marketplace.</p>
      <p>Browse upcoming trips at <a href="${SITE_URL}/trips">sama.com.ph/trips</a> and find your next adventure.</p>
      <p style="margin-top:24px;">
        <a href="${SITE_URL}/trips" style="background:#2d6a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Browse trips</a>
      </p>
      <p style="margin-top:32px;">See you on the trail,<br>Zion from Sama</p>
    `,
  });
}
