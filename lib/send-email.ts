import * as Sentry from "@sentry/nextjs";
import { resend } from "@/lib/resend";

type SendPayload = Parameters<typeof resend.emails.send>[0];

/** What an email was about, as ids only: never a name, an email address or a subject. */
export type EmailSendIds = Record<string, string | number | null | undefined>;

/**
 * Send one email through Resend and report whether Resend accepted it.
 *
 * Why this exists (CS-v121 (b)): the Resend SDK reports a refused send (bad key,
 * unverified domain, invalid address, rate limit, daily quota) by RETURNING
 * `{ error }`, not by throwing, so a bare `try { await resend.emails.send() }`
 * treats a refusal as sent. This helper reads the result as well as catching.
 *
 * - The payload goes to Resend unchanged: a call site moves here by wrapping
 *   its existing object, with no change to what is sent.
 * - Never throws: an email must never turn into a failed booking, refund or
 *   payout step. Returns true only when Resend accepted the send.
 * - A refusal or a throw is logged and captured to Sentry under the context
 *   "email-send-failed", tagged with the call site and the ids passed in.
 * - Sentry gets ids only: never the recipient, the subject, or Resend's error
 *   message (which can describe the address). The message goes to the server
 *   log only. The fixed keys are written after the ids so no id can replace them.
 */
export async function sendEmailChecked(site: string, ids: EmailSendIds, payload: SendPayload): Promise<boolean> {
  try {
    const { error } = await resend.emails.send(payload);
    if (error) {
      console.error(`[email] Resend refused ${site}:`, error.name, error.message);
      Sentry.captureException(new Error(`Resend refused email (${site}): ${error.name}`), {
        extra: { ...ids, context: "email-send-failed", site, resendErrorName: error.name, statusCode: error.statusCode },
      });
      return false;
    }
    return true;
  } catch (sendErr) {
    console.error(`[email] failed to send ${site}:`, sendErr);
    Sentry.captureException(sendErr, {
      extra: { ...ids, context: "email-send-failed", site },
    });
    return false;
  }
}
