"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend } from "@/lib/resend";

type JoinWaitlistInput = {
  tripId: number;
  tripSlug: string;
  fullName: string;
  email: string;
  phone: string;
  slots: number;
};

export async function joinWaitlist(
  input: JoinWaitlistInput,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to join the waitlist." };

  const admin = createSupabaseAdminClient();

  const { error } = await admin.from("waitlist").insert({
    trip_id: input.tripId,
    user_id: user.id,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone || null,
    slots: input.slots,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You're already on the waitlist for this trip." };
    }
    return { error: error.message };
  }

  revalidatePath(`/trips/${input.tripSlug}`);
  return { success: true as const };
}

export async function notifyWaitlistEntry(formData: FormData): Promise<void> {
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") return;

  const admin = createSupabaseAdminClient();

  const { data: entry } = await admin
    .from("waitlist")
    .select("id, full_name, email, trips(title, slug, organizer_id)")
    .eq("id", id)
    .maybeSingle();

  if (!entry) return;

  type TripRef = { title: string; slug: string; organizer_id: string };
  const trip = entry.trips as unknown as TripRef | null;
  if (!trip || String(trip.organizer_id) !== String(organizer.id)) return;

  try {
    // TODO: change to entry.email once sama.com.ph is verified in Resend
    await resend.emails.send({
      from: "Sama <onboarding@resend.dev>",
      to: "acobapaulzion@gmail.com",
      subject: `A slot opened up — ${trip.title}`,
      html: `
        <p>Hi ${entry.full_name},</p>
        <p>Good news! A slot has opened up for <strong>${trip.title}</strong>. Book now before it fills up again:</p>
        <p><a href="https://sama.ph/trips/${trip.slug}">sama.ph/trips/${trip.slug}</a></p>
        <p>— The Sama Team</p>
      `,
    });
  } catch {
    // Email failure is non-fatal
  }

  await admin.from("waitlist").update({ notified: true }).eq("id", id);

  revalidatePath(`/organizer/trips/${trip.slug}/bookings`);
}
