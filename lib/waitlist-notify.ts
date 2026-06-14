import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { sendInChunks } from "@/lib/send-in-chunks";

export type WaitlistTripInfo = {
  title: string;
  slug: string;
  dateStart: string;
};

/**
 * Notify waitlisted members that a slot opened on a trip.
 *
 * Shared by the two genuine "a slot opened" paths: an organizer increasing
 * slots on a previously full trip, and a booking cancellation freeing a slot.
 * Both call this so both are rate-limit-safe (sent via sendInChunks).
 *
 * Behavior preserved from the prior inline copies:
 *  - 12-hour per-member debounce, driven entirely by notified_at (never reset
 *    notified=false). Only members never notified, or last notified more than
 *    12 hours ago, are emailed, so a cancel/rebook loop can never double-blast.
 *  - Mark notified/notified_at ONLY for members whose send actually succeeded.
 *    A failed send must not stamp notified_at, otherwise the debounce would make
 *    them miss this opening; they stay eligible for the next notification.
 */
export async function notifyWaitlistSlotOpened(
  tripId: number,
  tripInfo: WaitlistTripInfo,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  const { data: waitlistEntries } = await admin
    .from("waitlist")
    .select("id, full_name, email")
    .eq("trip_id", tripId)
    .or(`notified_at.is.null,notified_at.lt.${twelveHoursAgo}`)
    .order("created_at", { ascending: true });

  if (!waitlistEntries || waitlistEntries.length === 0) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";
  const slotTripDate = new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(tripInfo.dateStart));

  const results = await sendInChunks(waitlistEntries, async (entry) => {
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: entry.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `A slot just opened for ${tripInfo.title}`,
        html: `
          <p>Hi ${escapeHtml(entry.full_name)},</p>
          <p>Good news! A spot has opened up for <strong>${escapeHtml(tripInfo.title)}</strong> on ${slotTripDate}. Spots are limited and it's first come, first served, so book before it fills. Book now at <a href="${siteUrl}/trips/${tripInfo.slug}">${siteUrl.replace("https://", "")}/trips/${tripInfo.slug}</a>.</p>
          <p>Sama</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to notify waitlist slot available", entry.id, err);
      throw err;
    }
    return entry.id;
  });

  const sentIds = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

  if (sentIds.length > 0) {
    await admin
      .from("waitlist")
      .update({ notified: true, notified_at: new Date().toISOString() })
      .in("id", sentIds);
  }
}
