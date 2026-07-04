import { createClient } from "jsr:@supabase/supabase-js@2";
import { escapeHtml, sendEmail } from "../_shared/email.ts";
import { ESCALATION_THRESHOLD_HOURS, shouldEscalate } from "../_shared/reconcile-escalation.ts";

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

// Dead-man's-switch ping (mirrors reconciliation-digest). On a fully successful
// run we ping Healthchecks.io so an external monitor alarms if this job ever goes
// silent. A `/fail` ping is fired instead when the cancel/restore RPC errors but
// ADMIN_EMAIL is unset, converting a silently-dropped operator alert into an
// external signal. The ping is additive and must never break the job: a missing
// URL only warns, and a ping error is caught and logged so a monitoring outage
// cannot fail an otherwise good run.
async function pingDeadMansSwitch(path = ""): Promise<void> {
  const url = Deno.env.get("HEALTHCHECK_CLEANUP_URL");
  if (!url) {
    console.warn("HEALTHCHECK_CLEANUP_URL not set, skipping dead-mans-switch ping");
    return;
  }
  try {
    await fetch(`${url}${path}`);
  } catch (err) {
    console.error("[cleanup-abandoned-payments] dead-mans-switch ping failed:", err);
  }
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

  const nowMs = Date.now();
  const cutoff = new Date(nowMs - 15 * 60 * 1000).toISOString();

  // Exclude rows already escalated (reconcile_escalated_at set): they have had
  // their one-time alert and must not be retried or re-alerted. reconcile_first_failed_at
  // is selected so we can tell how long a booking has been unverifiable.
  const { data: staleBookings, error } = await supabase
    .from("bookings")
    .select("id, trip_id, slots, reconcile_first_failed_at")
    .eq("status", "payment_pending")
    .is("payment_gateway_status", null)
    .is("reconcile_escalated_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[cleanup-abandoned-payments] fetch error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let cleaned = 0;
  let skippedPaid = 0;
  let escalated = 0;
  // Tracks whether this run had to signal fail (the cancel/restore RPC errored
  // while the ADMIN_EMAIL alert channel was unavailable). If set, the success
  // ping is skipped so the check reads as down, not up.
  const runState = { failed: false };
  for (const booking of staleBookings ?? []) {
    // Strand-forever bound (Shape C). If this booking has been UNVERIFIABLE
    // (PayMongo unreachable, so the reconcile route stamped reconcile_first_failed_at)
    // for over ESCALATION_THRESHOLD_HOURS, stop retrying it. We cannot know whether
    // the joiner paid, so we NEVER cancel it and NEVER free its slot. Instead fire
    // ONE admin escalation alert and mark it escalated (reconcile_escalated_at) so it
    // drops out of this selection on future runs and is never re-alerted. The booking
    // stays payment_pending with its slot held; the daily digest keeps surfacing it
    // until a human resolves it in the PayMongo dashboard.
    if (shouldEscalate(booking.reconcile_first_failed_at, nowMs, ESCALATION_THRESHOLD_HOURS)) {
      if (ADMIN_EMAIL) {
        try {
          await sendEmail(
            ADMIN_EMAIL,
            "Action needed: booking payment unverifiable for over 6 hours",
            `
              <p>A booking's payment could not be verified with PayMongo for over ${ESCALATION_THRESHOLD_HOURS} hours (PayMongo has been unreachable each time we checked). To stay safe we have NOT cancelled it and have NOT freed its slot, because we cannot tell whether the joiner actually paid.</p>
              <p><strong>Booking ID:</strong> ${booking.id}</p>
              <p><strong>First unverifiable at:</strong> ${escapeHtml(String(booking.reconcile_first_failed_at))}</p>
              <p>Please check this booking's payment link in the PayMongo dashboard and resolve it manually: confirm it if it was paid, or cancel and restore the slot if it was not. This booking is still holding its slot.</p>
            `,
          );
        } catch (alertErr) {
          // The alert failed to send. Do NOT mark it escalated, so we retry the
          // alert on the next run rather than silently losing it. Leave the row
          // untouched (still payment_pending, slot held).
          console.error(`[cleanup-abandoned-payments] escalation alert failed for booking ${booking.id}, will retry next run:`, alertErr);
          continue;
        }
      } else {
        // No ADMIN_EMAIL alert channel. Mirror the cancel/restore-failure path:
        // convert the dropped alert into a single external /fail dead-mans-switch
        // signal and leave the booking un-escalated so it is retried once a channel
        // exists. Do NOT mark escalated (that would silently drop the alert).
        console.error(`[cleanup-abandoned-payments] booking ${booking.id} unverifiable over ${ESCALATION_THRESHOLD_HOURS}h but ADMIN_EMAIL unset; cannot escalate`);
        if (!runState.failed) {
          runState.failed = true;
          await pingDeadMansSwitch("/fail");
        }
        continue;
      }

      // Alert sent. Mark escalated so it never re-alerts and drops out of retry.
      // Guarded on reconcile_escalated_at still being null for idempotency.
      const { error: escalateErr } = await supabase
        .from("bookings")
        .update({ reconcile_escalated_at: new Date(nowMs).toISOString() })
        .eq("id", booking.id)
        .is("reconcile_escalated_at", null);
      if (escalateErr) {
        console.error(`[cleanup-abandoned-payments] failed to mark booking ${booking.id} escalated:`, escalateErr.message);
      } else {
        escalated++;
        console.log(`[cleanup-abandoned-payments] booking ${booking.id} unverifiable over ${ESCALATION_THRESHOLD_HOURS}h — escalated to admin, left payment_pending with slot held`);
      }
      continue;
    }

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
      } else {
        // ADMIN_EMAIL unset: the operator alert email cannot be sent. Convert that
        // dropped alert into an external /fail dead-mans-switch signal. One /fail
        // per run is enough, so guard on runState, and mark the run failed so the
        // terminal success ping is suppressed for a run that had to signal fail.
        if (!runState.failed) {
          runState.failed = true;
          await pingDeadMansSwitch("/fail");
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

    // A slot was genuinely freed (didCancel === true), so ask the app to notify
    // this trip's waitlist. Fire-and-forget: a failure here must never break the
    // cleanup loop, and the notify helper's 12-hour per-member debounce makes
    // repeated calls for the same trip in one run (several abandoned bookings on
    // one full trip) safe without any dedupe on this side.
    try {
      const notifyRes = await fetch(`${siteUrl}/api/internal/notify-waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ tripId: booking.trip_id }),
      });
      if (!notifyRes.ok) {
        console.warn(`[cleanup-abandoned-payments] notify-waitlist returned ${notifyRes.status} for trip ${booking.trip_id} (booking ${booking.id}); waitlist will be notified on the next slot event`);
      }
    } catch (notifyErr) {
      console.warn(`[cleanup-abandoned-payments] notify-waitlist call failed for trip ${booking.trip_id} (booking ${booking.id}); waitlist will be notified on the next slot event:`, notifyErr);
    }

    cleaned++;
  }

  console.log(`[cleanup-abandoned-payments] cleaned ${cleaned} of ${(staleBookings ?? []).length} stale bookings (skipped ${skippedPaid} paid/unverified, escalated ${escalated} unverifiable over ${ESCALATION_THRESHOLD_HOURS}h)`);

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
    .is("balance_payment_gateway_status", null)
    .order("created_at", { ascending: true })
    .limit(100);

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

  // Fully successful run: the initial stale-bookings fetch succeeded and both the
  // cleanup loop and balance sweep completed. Fire the dead-man's-switch ping LAST,
  // only here, so the earlier 401/500 returns never ping. Skip it when this run had
  // to signal fail (cancel/restore errored with no ADMIN_EMAIL to alert): a run that
  // fired /fail should read as down, not up.
  if (!runState.failed) {
    await pingDeadMansSwitch();
  }

  return new Response(
    JSON.stringify({
      cleaned,
      skippedPaid,
      escalated,
      total: (staleBookings ?? []).length,
      balanceConfirmed,
      balanceCandidates: (balanceCandidates ?? []).length,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
