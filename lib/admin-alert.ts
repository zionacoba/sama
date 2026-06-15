import * as Sentry from "@sentry/nextjs";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
if (!process.env.ADMIN_EMAIL) console.warn("[config] ADMIN_EMAIL is not set, admin alerts will be skipped");

/**
 * Send an operator alert to ADMIN_EMAIL. Centralizes the repeated
 * "if (ADMIN_EMAIL) { try { resend.emails.send(...) } catch }" pattern that was
 * copied across the booking, payout, webhook, and confirmation paths.
 *
 * - No-ops when ADMIN_EMAIL is unset.
 * - Sends from the app's standard FROM_ADDRESS / REPLY_TO_ADDRESS.
 * - Never throws: callers are usually already handling a primary failure, so a
 *   failed alert must not propagate. The failure is logged and captured to
 *   Sentry so even an undelivered alert stays observable.
 */
export async function sendAdminAlert(subject: string, html: string): Promise<void> {
  if (!ADMIN_EMAIL) return;
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: ADMIN_EMAIL,
      replyTo: REPLY_TO_ADDRESS,
      subject,
      html,
    });
  } catch (alertErr) {
    console.error("[admin-alert] failed to send admin alert:", alertErr);
    Sentry.captureException(alertErr, {
      extra: { context: "admin-alert-send-failed", subject },
    });
  }
}
