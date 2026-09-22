"use server";

import { headers } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { DEFAULT_WAIVER_TEXT } from "@/lib/constants";
import { withParticipantAdultAttestation } from "@/lib/waiver-snapshot";

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
  const age = (formData.get("age") as string)?.trim();
  const sex = (formData.get("sex") as string)?.trim();
  const homeAddress = (formData.get("home_address") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();

  if (!token) return { error: "Invalid link." };
  if (!fullName || !emergencyContactName || !emergencyContactPhone) {
    return { error: "Please fill in all required fields." };
  }
  if (!waiverAccepted) {
    return { error: "You must accept the waiver, including the confirmation that you are 18 years of age or older, to confirm your spot." };
  }

  const admin = createSupabaseAdminClient();

  const { data: participant, error: participantError } = await admin
    .from("booking_participants")
    .select("id, completed, booking_id, waiver_text_snapshot")
    .eq("token", token)
    .maybeSingle();

  if (participantError) {
    console.error("[confirm-participant] participant fetch failed:", participantError);
    Sentry.captureException(participantError, {
      extra: { context: "confirm-participant-participant-fetch-failed", token },
    });
  }
  if (!participant) return { error: "Invalid or expired link." };

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("status, trip_id")
    .eq("id", participant.booking_id)
    .maybeSingle();

  if (bookingError) {
    console.error("[confirm-participant] booking fetch failed:", bookingError);
    Sentry.captureException(bookingError, {
      extra: { context: "confirm-participant-booking-fetch-failed", participantId: participant.id, bookingId: participant.booking_id, token },
    });
  }
  if (!booking || booking.status === "cancelled") {
    return { error: "This booking has been cancelled." };
  }

  const { data: trip, error: tripError } = await admin
    .from("trips")
    .select("date_start, waiver_text, organizer_id, requires_permit_details")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (tripError) {
    console.error("[confirm-participant] trip fetch failed:", tripError);
    Sentry.captureException(tripError, {
      extra: { context: "confirm-participant-trip-fetch-failed", tripId: booking.trip_id, participantId: participant.id },
    });
  }
  if (!trip) return { error: "Invalid or expired link." };

  // Action-level past-trip guard (mirrors the other booking actions): block a
  // direct POST after the trip date, not just the page's expired screen.
  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  if (trip.date_start < todayPH) {
    return { error: "This trip has already taken place, so this form can no longer be completed." };
  }

  // Whether permit details are collected is the trip's call, not the form's: a
  // hand-rolled POST could add or omit these fields either way, so the flag read
  // from the database above decides. When it is false the four fields are ignored.
  if (trip.requires_permit_details) {
    if (!age || !sex || !homeAddress || !phone) {
      return { error: "Please fill in the permit details." };
    }
    const ageValue = Number(age);
    if (!Number.isInteger(ageValue) || ageValue < 18 || ageValue > 120) {
      return { error: "Please enter your age on the trip date (18 or older)." };
    }
    if (sex !== "male" && sex !== "female") {
      return { error: "Please choose Male or Female." };
    }
    if (!/^(\+63|0)\d{9,10}$/.test(phone.replace(/\s/g, ""))) {
      return { error: "Please enter a valid Philippine phone number (09XX or +63)." };
    }
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

  if (trip.requires_permit_details) {
    updatePayload.age = Number(age);
    updatePayload.sex = sex;
    updatePayload.home_address = homeAddress;
    updatePayload.phone = phone;
  }

  // Snapshot the waiver text only when the row does not already have one. Rows
  // prepped by a transfer (Phase 2) already carry their snapshot and keep it;
  // older rows with no snapshot get one resolved from the live trip text now,
  // matching the page's fallback (trip.waiver_text with [Organizer Name]
  // substituted, or DEFAULT_WAIVER_TEXT).
  if (participant.waiver_text_snapshot == null) {
    const { data: organizer, error: organizerError } = trip.organizer_id
      ? await admin
          .from("organizers")
          .select("display_name, full_name")
          .eq("id", trip.organizer_id)
          .maybeSingle()
      : { data: null, error: null };
    if (organizerError) {
      console.error("[confirm-participant] organizer fetch failed:", organizerError);
      Sentry.captureException(organizerError, {
        extra: { context: "confirm-participant-organizer-fetch-failed", organizerId: trip.organizer_id, participantId: participant.id },
      });
    }
    const organizerName = organizer?.display_name ?? organizer?.full_name ?? null;
    updatePayload.waiver_text_snapshot = withParticipantAdultAttestation(
      ((trip.waiver_text as string | null) ?? DEFAULT_WAIVER_TEXT)
        .replace(/\[Organizer Name\]/gi, organizerName || "the organizer"),
    );
  } else {
    // Rows snapshotted before the 18+ attestation existed still lack it. The
    // checkbox the participant accepts includes the attestation, so fold it into
    // the stored snapshot at confirmation time. Idempotent: rows whose snapshot
    // already carries the attestation are stored unchanged.
    updatePayload.waiver_text_snapshot = withParticipantAdultAttestation(
      participant.waiver_text_snapshot as string,
    );
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
