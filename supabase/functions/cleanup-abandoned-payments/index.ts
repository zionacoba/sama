import { createClient } from "jsr:@supabase/supabase-js@2";

const FROM_ADDRESS = Deno.env.get("RESEND_FROM_EMAIL") ?? "Sama <hello@sama.com.ph>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to, subject, html, reply_to: "hello@sama.com.ph" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text}`);
  }
}

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

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || !token || !constantTimeEqual(token, cronSecret)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://sama.com.ph";

  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data: staleBookings, error } = await supabase
    .from("bookings")
    .select("id, trip_id, slots")
    .eq("status", "payment_pending")
    .is("payment_gateway_status", null)
    .lt("created_at", cutoff);

  if (error) {
    console.error("[cleanup-abandoned-payments] fetch error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let cleaned = 0;
  let skippedPaid = 0;
  for (const booking of staleBookings ?? []) {
    // Webhook-independent reconciliation. Before cancelling, ask the app to
    // check PayMongo directly for this booking's payment. If the payment went
    // through but the webhook was missed, the route confirms the booking and
    // tells us NOT to cancel. If the route call fails or times out, we FAIL
    // SAFE and leave the booking payment_pending for a future run rather than
    // risk cancelling a paid booking.
    let canCancel = false;
    try {
      const reconcileRes = await fetch(`${siteUrl}/api/internal/reconcile-booking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ bookingId: booking.id }),
      });

      if (reconcileRes.ok) {
        const result = await reconcileRes.json();
        canCancel = result?.canCancel === true;
        if (!canCancel) {
          skippedPaid++;
          console.log(`[cleanup-abandoned-payments] booking ${booking.id} reconciled as paid/uncertain, skipping cancellation`);
        }
      } else {
        // Non-2xx (including the route's fail-safe 502) — do not cancel.
        console.warn(`[cleanup-abandoned-payments] reconcile route returned ${reconcileRes.status} for booking ${booking.id}, leaving pending`);
      }
    } catch (reconcileErr) {
      console.error(`[cleanup-abandoned-payments] reconcile call failed for booking ${booking.id}, leaving pending:`, reconcileErr);
    }

    if (!canCancel) {
      // Either the booking is now paid/confirmed, or we could not verify it.
      // Leave it untouched: do not change status, restore slot, or delete participants.
      continue;
    }

    // Cancel and restore the slot atomically — only if still payment_pending.
    // The RPC flips status to cancelled and restores the slot in one transaction,
    // returning true if it cancelled+restored and false if the booking was no
    // longer payment_pending. This guards against a race where the user completes
    // payment after the 15-min window opens but before we process the row, and
    // removes any rollback-of-rollback (on error, nothing changed).
    const { data: didCancel, error: rpcErr } = await supabase.rpc("cancel_and_restore_slot", {
      p_booking_id: booking.id,
      p_trip_id: booking.trip_id,
      p_slots_requested: booking.slots,
    });

    if (rpcErr) {
      // Atomic, so nothing changed: the booking stays payment_pending and will
      // retry next run. Alert the operator so this does not go unnoticed.
      console.error(`[cleanup-abandoned-payments] cancel_and_restore_slot failed for booking ${booking.id}:`, rpcErr.message);
      if (ADMIN_EMAIL) {
        try {
          await sendEmail(
            ADMIN_EMAIL,
            "Action needed: cleanup-abandoned-payments cancel/restore failed",
            `
              <p>The atomic cancel + slot restore failed for an abandoned-payment booking. Nothing changed (the booking is still payment_pending and will be retried next run), but please verify.</p>
              <p><strong>Booking ID:</strong> ${booking.id}</p>
              <p><strong>Error:</strong> ${escapeHtml(rpcErr.message)}</p>
            `,
          );
        } catch (alertErr) {
          console.error(`[cleanup-abandoned-payments] failed to send admin alert for booking ${booking.id}:`, alertErr);
        }
      }
      continue;
    }

    if (didCancel === false) {
      // Booking already transitioned out of payment_pending (user paid or already
      // cancelled by another path) — nothing to do.
      console.log(`[cleanup-abandoned-payments] booking ${booking.id} no longer payment_pending, skipping`);
      continue;
    }

    // Cancelled and slot restored atomically — clean up participants.
    await supabase.from("booking_participants").delete().eq("booking_id", booking.id);

    cleaned++;
  }

  console.log(`[cleanup-abandoned-payments] cleaned ${cleaned} of ${(staleBookings ?? []).length} stale bookings (skipped ${skippedPaid} paid/unverified)`);

  // Balance reconciliation sweep. A balance payment is confirmed only by its
  // own webhook; if that webhook is dropped the booking stays confirmed but the
  // balance is never marked collected. For each confirmed booking that has a
  // balance link but no balance gateway status, ask the app to check PayMongo
  // directly (mode: "balance"). The route confirms it if PayMongo reports paid,
  // and the confirmPaidBalance guard makes this idempotent. Fail-safe: on any
  // error we leave the balance unconfirmed for the next run, never mark it paid.
  let balanceConfirmed = 0;
  const { data: balanceCandidates, error: balanceError } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .not("balance_payment_id", "is", null)
    .is("balance_payment_gateway_status", null);

  if (balanceError) {
    console.error("[cleanup-abandoned-payments] balance candidate fetch error:", balanceError.message);
  }

  for (const booking of balanceCandidates ?? []) {
    try {
      const reconcileRes = await fetch(`${siteUrl}/api/internal/reconcile-booking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ bookingId: booking.id, mode: "balance" }),
      });

      if (reconcileRes.ok) {
        const result = await reconcileRes.json();
        if (result?.confirmed === true && !result?.alreadyPaid) {
          balanceConfirmed++;
          console.log(`[cleanup-abandoned-payments] balance for booking ${booking.id} reconciled as paid`);
        }
      } else {
        console.warn(`[cleanup-abandoned-payments] balance reconcile route returned ${reconcileRes.status} for booking ${booking.id}, leaving unconfirmed`);
      }
    } catch (reconcileErr) {
      console.error(`[cleanup-abandoned-payments] balance reconcile call failed for booking ${booking.id}, leaving unconfirmed:`, reconcileErr);
    }
  }

  console.log(`[cleanup-abandoned-payments] balance sweep: confirmed ${balanceConfirmed} of ${(balanceCandidates ?? []).length} candidate balances`);

  return new Response(
    JSON.stringify({
      cleaned,
      skippedPaid,
      total: (staleBookings ?? []).length,
      balanceConfirmed,
      balanceCandidates: (balanceCandidates ?? []).length,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
