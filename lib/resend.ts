import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);
export const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Sama <hello@sama.com.ph>";
export const REPLY_TO_ADDRESS = process.env.RESEND_REPLY_TO ?? "hello@sama.com.ph";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sama.com.ph";

export async function sendWelcomeEmail(email: string, firstName: string) {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    replyTo: REPLY_TO_ADDRESS,
    subject: "Welcome to Sama!",
    html: `
      <p>Hi ${firstName},</p>
      <p>You're now part of Sama, the Philippine outdoor adventure marketplace.</p>
      <p>Browse upcoming trips at <a href="${SITE_URL}/trips">sama.com.ph/trips</a> and find your next adventure.</p>
      <p style="margin-top:24px;">
        <a href="${SITE_URL}/trips" style="background:#2d6a4f;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">Browse trips</a>
      </p>
      <p style="margin-top:32px;">See you on the trail,<br>Zion from Sama</p>
    `,
  });
}
