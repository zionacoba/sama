import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || token !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();

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

    await supabase.from("booking_participants").delete().eq("booking_id", booking.id);

    cleaned++;
  }

  console.log(`[cleanup-abandoned-payments] cleaned ${cleaned} of ${(staleBookings ?? []).length} stale bookings`);

  return new Response(JSON.stringify({ cleaned, total: (staleBookings ?? []).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
