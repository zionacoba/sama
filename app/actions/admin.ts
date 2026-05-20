"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend } from "@/lib/resend";

const ADMIN_EMAIL = "acobapaulzion@gmail.com";

async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) throw new Error("Unauthorized");
}

export async function approveOrganizer(id: string): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: organizer } = await admin
    .from("organizers")
    .select("email, full_name, display_name")
    .eq("id", id)
    .maybeSingle();

  if (!organizer) return;

  await admin.from("organizers").update({ status: "approved" }).eq("id", id);

  try {
    await resend.emails.send({
      from: "Sama <onboarding@resend.dev>",
      to: organizer.email,
      subject: "Your Sama organizer application has been approved!",
      html: `
        <p>Hi ${organizer.full_name},</p>
        <p>Great news — your application to become a Sama organizer has been <strong>approved</strong>!</p>
        <p>You can now log in to your organizer dashboard to create and publish trips:</p>
        <p><a href="https://sama.ph/organizer/dashboard">sama.ph/organizer/dashboard</a></p>
        <p>Welcome to the Sama community. We're excited to have you on board.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch {
    // Email failure is non-fatal
  }

  revalidatePath("/admin/organizers");
}

export async function rejectOrganizer(id: string): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data: organizer } = await admin
    .from("organizers")
    .select("email, full_name")
    .eq("id", id)
    .maybeSingle();

  if (!organizer) return;

  await admin.from("organizers").update({ status: "rejected" }).eq("id", id);

  try {
    await resend.emails.send({
      from: "Sama <onboarding@resend.dev>",
      to: organizer.email,
      subject: "Update on your Sama organizer application",
      html: `
        <p>Hi ${organizer.full_name},</p>
        <p>Thank you for your interest in becoming a Sama organizer.</p>
        <p>After reviewing your application, we're unable to approve it at this time.</p>
        <p>If you have questions or would like to reapply in the future, feel free to reach out to us.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch {
    // Email failure is non-fatal
  }

  revalidatePath("/admin/organizers");
}
