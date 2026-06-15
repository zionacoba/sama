import { createClient } from "jsr:@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

const MAX_ATTEMPTS = 5;
const BATCH_LIMIT = 50;

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

type RefundRow = {
  id: number;
  booking_id: number;
  source: string;
  payment_id: string | null;
  amount: number;
  status: string;
  reason: string | null;
  attempts: number | null;
};

// Record a failed attempt. Computes the next attempt count and decides the
// failure status: at MAX_ATTEMPTS the row lands in the final 'exhausted' state
// (queryable, excluded from future retries) rather than dropping silently out
// of the select. When a row crosses into 'exhausted' we fire an admin alert so
// an operator can process the refund manually in the PayMongo dashboard.
// Sentry is not available in the Deno edge runtime, so the admin email +
// console.error is the alert channel here. Returns true if the row became
// exhausted on this attempt.
async function recordFailure(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  row: RefundRow,
  lastError: string,
): Promise<boolean> {
  const nextAttempts = (row.attempts ?? 0) + 1;
  const exhausted = nextAttempts >= MAX_ATTEMPTS;
  const status = exhausted ? "exhausted" : "failed";

  await supabase
    .from("refunds")
    .update({ status, attempts: nextAttempts, last_error: lastError })
    .eq("id", row.id);

  if (exhausted) {
    console.error(
      `[retry-failed-refunds] refund ${row.id} exhausted after ${nextAttempts} attempts, manual action needed: ${lastError}`,
    );
    if (ADMIN_EMAIL) {
      try {
        await sendEmail(
          ADMIN_EMAIL,
          "Refund exhausted after max attempts, manual action needed",
          `
            <p>A refund failed ${nextAttempts} times and has been marked <strong>exhausted</strong>. It will not be retried again. Please process it manually in the PayMongo dashboard.</p>
            <p><strong>Refund ID:</strong> ${row.id}</p>
            <p><strong>Booking ID:</strong> ${row.booking_id}</p>
            <p><strong>Source:</strong> ${escapeHtml(row.source)}</p>
            <p><strong>Payment ID:</strong> ${escapeHtml(row.payment_id ?? "(none)")}</p>
            <p><strong>Amount:</strong> ${row.amount}</p>
            <p><strong>Attempts:</strong> ${nextAttempts}</p>
            <p><strong>Last error:</strong> ${escapeHtml(lastError)}</p>
          `,
        );
      } catch (alertErr) {
        console.error(`[retry-failed-refunds] failed to send exhausted alert for refund ${row.id}:`, alertErr);
      }
    }
  }

  return exhausted;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || !token || !constantTimeEqual(token, cronSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const paymongoSecret = Deno.env.get("PAYMONGO_SECRET_KEY");
  if (!paymongoSecret) {
    return new Response(JSON.stringify({ error: "Payment service not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const paymongoAuth = "Basic " + btoa(`${paymongoSecret}:`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only owed/failed rows are retryable. 'manual' (qrph) needs a human;
  // 'processing'/'done' are in flight or settled and must never be re-issued.
  const { data: rows, error } = await supabase
    .from("refunds")
    .select("id, booking_id, source, payment_id, amount, status, reason, attempts")
    .in("status", ["owed", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[retry-failed-refunds] fetch error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let reconciled = 0;
  let issued = 0;
  let failed = 0;
  let exhausted = 0;

  for (const row of (rows ?? []) as RefundRow[]) {
    try {
      if (!row.payment_id) {
        if (await recordFailure(supabase, row, "No payment_id on refund row")) exhausted++;
        else failed++;
        continue;
      }

      // VERIFY BEFORE ISSUE — never blindly re-POST a refund that may already exist.
      // The PayMongo Payment resource carries an `attributes.refunds` array of every
      // refund associated with that payment. If a non-failed refund already exists
      // there, the money is already on its way back; reconcile our row to 'done'
      // instead of issuing a second refund.
      const paymentRes = await fetch(
        `https://api.paymongo.com/v1/payments/${row.payment_id}`,
        { headers: { Authorization: paymongoAuth } },
      );

      if (!paymentRes.ok) {
        // Could not verify. FAIL SAFE: do not issue (risk of double refund).
        // Record the attempt and leave the row for the next run.
        const detail = await paymentRes.text();
        if (
          await recordFailure(
            supabase,
            row,
            `Verify failed: HTTP ${paymentRes.status} ${detail.slice(0, 200)}`,
          )
        ) exhausted++;
        else failed++;
        continue;
      }

      const paymentData = await paymentRes.json();
      const existingRefunds: Array<{ id: string; attributes?: { status?: string } }> =
        paymentData?.data?.attributes?.refunds ?? [];
      const existing = existingRefunds.find(
        (r) => (r?.attributes?.status ?? "") !== "failed",
      );

      if (existing) {
        // A refund already exists at PayMongo — reconcile, do not double-refund.
        await supabase
          .from("refunds")
          .update({
            status: "done",
            paymongo_refund_id: existing.id,
            completed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        reconciled++;
        continue;
      }

      // No refund exists yet — issue it.
      const amountCentavos = Math.round(row.amount * 100);
      const issueRes = await fetch("https://api.paymongo.com/v1/refunds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: paymongoAuth,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: amountCentavos,
              payment_id: row.payment_id,
              reason: row.reason ?? "others",
              notes: "Sama refund retry",
            },
          },
        }),
      });

      const issueData = await issueRes.json();

      if (!issueRes.ok) {
        if (
          await recordFailure(
            supabase,
            row,
            issueData?.errors?.[0]?.detail ?? `Refund failed: HTTP ${issueRes.status}`,
          )
        ) exhausted++;
        else failed++;
        continue;
      }

      await supabase
        .from("refunds")
        .update({
          status: "done",
          paymongo_refund_id: issueData?.data?.id ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      issued++;
    } catch (err) {
      // One row's failure must not abort the batch.
      console.error(`[retry-failed-refunds] error processing refund ${row.id}:`, err);
      try {
        if (await recordFailure(supabase, row, err instanceof Error ? err.message : "Unknown error")) exhausted++;
        else failed++;
      } catch (updateErr) {
        console.error(`[retry-failed-refunds] failed to record error for refund ${row.id}:`, updateErr);
        failed++;
      }
    }
  }

  const total = (rows ?? []).length;
  console.log(
    `[retry-failed-refunds] processed ${total}: reconciled ${reconciled}, issued ${issued}, failed ${failed}, exhausted ${exhausted}`,
  );

  return new Response(
    JSON.stringify({ total, reconciled, issued, failed, exhausted }),
    { headers: { "Content-Type": "application/json" } },
  );
});
