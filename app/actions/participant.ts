"use server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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
    .select("id, completed, booking_id")
    .eq("token", token)
    .maybeSingle();

  if (!participant) return { error: "Invalid or expired link." };

  const { data: booking } = await admin
    .from("bookings")
    .select("status")
    .eq("id", participant.booking_id)
    .maybeSingle();

  if (!booking || booking.status === "cancelled") {
    return { error: "This booking has been cancelled." };
  }

  const { data: updated, error } = await admin
    .from("booking_participants")
    .update({
      full_name: fullName,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
      medical_notes: medicalNotes,
      meeting_point: meetingPoint,
      waiver_accepted: true,
      waiver_accepted_at: new Date().toISOString(),
      completed: true,
    })
    .eq("id", participant.id)
    .eq("completed", false)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "This waiver has already been submitted." };

  return { success: true };
}
