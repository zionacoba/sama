import type { SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { processPayMongoRefund, type RefundResult } from "@/lib/paymongo-refund";

export type RefundSource = "downpayment" | "balance";

/**
 * Issue a PayMongo refund AND durably record it in the `refunds` table.
 *
 * Write-before-call ordering: we insert an `owed` row BEFORE contacting PayMongo,
 * then update it to `done` / `failed` / `manual` after. If the process crashes
 * between the insert and the PayMongo call, the row is left `owed` and the
 * retry-failed-refunds cron will pick it up — so a refund obligation is never
 * silently lost.
 *
 * Idempotency: the `refunds` table has a partial unique index, refunds_one_settled,
 * on (booking_id, source, payment_id, cancellation_marker) WHERE status IN
 * ('processing','done','owed'). The cancellation marker says WHICH cancellation a
 * refund belongs to: 0 for the refund that ends a booking (reject, full cancel,
 * trip cancellation, organizer rejection), and for a partial cancel the booking's
 * slot count BEFORE that cancel, so each partial cancel gets its own refund while
 * a retry of the same cancel collapses onto the first. We first do an explicit
 * settled-row check (an existing 'processing'/'done' row for this exact
 * booking+source+payment+marker means the refund is already handled) and skip
 * issuing a duplicate. The index is the hard backstop for concurrent first-issue
 * callers (we catch 23505), and the retry cron matches a row to its own PayMongo
 * refund by unclaimed id and amount before issuing.
 *
 * The `refunds` table is RLS deny-by-default, so `admin` MUST be the service-role
 * client.
 */
export async function issueAndRecordRefund({
  admin,
  bookingId,
  source,
  paymentId,
  paymentMethod,
  amountPesos,
  cancellationMarker,
  reason = "others",
  notes,
}: {
  admin: SupabaseClient;
  bookingId: number;
  source: RefundSource;
  paymentId: string | null | undefined;
  paymentMethod: string | null | undefined;
  amountPesos: number;
  // Which cancellation this refund belongs to: 0 for a refund that ends the
  // booking; for a partial cancel, the booking's slot count before that cancel.
  cancellationMarker: number;
  reason?: "duplicate" | "fraudulent" | "others";
  notes?: string;
}): Promise<RefundResult | null> {
  // Nothing owed — no obligation to record or issue.
  if (!amountPesos || amountPesos <= 0) return null;

  // Idempotency gate: if a settled or in-flight refund already exists for this
  // exact (booking, source, payment, cancellation), the obligation is already
  // handled. Do not record or issue a duplicate. Report success so caller email
  // copy stays correct.
  let settledQuery = admin
    .from("refunds")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("source", source)
    .eq("cancellation_marker", cancellationMarker)
    .in("status", ["processing", "done"]);
  settledQuery = paymentId
    ? settledQuery.eq("payment_id", paymentId)
    : settledQuery.is("payment_id", null);
  const { data: settled } = await settledQuery.maybeSingle();
  if (settled) {
    return { success: true };
  }

  // Write-before-call: record the obligation as `owed` BEFORE contacting PayMongo.
  const { data: inserted, error: insertError } = await admin
    .from("refunds")
    .insert({
      booking_id: bookingId,
      source,
      payment_id: paymentId ?? null,
      amount: amountPesos,
      cancellation_marker: cancellationMarker,
      status: "owed",
      reason,
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 = unique violation against the partial index backstop: a settled refund
    // already exists for this booking+source+payment+marker. Treat as handled.
    if ((insertError as { code?: string }).code === "23505") {
      return { success: true };
    }
    // Any other bookkeeping failure must not block the customer's money. Fall back
    // to issuing the refund without a recoverable row (logged for investigation).
    console.error(
      "[refund] failed to record refund obligation",
      bookingId,
      source,
      insertError.message,
    );
    Sentry.captureException(insertError, {
      extra: { context: "refund-record-failed", bookingId, source, paymentId, amountPesos },
    });
    return await processPayMongoRefund({ paymentId, paymentMethod, amountPesos, reason, notes });
  }

  const refundRowId = (inserted as { id?: number } | null)?.id;

  const result = await processPayMongoRefund({ paymentId, paymentMethod, amountPesos, reason, notes });

  if (refundRowId != null) {
    if (result.success) {
      await admin
        .from("refunds")
        .update({
          status: "done",
          paymongo_refund_id: result.refundId ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", refundRowId);
    } else if (result.requiresManualProcessing) {
      // qrph and similar: a human must process it. The retry cron skips `manual`.
      await admin
        .from("refunds")
        .update({
          status: "manual",
          last_error: result.error ?? "Requires manual processing",
        })
        .eq("id", refundRowId);
    } else {
      await admin
        .from("refunds")
        .update({
          status: "failed",
          last_error: result.error ?? "Unknown error",
          attempts: 1,
        })
        .eq("id", refundRowId);
      Sentry.captureException(new Error(`Refund issuance failed: ${result.error ?? "Unknown error"}`), {
        extra: { context: "refund-issuance-failed", bookingId, source, paymentId, amountPesos, refundRowId },
      });
    }
  }

  return result;
}
