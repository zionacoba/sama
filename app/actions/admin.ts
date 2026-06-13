"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { resend, FROM_ADDRESS, REPLY_TO_ADDRESS } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";
import { processPayMongoRefund, type RefundResult } from "@/lib/paymongo-refund";

if (!process.env.ADMIN_EMAIL) console.warn("[config] ADMIN_EMAIL is not set — admin alerts will be skipped");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";

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
    .select("email, full_name, display_name, status, commission_rate")
    .eq("id", id)
    .maybeSingle();

  if (!organizer) return;

  // Idempotency guard — skip DB write and email if already approved.
  if (organizer.status === "approved") {
    redirect("/admin?tab=organizers");
  }

  await admin.from("organizers").update({ status: "approved" }).eq("id", id);

  // commission_rate is stored as a decimal (e.g. 0.05). Render it as a whole percentage.
  const commissionRatePercent = Math.round((organizer.commission_rate ?? 0.05) * 100);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph";

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
        <p><a href="${siteUrl}/organizer/dashboard">${siteUrl.replace("https://", "")}/organizer/dashboard</a></p>
        <p>Here's how to get started:</p>
        <ol>
          <li>Complete your organizer profile — add a photo, bio, and payout details</li>
          <li>Create your first trip listing</li>
          <li>Share your trip link with your community</li>
        </ol>
        <p>Your platform fee is <strong>${commissionRatePercent}%</strong> per booking, locked in for life as a Founding Partner. Payouts are sent every Tuesday via your preferred payout method.</p>
        <p>If you have any questions, just reply to this email.</p>
        <p>— Sama</p>
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
      .select("id, email, full_name, trip_id, slots, payment_option, amount_due, total_amount, paymongo_payment_id, payment_method, balance_paymongo_payment_id, balance_payment_gateway_status")
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

    // Process refunds for all cancelled bookings before notifying participants.
    const refundResultMap = new Map<number, { initial: RefundResult | null; balance: RefundResult | null }>();
    const manualRefundList: Array<{ id: number; full_name: string; email: string; amount: number }> = [];

    await Promise.allSettled((affectedBookings ?? []).map(async (booking) => {
      const amountPaid =
        booking.payment_option === "downpayment" && booking.amount_due != null
          ? booking.amount_due
          : (booking.total_amount ?? 0);

      let initialResult: RefundResult | null = null;
      let balanceResult: RefundResult | null = null;

      if (booking.paymongo_payment_id) {
        initialResult = await processPayMongoRefund({
          paymentId: booking.paymongo_payment_id,
          paymentMethod: booking.payment_method,
          amountPesos: amountPaid,
          notes: 'Organizer application rejected',
        });
        if (!initialResult.success) {
          if (!initialResult.requiresManualProcessing) {
            console.error('[refund] rejectOrganizer initial refund failed', booking.id, initialResult.error);
          }
          manualRefundList.push({ id: booking.id, full_name: booking.full_name, email: booking.email, amount: amountPaid });
        }
      }

      if (booking.balance_paymongo_payment_id && booking.balance_payment_gateway_status === 'paid') {
        const balanceAmount = (booking.total_amount ?? 0) - (booking.amount_due ?? 0);
        if (balanceAmount > 0) {
          balanceResult = await processPayMongoRefund({
            paymentId: booking.balance_paymongo_payment_id,
            paymentMethod: booking.payment_method,
            amountPesos: balanceAmount,
            notes: 'Organizer application rejected - balance refund',
          });
          if (!balanceResult.success) {
            if (!balanceResult.requiresManualProcessing) {
              console.error('[refund] rejectOrganizer balance refund failed', booking.id, balanceResult.error);
            }
            if (!manualRefundList.some((b) => b.id === booking.id)) {
              manualRefundList.push({ id: booking.id, full_name: booking.full_name, email: booking.email, amount: balanceAmount });
            }
          }
        }
      }

      refundResultMap.set(booking.id, { initial: initialResult, balance: balanceResult });
    }));

    // Alert admin to any bookings that couldn't be automatically refunded.
    if (manualRefundList.length > 0 && ADMIN_EMAIL) {
      const fmtCurrency = (n: number) =>
        new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
      try {
        const rows = manualRefundList
          .map((b) => `<li>Booking ${b.id} — ${escapeHtml(b.full_name)} (${escapeHtml(b.email)}): ${fmtCurrency(b.amount)}</li>`)
          .join('\n');
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: `[Admin] Manual refunds required — organizer ${escapeHtml(organizer.full_name)} rejected`,
          html: `
            <p>The following bookings could not be automatically refunded after organizer <strong>${escapeHtml(organizer.full_name)}</strong> was rejected (QR Ph payments or API errors). Please process these manually:</p>
            <ul>${rows}</ul>
            <p>— Sama System</p>
          `,
        });
      } catch (err) {
        console.error('[email] failed to send manual refund alert for organizer rejection', err);
      }
    }

    // Notify participants — copy reflects whether the refund was automatic or manual.
    for (const booking of affectedBookings ?? []) {
      const trip = tripMap.get(booking.trip_id);
      if (!trip) continue;
      const refundResult = refundResultMap.get(booking.id);
      const initialSucceeded = refundResult?.initial?.success === true;
      const balanceSucceeded = refundResult?.balance?.success === true || !refundResult?.balance;
      const hasPaid = !!booking.paymongo_payment_id;
      const refundLine = !hasPaid
        ? `<p>If you have any questions, please contact us at <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a>.</p>`
        : (initialSucceeded && balanceSucceeded
            ? `<p>A full refund of your payment has been processed and will reflect automatically within 3–5 business days.</p>`
            : (initialSucceeded && !balanceSucceeded
                ? `<p>Your downpayment has been refunded. Your balance payment could not be refunded automatically — Sama will process it manually within 3–5 business days.</p>`
                : `<p>Sama will process your refund manually within 3–5 business days. If you haven't received it after that time, please email <a href="mailto:hello@sama.com.ph">hello@sama.com.ph</a> with your booking reference: <strong>${booking.id}</strong></p>`));
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: booking.email,
          replyTo: REPLY_TO_ADDRESS,
          subject: `Important update about your booking: ${trip.title}`,
          html: `
            <p>Hi ${escapeHtml(booking.full_name)},</p>
            <p>We're sorry to inform you that <strong>${escapeHtml(trip.title)}</strong> is no longer available on Sama.</p>
            <p>Your booking has been cancelled.</p>
            ${refundLine}
            <p>We apologise for the inconvenience.</p>
            <p>— Sama</p>
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
        <p>If you'd like to reapply in the future, you can do so at <a href="${process.env.NEXT_PUBLIC_SITE_URL || "https://sama.com.ph"}/apply">sama.com.ph/apply</a>.</p>
        <p>— Sama</p>
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

export type OrganizerDeduction = {
  id: string;
  bookingId: number;
  amount: number;
  createdAt: string;
};

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
  pendingDeductions: OrganizerDeduction[];
  totalDeductions: number;
  adjustedNet: number;
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
  payoutDestination: {
    payout_method: string | null;
    gcash_number: string | null;
    gcash_name: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
  } | null;
  needsReconciliation: boolean;
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
    .select("id, organizer_id, total_amount, platform_commission, net_amount, booking_ids, created_at, payout_destination, needs_reconciliation, organizer:organizers(full_name, display_name, email)")
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
        payout_destination: PendingPayout["payoutDestination"] | null;
        needs_reconciliation: boolean | null;
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
    payoutDestination: p.payout_destination ?? null,
    needsReconciliation: p.needs_reconciliation ?? false,
  }));

  // Confirmed bookings from past trips not yet included in any payout.
  const { data: rawBookings } = await admin
    .from("bookings")
    .select("id, full_name, total_amount, amount_due, platform_commission, payment_option, balance_collected, trip:trips!bookings_trip_id_fkey(title, date_start, organizer_id)")
    .in("status", ["confirmed", "no_show"])
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

  const [{ data: organizers }, { data: deductionsRaw }] = await Promise.all([
    admin
      .from("organizers")
      .select("id, full_name, display_name, email, payout_method, gcash_number, gcash_name, bank_name, bank_account_number, bank_account_name")
      .in("id", organizerIds),
    admin
      .from("organizer_deductions" as "trips")
      .select("id, organizer_id, booking_id, amount, created_at")
      .in("organizer_id", organizerIds)
      .eq("status", "pending") as unknown as Promise<{
        data: Array<{ id: string; organizer_id: string; booking_id: number; amount: number; created_at: string }> | null;
      }>,
  ]);

  const orgMap = new Map((organizers ?? []).map((o) => [o.id, o]));
  const deductionsByOrg = new Map<string, OrganizerDeduction[]>();
  for (const d of (deductionsRaw ?? [])) {
    if (!deductionsByOrg.has(d.organizer_id)) deductionsByOrg.set(d.organizer_id, []);
    deductionsByOrg.get(d.organizer_id)!.push({
      id: d.id,
      bookingId: d.booking_id,
      amount: Number(d.amount),
      createdAt: d.created_at,
    });
  }

  const grouped = new Map<string, PendingPayoutOrganizer>();

  for (const b of eligible) {
    const orgId = b.trip!.organizer_id;
    const org = orgMap.get(orgId);
    if (!org) continue;

    if (!grouped.has(orgId)) {
      const deductions = deductionsByOrg.get(orgId) ?? [];
      const totalDeductions = Math.round(deductions.reduce((s, d) => s + d.amount, 0) * 100) / 100;
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
        pendingDeductions: deductions,
        totalDeductions,
        adjustedNet: 0,
      });
    }

    const group = grouped.get(orgId)!;
    const isDownpaymentOnly = b.payment_option === "downpayment" && !b.balance_collected;
    const grossAmount = isDownpaymentOnly ? Number(b.amount_due ?? 0) : Number(b.total_amount);
    // platform_commission is the full commission, already deducted from the downpayment. No pro-rating.
    const commission = Number(b.platform_commission ?? 0);
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

  for (const group of grouped.values()) {
    group.adjustedNet = Math.max(0, Math.round((group.totalNet - group.totalDeductions) * 100) / 100);
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

export async function exportPayoutHistoryCSV(): Promise<string> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("payouts" as "trips")
    .select("id, total_amount, platform_commission, net_amount, booking_ids, remitted_at, remittance_reference, needs_reconciliation, payout_destination, organizer:organizers(full_name, display_name)")
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
        needs_reconciliation: boolean;
        payout_destination: {
          payout_method: string | null;
          gcash_number: string | null;
          gcash_name: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_account_name: string | null;
        } | null;
        organizer: { full_name: string; display_name: string | null } | null;
      }> | null;
    };

  function esc(value: string | number | boolean | null | undefined): string {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  type PayoutDestination = { payout_method: string | null; gcash_number: string | null; gcash_name: string | null; bank_name: string | null; bank_account_number: string | null; bank_account_name: string | null } | null;
  function accountDetails(dest: PayoutDestination): string {
    if (!dest) return "";
    if (dest.payout_method === "gcash") {
      return [dest.gcash_number, dest.gcash_name ? `(${dest.gcash_name})` : ""].filter(Boolean).join(" ");
    }
    return [dest.bank_name, dest.bank_account_number, dest.bank_account_name ? `(${dest.bank_account_name})` : ""].filter(Boolean).join(" ");
  }

  const headers = ["Date", "Organizer", "Payout Method", "Account Details", "Gross Amount", "Commission", "Net Amount", "Bookings", "Reference", "Needs Reconciliation"];

  const rows = (data ?? []).map((p) => [
    esc(p.remitted_at.slice(0, 10)),
    esc(p.organizer?.display_name ?? p.organizer?.full_name ?? ""),
    esc(p.payout_destination?.payout_method ?? ""),
    esc(accountDetails(p.payout_destination)),
    esc(Number(p.total_amount)),
    esc(Number(p.platform_commission)),
    esc(Number(p.net_amount)),
    esc(p.booking_ids?.length ?? 0),
    esc(p.remittance_reference),
    esc(p.needs_reconciliation ? "yes" : "no"),
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
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
    .in("status", ["confirmed", "no_show"]) as unknown as {
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

  // platform_commission is the full commission, already deducted from the downpayment. No pro-rating.
  const totalCommission = Math.round(bookings.reduce((s, b) =>
    s + Number(b.platform_commission ?? 0), 0) * 100) / 100;

  const netAmount = Math.round((totalAmount - totalCommission) * 100) / 100;
  const confirmedIds = bookings.map((b) => b.id);

  // Fetch pending deductions and subtract from net amount before remitting.
  const { data: pendingDeductionsRaw } = await (admin
    .from("organizer_deductions" as "trips")
    .select("id, amount")
    .eq("organizer_id", organizerId)
    .eq("status", "pending")
    .order("created_at", { ascending: true }) as unknown as Promise<{
      data: Array<{ id: string; amount: number }> | null;
    }>);

  const pendingDeductions = pendingDeductionsRaw ?? [];
  let remainingNet = netAmount;
  const deductionIdsToApply: string[] = [];
  for (const d of pendingDeductions) {
    const amt = Number(d.amount);
    if (remainingNet >= amt) {
      remainingNet = Math.round((remainingNet - amt) * 100) / 100;
      deductionIdsToApply.push(d.id);
    }
  }
  const adjustedNetAmount = remainingNet;

  // Snapshot payout destination before the atomic creation so the record reflects the state at creation time.
  const { data: orgForSnapshot } = await admin
    .from("organizers")
    .select("payout_method, gcash_number, gcash_name, bank_name, bank_account_number, bank_account_name")
    .eq("id", organizerId)
    .maybeSingle();

  const { data: payoutId, error } = await admin.rpc("create_payout_atomic", {
    p_organizer_id: organizerId,
    p_booking_ids: confirmedIds,
    p_total_amount: totalAmount,
    p_platform_commission: totalCommission,
    p_net_amount: adjustedNetAmount,
  }) as unknown as { data: string | null; error: { message: string } | null };

  if (error || !payoutId) {
    console.error("[createPayout] RPC failed:", error?.message);

    try {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: ADMIN_EMAIL,
        replyTo: REPLY_TO_ADDRESS,
        subject: "Action needed: payout creation failed",
        html: `
          <p>The payout creation RPC failed. No payout was created and the bookings remain unpaid.</p>
          <p><strong>Error:</strong> ${escapeHtml(error?.message ?? "unknown error")}</p>
          <p>Please retry the payout from the admin dashboard or contact support.</p>
        `,
      });
    } catch (alertErr) {
      console.error("[createPayout] failed to send admin alert:", alertErr);
    }
    redirect("/admin?tab=payouts&payoutError=create");
  }

  if (orgForSnapshot) {
    const { error: snapshotError } = await (admin
      .from("payouts" as "trips")
      .update({
        payout_destination: {
          payout_method: orgForSnapshot.payout_method,
          gcash_number: orgForSnapshot.gcash_number,
          gcash_name: orgForSnapshot.gcash_name,
          bank_name: orgForSnapshot.bank_name,
          bank_account_number: orgForSnapshot.bank_account_number,
          bank_account_name: orgForSnapshot.bank_account_name,
        },
      })
      .eq("id", payoutId) as unknown as Promise<{ error: { message: string } | null }>);

    if (snapshotError) {
      console.error("[createPayout] failed to save payout_destination snapshot:", snapshotError.message);
      try {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: ADMIN_EMAIL,
          replyTo: REPLY_TO_ADDRESS,
          subject: "Action needed: payout destination snapshot failed to save",
          html: `
            <p>The payout was created successfully but the destination snapshot failed to save. The payout will show no destination until manually fixed.</p>
            <p><strong>Payout ID:</strong> ${escapeHtml(payoutId)}</p>
            <p><strong>Organizer ID:</strong> ${escapeHtml(organizerId)}</p>
            <p><strong>Error:</strong> ${escapeHtml(snapshotError.message)}</p>
            <p>Please update the payout_destination field manually via the database console.</p>
          `,
        });
      } catch (alertErr) {
        console.error("[createPayout] failed to send snapshot alert:", alertErr);
      }
    }
  }

  // Mark applied deductions now that the payout was created successfully.
  if (deductionIdsToApply.length > 0 && payoutId) {
    const { error: deductionUpdateError } = await (admin
      .from("organizer_deductions" as "trips")
      .update({ status: "applied", applied_payout_id: payoutId } as never)
      .eq("status", "pending")
      .in("id", deductionIdsToApply) as unknown as Promise<{ error: { message: string } | null }>);
    if (deductionUpdateError) {
      console.error("[createPayout] failed to mark deductions as applied:", deductionUpdateError.message);
    }
  }

  revalidatePath("/admin");
  redirect("/admin?tab=payouts");
}

export async function updatePayoutReference(formData: FormData): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const payoutId = formData.get("payoutId") as string;
  const remittanceReference = (formData.get("remittanceReference") as string)?.trim();

  if (!payoutId || !remittanceReference) redirect("/admin?tab=payouts&payoutError=missing");

  const { error } = await (admin
    .from("payouts" as "trips")
    .update({ remittance_reference: remittanceReference })
    .eq("id", payoutId)
    .eq("status", "remitted") as unknown as Promise<{ error: { message: string } | null }>);

  if (error) {
    console.error("[updatePayoutReference] failed:", error.message);
    redirect("/admin?tab=payouts&payoutError=create");
  }

  revalidatePath("/admin");
  redirect("/admin?tab=payouts");
}

// ─── REVIEW ACTIONS ───────────────────────────────────────────────────────────

export type PendingReview = {
  id: number;
  fullName: string | null;
  rating: number;
  body: string;
  createdAt: string;
  tripTitle: string;
  tripSlug: string;
};

export async function getPendingReviews(): Promise<PendingReview[]> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("reviews")
    .select("id, full_name, rating, body, created_at, trips(title, slug)")
    .eq("approved", false)
    .order("created_at", { ascending: false }) as unknown as {
      data: Array<{
        id: number;
        full_name: string | null;
        rating: number;
        body: string;
        created_at: string;
        trips: { title: string; slug: string } | null;
      }> | null;
    };

  return (data ?? []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    rating: r.rating,
    body: r.body,
    createdAt: r.created_at,
    tripTitle: r.trips?.title ?? "Unknown trip",
    tripSlug: r.trips?.slug ?? "",
  }));
}

export async function approveReview(formData: FormData): Promise<void> {
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const reviewId = formData.get("reviewId") as string;
  if (!reviewId) redirect("/admin?tab=reviews");

  await admin
    .from("reviews")
    .update({ approved: true })
    .eq("id", reviewId);

  revalidatePath("/admin");
  revalidatePath("/trips", "layout");
  revalidatePath("/organizers", "layout");
  redirect("/admin?tab=reviews");
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
          <p>— Sama</p>
        `,
      });
    } catch (err) {
      console.error("[email] failed to send payout remittance email", err);
    }
  }

  revalidatePath("/admin");
  redirect("/admin?tab=payouts");
}
