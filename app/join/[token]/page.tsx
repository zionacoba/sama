import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ParticipantForm } from "./participant-form";
import { DEFAULT_WAIVER_TEXT } from "@/lib/constants";

type PageProps = {
  params: Promise<{ token: string }>;
};

type MeetingPoint = { location: string; time: string };

export default async function JoinPage({ params }: PageProps) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: participant } = await admin
    .from("booking_participants")
    .select("id, completed, booking_id, full_name, slot_number")
    .eq("token", token)
    .maybeSingle();

  if (!participant) notFound();

  const { data: booking } = await admin
    .from("bookings")
    .select("trip_id, full_name, meeting_point, status")
    .eq("id", participant.booking_id)
    .maybeSingle();

  if (!booking) notFound();

  if (booking.status === "cancelled") {
    return (
      <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
        <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
          <div className="mx-auto flex max-w-xl items-center px-4 py-4 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-90">⛰ Sama</Link>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 text-center">
          <p className="text-4xl">✕</p>
          <h1 className="mt-4 text-xl font-bold text-stone-900">This booking has been cancelled</h1>
          <p className="mt-2 text-sm text-stone-500">This waiver link is no longer active.</p>
        </main>
      </div>
    );
  }

  const { data: trip } = await admin
    .from("trips")
    .select("title, date_start, meeting_points, waiver_text, organizer_id")
    .eq("id", booking.trip_id)
    .maybeSingle();

  if (!trip) notFound();

  const { data: organizer } = trip.organizer_id
    ? await admin
        .from("organizers")
        .select("display_name, full_name")
        .eq("id", trip.organizer_id)
        .maybeSingle()
    : { data: null };

  if (new Date(trip.date_start) < new Date()) {
    return (
      <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
        <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
          <div className="mx-auto flex max-w-xl items-center px-4 py-4 sm:px-6">
            <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-90">⛰ Sama</Link>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 text-center">
          <p className="text-4xl">⏱</p>
          <h1 className="mt-4 text-xl font-bold text-stone-900">This waiver link has expired</h1>
          <p className="mt-2 text-sm text-stone-500">The trip date has already passed.</p>
        </main>
      </div>
    );
  }

  const tripDate = new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(trip.date_start));

  const meetingPoints = (trip.meeting_points ?? []) as MeetingPoint[];


  const organizerName = organizer?.display_name ?? organizer?.full_name ?? null;
  const waiverText = ((trip.waiver_text as string | null) ?? DEFAULT_WAIVER_TEXT)
    .replace(/\[Organizer Name\]/gi, organizerName || "the organizer");

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-xl items-center px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-bold tracking-tight hover:opacity-90">
            ⛰ Sama
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="mb-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Trip confirmation
          </p>
          <h1 className="mt-1 text-xl font-bold text-stone-900">{trip.title}</h1>
          <p className="mt-0.5 text-sm text-stone-500">{tripDate}</p>
          <p className="mt-2 text-xs text-stone-500">
            Booked by <span className="text-stone-600">{booking.full_name}</span>
          </p>
        </div>

        {participant.completed ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
              ✓
            </div>
            <h2 className="mt-4 text-lg font-bold text-emerald-900">Already confirmed</h2>
            <p className="mt-2 text-sm text-emerald-700">
              {participant.full_name
                ? `${participant.full_name}'s spot is confirmed.`
                : "Your spot is confirmed."}{" "}
              See you on the trail!
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-stone-900">Confirm your spot</h2>
            <ParticipantForm
              token={token}
              meetingPoints={meetingPoints}
              waiverText={waiverText}
              defaultMeetingPoint={(booking.meeting_point as string | null) ?? null}
            />
          </div>
        )}
      </main>
    </div>
  );
}
