import type { SupabaseClient } from "@supabase/supabase-js";
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
 * Idempotency: the `refunds` table has a partial unique index on
 * (booking_id, source, payment_id) WHERE status IN ('processing','done'). Because
 * a freshly inserted `owed` row is not covered by that predicate, the index alone
 * cannot block a duplicate at insert time, so we first do an explicit settled-row
 * check (any existing 'processing'/'done' row for this exact booking+source+payment
 * means the refund is already handled) and skip issuing a duplicate. The unique
 * index remains a hard backstop (we catch 23505), and the retry cron additionally
 * verifies against PayMongo before issuing.
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
  reason = "others",
  notes,
}: {
  admin: SupabaseClient;
  bookingId: number;
  source: RefundSource;
  paymentId: string | null | undefined;
  paymentMethod: string | null | undefined;
  amountPesos: number;
  reason?: "duplicate" | "fraudulent" | "others";
  notes?: string;
}): Promise<RefundResult | null> {
  // Nothing owed — no obligation to record or issue.
  if (!amountPesos || amountPesos <= 0) return null;

  // Idempotency gate: if a settled or in-flight refund already exists for this
  // exact (booking, source, payment), the obligation is already handled. Do not
  // record or issue a duplicate. Report success so caller email copy stays correct.
  let settledQuery = admin
    .from("refunds")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("source", source)
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
      status: "owed",
      reason,
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 = unique violation against the partial index backstop: a settled refund
    // already exists for this booking+source+payment. Treat as already handled.
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
    }
  }

  return result;
}
