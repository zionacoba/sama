"use server";

import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { DEFAULT_WAIVER_TEXT } from "@/lib/constants";

type ParticipantState = { success: true } | { error: string } | null;

export async function confirmParticipant(
  _prevState: ParticipantState,
  formData: FormData,
): Promise<ParticipantState> {
  const token = formData.get("token") as string;
  const fullName = (formData.get("full_name") as string)?.trim();
  const emergencyContactName = (formData.get("emergency_contact_name") as string)?.trim();
  const emergencyContactPhone = (formData.get("emergency_contact_phone") as string)?.trim();
  const medicalNotes = (formData.get("medical_notes") as string)?.trim() || null;
  const meetingPoint = (formData.get("meeting_point") as string) || null;
  const waiverAccepted = formData.get("waiver_accepted") === "on";

  if (!token) return { error: "Invalid link." };
  if (!fullName || !emergencyContactName || !emergencyContactPhone) {
    return { error: "Please fill in all required fields." };
  }
  if (!waiverAccepted) {
    return { error: "You must accept the waiver to confirm your spot." };
  }

  const admin = createSupabaseAdminClient();

  const { data: participant } = await admin
    .from("booking_participants")
    .select("id, completed, booking_id, waiver_text_snapshot")
    .eq("token", token)
    .maybeSingle();

  if (!participant) return { error: "Invalid or expired link." };

  const { data: booking } = await admin
    .from("bookings")
    .select("status, trip_id")
    .eq("id", participant.booking_id)
    .maybeSingle();

  if (!booking || booking.status === "cancelled") {
    return { error: "This booking has been cancelled." };
  }

  const { data: trip } = await admin
    .from("trips")
    .select("date_start, waiver_text, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip) return { error: "Invalid or expired link." };

  // Action-level past-trip guard (mirrors the other booking actions): block a
  // direct POST after the trip date, not just the page's expired screen.
  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (trip.date_start < todayPH) {
    return { error: "This trip has already taken place, so this form can no longer be completed." };
  }

  // Capture the submitter's IP the same way createBooking does for the booker.
  const requestHeaders = await headers();
  const waiverIp = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? null;

  const updatePayload: Record<string, unknown> = {
    full_name: fullName,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    medical_notes: medicalNotes,
    meeting_point: meetingPoint,
    waiver_accepted: true,
    waiver_accepted_at: new Date().toISOString(),
    waiver_ip: waiverIp,
    completed: true,
  };

  // Snapshot the waiver text only when the row does not already have one. Rows
  // prepped by a transfer (Phase 2) already carry their snapshot and keep it;
  // older rows with no snapshot get one resolved from the live trip text now,
  // matching the page's fallback (trip.waiver_text with [Organizer Name]
  // substituted, or DEFAULT_WAIVER_TEXT).
  if (participant.waiver_text_snapshot == null) {
    const { data: organizer } = trip.organizer_id
      ? await admin
          .from("organizers")
          .select("display_name, full_name")
          .eq("id", trip.organizer_id)
          .maybeSingle()
      : { data: null };
    const organizerName = organizer?.display_name ?? organizer?.full_name ?? null;
    updatePayload.waiver_text_snapshot = ((trip.waiver_text as string | null) ?? DEFAULT_WAIVER_TEXT)
      .replace(/\[Organizer Name\]/gi, organizerName || "the organizer");
  }

  const { data: updated, error } = await admin
    .from("booking_participants")
    .update(updatePayload)
    .eq("id", participant.id)
    .eq("completed", false)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "This waiver has already been submitted." };

  return { success: true };
}
