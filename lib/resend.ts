import { Resend } from "resend";

export const resend = new Resend(process.env.RESEND_API_KEY);
export const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "Sama PH <hello@sama.com.ph>";
export const REPLY_TO_ADDRESS = process.env.RESEND_REPLY_TO ?? "sama.com.ph@gmail.com";
