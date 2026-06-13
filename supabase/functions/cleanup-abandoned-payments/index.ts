import { createClient } from "jsr:@supabase/supabase-js@2";

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
  for (const booking of staleBookings ?? []) {
    // Cancel atomically — only if still payment_pending.
    // This guards against a race where the user completes payment after the
    // 15-min window opens but before we process the row. Without this guard
    // we could cancel a confirmed booking AND over-restore its slot.
    const { data: cancelledRow, error: cancelErr } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking.id)
      .eq("status", "payment_pending")
      .select("id")
      .maybeSingle();

    if (cancelErr) {
      console.error(`[cleanup-abandoned-payments] cancel failed for booking ${booking.id}:`, cancelErr.message);
      continue;
    }

    if (!cancelledRow) {
      // Booking already transitioned out of payment_pending (user paid or already
      // cancelled by another path) — nothing to restore.
      console.log(`[cleanup-abandoned-payments] booking ${booking.id} no longer payment_pending, skipping`);
      continue;
    }

    // Booking successfully cancelled — now restore the slot.
    const { error: slotErr } = await supabase.rpc("restore_slot", {
      p_trip_id: booking.trip_id,
      p_slots_requested: booking.slots,
    });
    if (slotErr) {
      console.error(`[cleanup-abandoned-payments] restore_slot failed for booking ${booking.id}:`, slotErr.message);
      // Roll back the cancel so the next run can retry the full sequence.
      await supabase
        .from("bookings")
        .update({ status: "payment_pending" })
        .eq("id", booking.id);
      continue;
    }

    await supabase.from("booking_participants").delete().eq("booking_id", booking.id);

    cleaned++;
  }

  console.log(`[cleanup-abandoned-payments] cleaned ${cleaned} of ${(staleBookings ?? []).length} stale bookings`);

  return new Response(JSON.stringify({ cleaned, total: (staleBookings ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
