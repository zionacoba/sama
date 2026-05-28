import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: staleBookings, error } = await supabase
    .from("bookings")
    .select("id, trip_id, slots")
    .eq("status", "payment_pending")
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
    const { error: slotErr } = await supabase.rpc("restore_slot", {
      p_trip_id: booking.trip_id,
      p_slots_requested: booking.slots,
    });
    if (slotErr) {
      console.error(`[cleanup-abandoned-payments] restore_slot failed for booking ${booking.id}:`, slotErr.message);
      continue;
    }

    const { error: updateErr } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", booking.id);
    if (updateErr) {
      console.error(`[cleanup-abandoned-payments] status update failed for booking ${booking.id}:`, updateErr.message);
      continue;
    }

    cleaned++;
  }

  console.log(`[cleanup-abandoned-payments] cleaned ${cleaned} of ${(staleBookings ?? []).length} stale bookings`);

  return new Response(JSON.stringify({ cleaned, total: (staleBookings ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
