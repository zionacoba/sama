import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);
export const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Sama <onboarding@resend.dev>";
