import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_ATTEMPTS = 5;
const BATCH_LIMIT = 50;

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

  for (const row of (rows ?? []) as RefundRow[]) {
    try {
      if (!row.payment_id) {
        await supabase
          .from("refunds")
          .update({
            status: "failed",
            attempts: (row.attempts ?? 0) + 1,
            last_error: "No payment_id on refund row",
          })
          .eq("id", row.id);
        failed++;
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
        await supabase
          .from("refunds")
          .update({
            status: "failed",
            attempts: (row.attempts ?? 0) + 1,
            last_error: `Verify failed: HTTP ${paymentRes.status} ${detail.slice(0, 200)}`,
          })
          .eq("id", row.id);
        failed++;
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
        await supabase
          .from("refunds")
          .update({
            status: "failed",
            attempts: (row.attempts ?? 0) + 1,
            last_error: issueData?.errors?.[0]?.detail ?? `Refund failed: HTTP ${issueRes.status}`,
          })
          .eq("id", row.id);
        failed++;
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
        await supabase
          .from("refunds")
          .update({
            status: "failed",
            attempts: (row.attempts ?? 0) + 1,
            last_error: err instanceof Error ? err.message : "Unknown error",
          })
          .eq("id", row.id);
      } catch (updateErr) {
        console.error(`[retry-failed-refunds] failed to record error for refund ${row.id}:`, updateErr);
      }
      failed++;
    }
  }

  const total = (rows ?? []).length;
  console.log(
    `[retry-failed-refunds] processed ${total}: reconciled ${reconciled}, issued ${issued}, failed ${failed}`,
  );

  return new Response(
    JSON.stringify({ total, reconciled, issued, failed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
