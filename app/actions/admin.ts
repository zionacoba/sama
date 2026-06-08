"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? (() => { throw new Error("ADMIN_EMAIL environment variable is not set"); })();

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
    .select("email, full_name, display_name, status")
    .eq("id", id)
    .maybeSingle();

  if (!organizer) return;

  // Idempotency guard — skip DB write and email if already approved.
  if (organizer.status === "approved") {
    redirect("/admin?tab=organizers");
  }

  await admin.from("organizers").update({ status: "approved" }).eq("id", id);

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: organizer.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: "Your Sama organizer application has been approved!",
      html: `
        <p>Hi ${escapeHtml(organizer.full_name)},</p>
        <p>Great news — your application to become a Sama organizer has been <strong>approved</strong>!</p>
        <p>You can now log in to your organizer dashboard to create and publish trips:</p>
        <p><a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/organizer/dashboard">${(process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph").replace("https://", "")}/organizer/dashboard</a></p>
        <p>Welcome to the Sama community. We're excited to have you on board.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send organizer approval email", err);
  }

  revalidatePath("/admin");
  redirect("/admin?tab=organizers");
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

  // Unpublish all active trips for this organizer.
  const { data: activeTrips } = await admin
    .from("trips")
    .select("id, title, slug")
    .eq("organizer_id", id)
    .eq("status", "active");

  const tripIds = (activeTrips ?? []).map((t) => t.id);

  if (tripIds.length > 0) {
    await admin
      .from("trips")
      .update({ status: "draft" })
      .in("id", tripIds);

    // Fetch and cancel all confirmed/pending/payment_pending bookings for affected trips.
    const { data: affectedBookings } = await admin
      .from("bookings")
      .select("id, email, full_name, trip_id, slots")
      .in("trip_id", tripIds)
      .in("status", ["confirmed", "pending", "payment_pending"]);

    if ((affectedBookings ?? []).length > 0) {
      await admin
        .from("bookings")
        .update({ status: "cancelled" })
        .in("trip_id", tripIds)
        .in("status", ["confirmed", "pending", "payment_pending"]);

      // Restore slots for each cancelled booking.
      for (const booking of affectedBookings ?? []) {
        const { error: slotErr } = await admin.rpc("restore_slot", {
          p_trip_id: booking.trip_id,
          p_slots_requested: booking.slots,
        });
        if (slotErr) {
          console.error(`[rejectOrganizer] restore_slot failed for booking ${booking.id}:`, slotErr.message);
        }
      }
    }

    const tripMap = new Map(
      (activeTrips ?? []).map((t) => [t.id, t]),
    );

    // Notify participants.
    for (const booking of affectedBookings ?? []) {
      const trip = tripMap.get(booking.trip_id);
      if (!trip) continue;
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: booking.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `Important update about your booking: ${trip.title}`,
          html: `
            <p>Hi ${escapeHtml(booking.full_name)},</p>
            <p>We're sorry to inform you that <strong>${escapeHtml(trip.title)}</strong> is no longer available on Sama.</p>
            <p>Your booking has been cancelled and you will receive a <strong>full refund</strong> to your original payment method within 3–5 business days.</p>
            <p>If you have any questions, please contact us at <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>
            <p>We apologise for the inconvenience.</p>
            <p>— The Sama Team</p>
          `,
        });
      } catch (err) {
        console.error("[email] failed to send trip cancellation notice to participant", err);
      }
    }
  }

  // Notify the organizer their account has been rejected and trips unpublished.
  const tripsUnpublishedNote =
    tripIds.length > 0
      ? `<p>As a result, the following trip${tripIds.length > 1 ? "s have" : " has"} been unpublished: <strong>${(activeTrips ?? []).map((t) => escapeHtml(t.title)).join(", ")}</strong>. Participants with confirmed or pending bookings will be notified and issued full refunds.</p>`
      : "";

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: organizer.email,
      replyTo: REPLY_TO_ADDRESS,
      subject: "Update on your Sama organizer application",
      html: `
        <p>Hi ${escapeHtml(organizer.full_name)},</p>
        <p>Thank you for your interest in becoming a Sama organizer.</p>
        <p>After reviewing your application, we're unable to approve it at this time.</p>
        ${tripsUnpublishedNote}
        <p>If you have questions or would like to reapply in the future, feel free to reach out to us.</p>
        <p>— The Sama Team</p>
      `,
    });
  } catch (err) {
    console.error("[email] failed to send organizer rejection email", err);
  }

  revalidatePath("/admin");
  redirect("/admin?tab=organizers");
}

export async function updateCommissionRate(formData: FormData): Promise<void> {
  await requireAdmin();
  const organizerId = formData.get("organizerId") as string;
  const ratePercent = parseFloat(formData.get("ratePercent") as string);

  if (!organizerId || isNaN(ratePercent) || ratePercent < 1 || ratePercent > 20) {
    redirect("/admin?tab=organizers&commissionError=1");
  }

  const rate = Number((ratePercent / 100).toFixed(4));
  const admin = createSupabaseAdminClient();
  await admin.from("organizers").update({ commission_rate: rate }).eq("id", organizerId);

  revalidatePath("/admin");
  redirect("/admin?tab=organizers&_r=" + Date.now());
}

// ─── PAYOUT TYPES ─────────────────────────────────────────────────────────────

export type PendingPayoutOrganizer = {
  organizerId: string;
  displayName: string;
  email: string;
  payoutMethod: string | null;
  gcashNumber: string | null;
  gcashName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  bookings: Array<{
    id: number;
    tripTitle: string;
    tripDate: string;
    participantName: string;
    totalAmount: number;
    platformCommission: number;
    netAmount: number;
    downpaymentOnly: boolean;
  }>;
  totalAmount: number;
  totalCommission: number;
  totalNet: number;
};

export type PendingPayout = {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerEmail: string;
  totalAmount: number;
  platformCommission: number;
  netAmount: number;
  bookingCount: number;
  createdAt: string;
};

export type PayoutHistoryEntry = {
  id: string;
  organizerName: string;
  totalAmount: number;
  platformCommission: number;
  netAmount: number;
  bookingCount: number;
  remittedAt: string;
  remittanceReference: string | null;
  notes: string | null;
  needsReconciliation: boolean;
};

// ─── PAYOUT QUERIES ───────────────────────────────────────────────────────────

export async function getPendingPayouts(): Promise<{
  unpaid: PendingPayoutOrganizer[];
  pending: PendingPayout[];
}> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const today = new Date().toISOString().split("T")[0];

  // Payouts already created but not yet remitted.
  const { data: pendingRaw } = await admin
    .from("payouts" as "trips")
    .select("id, organizer_id, total_amount, platform_commission, net_amount, booking_ids, created_at, organizer:organizers(full_name, display_name, email)")
    .eq("status", "pending")
    .order("created_at", { ascending: false }) as unknown as {
      data: Array<{
        id: string;
        organizer_id: string;
        total_amount: number;
        platform_commission: number;
        net_amount: number;
        booking_ids: number[];
        created_at: string;
        organizer: { full_name: string; display_name: string | null; email: string } | null;
      }> | null;
    };

  const pending: PendingPayout[] = (pendingRaw ?? []).map((p) => ({
    id: p.id,
    organizerId: p.organizer_id,
    organizerName: p.organizer?.display_name ?? p.organizer?.full_name ?? "Unknown",
    organizerEmail: p.organizer?.email ?? "",
    totalAmount: Number(p.total_amount),
    platformCommission: Number(p.platform_commission),
    netAmount: Number(p.net_amount),
    bookingCount: p.booking_ids?.length ?? 0,
    createdAt: p.created_at,
  }));

  // Confirmed bookings from past trips not yet included in any payout.
  const { data: rawBookings } = await admin
    .from("bookings")
    .select("id, full_name, total_amount, amount_due, platform_commission, payment_option, balance_collected, trip:trips!bookings_trip_id_fkey(title, date_start, organizer_id)")
    .eq("status", "confirmed")
    .eq("payout_status", "unpaid") as unknown as {
      data: Array<{
        id: number;
        full_name: string;
        total_amount: number;
        amount_due: number | null;
        platform_commission: number | null;
        payment_option: string;
        balance_collected: boolean;
        trip: { title: string; date_start: string; organizer_id: string } | null;
      }> | null;
    };

  // Include fully-paid bookings and downpayment bookings (even without balance collected)
  // from trips that have already taken place.
  const eligible = (rawBookings ?? []).filter((b) => {
    if (!b.trip?.date_start || b.trip.date_start >= today) return false;
    return b.payment_option === "full" || b.payment_option === "downpayment";
  });

  if (eligible.length === 0) return { unpaid: [], pending };

  const organizerIds = [...new Set(eligible.map((b) => b.trip!.organizer_id))];

  const { data: organizers } = await admin
    .from("organizers")
    .select("id, full_name, display_name, email, payout_method, gcash_number, gcash_name, bank_name, bank_account_number, bank_account_name")
    .in("id", organizerIds);

  const orgMap = new Map((organizers ?? []).map((o) => [o.id, o]));
  const grouped = new Map<string, PendingPayoutOrganizer>();

  for (const b of eligible) {
    const orgId = b.trip!.organizer_id;
    const org = orgMap.get(orgId);
    if (!org) continue;

    if (!grouped.has(orgId)) {
      grouped.set(orgId, {
        organizerId: orgId,
        displayName: org.display_name ?? org.full_name,
        email: org.email,
        payoutMethod: org.payout_method,
        gcashNumber: org.gcash_number,
        gcashName: org.gcash_name,
        bankName: org.bank_name,
        bankAccountNumber: org.bank_account_number,
        bankAccountName: org.bank_account_name,
        bookings: [],
        totalAmount: 0,
        totalCommission: 0,
        totalNet: 0,
      });
    }

    const group = grouped.get(orgId)!;
    const isDownpaymentOnly = b.payment_option === "downpayment" && !b.balance_collected;
    const grossAmount = isDownpaymentOnly ? Number(b.amount_due ?? 0) : Number(b.total_amount);
    const fullCommission = Number(b.platform_commission ?? 0);
    const commission = isDownpaymentOnly && Number(b.total_amount) > 0
      ? Math.round((Number(b.amount_due ?? 0) / Number(b.total_amount)) * fullCommission * 100) / 100
      : fullCommission;
    const net = Math.round((grossAmount - commission) * 100) / 100;

    group.bookings.push({
      id: b.id,
      tripTitle: b.trip!.title,
      tripDate: b.trip!.date_start,
      participantName: b.full_name,
      totalAmount: grossAmount,
      platformCommission: commission,
      netAmount: net,
      downpaymentOnly: isDownpaymentOnly,
    });
    group.totalAmount = Math.round((group.totalAmount + grossAmount) * 100) / 100;
    group.totalCommission = Math.round((group.totalCommission + commission) * 100) / 100;
    group.totalNet = Math.round((group.totalNet + net) * 100) / 100;
  }

  return { unpaid: [...grouped.values()], pending };
}

export async function getPayoutHistory(): Promise<PayoutHistoryEntry[]> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("payouts" as "trips")
    .select("id, total_amount, platform_commission, net_amount, booking_ids, remitted_at, remittance_reference, notes, needs_reconciliation, organizer:organizers(full_name, display_name)")
    .eq("status", "remitted")
    .order("remitted_at", { ascending: false }) as unknown as {
      data: Array<{
        id: string;
        total_amount: number;
        platform_commission: number;
        net_amount: number;
        booking_ids: number[];
        remitted_at: string;
        remittance_reference: string | null;
        notes: string | null;
        needs_reconciliation: boolean;
        organizer: { full_name: string; display_name: string | null } | null;
      }> | null;
    };

  return (data ?? []).map((p) => ({
    id: p.id,
    organizerName: p.organizer?.display_name ?? p.organizer?.full_name ?? "Unknown",
    totalAmount: Number(p.total_amount),
    platformCommission: Number(p.platform_commission),
    netAmount: Number(p.net_amount),
    bookingCount: p.booking_ids?.length ?? 0,
    remittedAt: p.remitted_at,
    remittanceReference: p.remittance_reference,
    notes: p.notes,
    needsReconciliation: p.needs_reconciliation ?? false,
  }));
}

// ─── PAYOUT FORM ACTIONS ──────────────────────────────────────────────────────

export async function createPayoutAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const organizerId = formData.get("organizerId") as string;
  const bookingIdsJson = formData.get("bookingIds") as string;
  if (!organizerId || !bookingIdsJson) redirect("/admin?tab=payouts&payoutError=missing");

  let bookingIds: number[];
  try {
    bookingIds = JSON.parse(bookingIdsJson) as number[];
  } catch {
    redirect("/admin?tab=payouts&payoutError=missing");
  }
  if (!bookingIds.length) redirect("/admin?tab=payouts");

  // Compute totals server-side from the actual booking records.
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, total_amount, amount_due, platform_commission, payment_option, balance_collected")
    .in("id", bookingIds)
    .eq("payout_status", "unpaid")
    .eq("status", "confirmed") as unknown as {
      data: Array<{
        id: number;
        total_amount: number;
        amount_due: number | null;
        platform_commission: number | null;
        payment_option: string;
        balance_collected: boolean;
      }> | null;
    };

  if (!bookings || bookings.length === 0) redirect("/admin?tab=payouts&payoutError=missing");

  const totalAmount = Math.round(bookings.reduce((s, b) => {
    const isDownpaymentOnly = b.payment_option === "downpayment" && !b.balance_collected;
    return s + (isDownpaymentOnly ? Number(b.amount_due ?? 0) : Number(b.total_amount));
  }, 0) * 100) / 100;

  const totalCommission = Math.round(bookings.reduce((s, b) => {
    const isDownpaymentOnly = b.payment_option === "downpayment" && !b.balance_collected;
    const fullCommission = Number(b.platform_commission ?? 0);
    if (isDownpaymentOnly && Number(b.total_amount) > 0) {
      return s + (Number(b.amount_due ?? 0) / Number(b.total_amount)) * fullCommission;
    }
    return s + fullCommission;
  }, 0) * 100) / 100;

  const netAmount = Math.round((totalAmount - totalCommission) * 100) / 100;
  const confirmedIds = bookings.map((b) => b.id);

  const { data: payout, error } = await admin
    .from("payouts" as "trips")
    .insert({
      organizer_id: organizerId,
      booking_ids: confirmedIds,
      total_amount: totalAmount,
      platform_commission: totalCommission,
      net_amount: netAmount,
      status: "pending",
    })
    .select("id")
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (error || !payout) {
    console.error("[createPayout] insert failed:", error?.message);
    redirect("/admin?tab=payouts&payoutError=create");
  }

  await admin
    .from("bookings")
    .update({ payout_status: "included", payout_id: payout.id })
    .in("id", confirmedIds);

  revalidatePath("/admin");
  redirect("/admin?tab=payouts");
}

export async function markPayoutRemittedAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const payoutId = formData.get("payoutId") as string;
  const remittanceReference = (formData.get("remittanceReference") as string)?.trim();
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!payoutId || !remittanceReference) redirect("/admin?tab=payouts&payoutError=missing");

  const { data: payout } = await admin
    .from("payouts" as "trips")
    .select("id, organizer_id, booking_ids, net_amount")
    .eq("id", payoutId)
    .eq("status", "pending")
    .maybeSingle() as unknown as {
      data: { id: string; organizer_id: string; booking_ids: number[]; net_amount: number } | null;
    };

  if (!payout) redirect("/admin?tab=payouts&payoutError=notfound");

  const now = new Date().toISOString();
  const { data: updatedPayout, error: updateError } = await admin
    .from("payouts" as "trips")
    .update({ status: "remitted", remitted_at: now, remittance_reference: remittanceReference, notes, updated_at: now })
    .eq("id", payoutId)
    .eq("status", "pending")
    .select("id")
    .single() as unknown as { data: { id: string } | null; error: unknown };

  if (updateError || !updatedPayout) {
    redirect("/admin?tab=payouts&payoutError=already_remitted");
  }

  await admin
    .from("bookings")
    .update({ payout_status: "remitted" })
    .in("id", payout.booking_ids);

  // Fetch trip date range for the email.
  const { data: tripRows } = await admin
    .from("bookings")
    .select("trip:trips!bookings_trip_id_fkey(date_start)")
    .in("id", payout.booking_ids) as unknown as {
      data: Array<{ trip: { date_start: string } | null }> | null;
    };

  const dates = (tripRows ?? [])
    .map((r) => r.trip?.date_start)
    .filter((d): d is string => !!d)
    .sort();

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
  const fmtDate = (d: string) =>
    new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(d));

  const dateRange = dates.length === 0 ? ""
    : dates[0] === dates[dates.length - 1]
      ? ` from ${fmtDate(dates[0])}`
      : ` from ${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}`;

  const { data: organizer } = await admin
    .from("organizers")
    .select("email, full_name, display_name")
    .eq("id", payout.organizer_id)
    .maybeSingle();

  if (organizer?.email) {
    const name = organizer.display_name ?? organizer.full_name;
    const bookingCount = payout.booking_ids?.length ?? 0;
    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: organizer.email,
        replyTo: REPLY_TO_ADDRESS,
        subject: `Your Sama payout of ${fmt(Number(payout.net_amount))} has been sent`,
        html: `
          <p>Hi ${escapeHtml(name)},</p>
          <p>Your payout of <strong>${fmt(Number(payout.net_amount))}</strong> has been sent.</p>
          <p><strong>Reference:</strong> ${escapeHtml(remittanceReference)}</p>
          <p>This covers <strong>${bookingCount} booking${bookingCount !== 1 ? "s" : ""}${escapeHtml(dateRange)}</strong>.</p>
          ${notes ? `<p><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ""}
          <p>If you have any questions, please reply to this email.</p>
          <p>— The Sama Team</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to send payout remittance email", err);
    }
  }

  revalidatePath("/admin");
  redirect("/admin?tab=payouts");
}
