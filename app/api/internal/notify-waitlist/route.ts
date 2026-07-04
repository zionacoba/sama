import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const maxDuration = 60;

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { notifyWaitlistSlotOpened } from "@/lib/waitlist-notify";

function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * Internal, CRON_SECRET-protected waitlist-notification endpoint.
 *
 * Given a trip id, notifies that trip's waitlist that a slot opened. Exists so
 * the cleanup-abandoned-payments edge function (Deno, no access to the Node
 * notify helper) can trigger the same waitlist notification the in-app cancel
 * paths use after it frees a slot. All debounce and send logic lives in
 * notifyWaitlistSlotOpened; this route only authenticates, resolves the trip,
 * and delegates.
 *
 * Response contract (HTTP 200 unless auth/validation fails):
 *   { notified: true }                  -> notify helper ran for the trip
 *   { notified: false, reason: "trip_not_found" } -> trip gone; no-op, not an error
 *   HTTP 502 { notified: false }        -> lookup or notify failed; caller may retry,
 *                                          the 12h debounce keeps retries safe
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!cronSecret || !token || !constantTimeEqual(token, cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { tripId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tripId = body.tripId;
  if (typeof tripId !== "number" || !Number.isFinite(tripId)) {
    return NextResponse.json({ error: "Missing tripId" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: trip, error } = await admin
    .from("trips")
    .select("id, title, slug, date_start")
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    console.error("[notify-waitlist] trip lookup failed:", error.message);
    return NextResponse.json({ notified: false }, { status: 502 });
  }

  if (!trip) {
    // Trip deleted between the slot being freed and this call - nothing to
    // notify about, and not an error worth alarming on.
    return NextResponse.json({ notified: false, reason: "trip_not_found" });
  }

  try {
    await notifyWaitlistSlotOpened(trip.id, {
      title: trip.title,
      slug: trip.slug,
      dateStart: trip.date_start,
    });
    return NextResponse.json({ notified: true });
  } catch (err) {
    console.error("[notify-waitlist] notify failed:", err);
    Sentry.captureException(err, {
      extra: { context: "notify-waitlist-failed", tripId },
    });
    return NextResponse.json({ notified: false }, { status: 502 });
  }
}
