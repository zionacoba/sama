export const dynamic = "force-dynamic";

import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BookingReviewForm } from "@/app/dashboard/bookings/booking-review-form";
import { ProfileForm as SafetyForm } from "@/app/dashboard/profile/profile-form";
import { ProfileForm } from "./profile-form";
import { ParticipantShareLinks } from "./participant-share-links";

type PageProps = {
  searchParams: Promise<{ tab?: string }>;
};

type Booking = {
  id: number;
  slots: number;
  total_amount: number;
  status: string;
  trip: {
    id: number;
    title: string;
    slug: string;
    date_start: string;
    destination: string;
    photos: string[] | null;
    difficulty: string;
    activity_type: string | null;
    duration: string | null;
    meeting_point: string;
  };
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function DifficultyBadge({ level }: { level: string }) {
  const colorClass =
    level === "Beginner"
      ? "bg-emerald-100 text-emerald-800"
      : level === "Intermediate"
        ? "bg-amber-100 text-amber-900"
        : level === "Advanced"
          ? "bg-orange-100 text-orange-900"
          : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {level}
    </span>
  );
}

type IncompleteParticipant = { slotNumber: number; token: string };

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "confirmed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "pending"
        ? "bg-amber-100 text-amber-900"
        : status === "cancelled" || status === "rejected"
          ? "bg-red-100 text-red-700"
          : "bg-stone-100 text-stone-600";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles}`}>
      {label}
    </span>
  );
}

function BookingCard({
  booking,
  past,
  reviewed,
  incompleteParticipants,
}: {
  booking: Booking;
  past: boolean;
  reviewed: boolean;
  incompleteParticipants: IncompleteParticipant[];
}) {
  const { trip } = booking;
  return (
    <article className="flex overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative w-24 shrink-0 overflow-hidden bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80 sm:w-32">
        {trip.photos?.[0] && (
          <Image
            src={trip.photos[0]}
            alt={trip.title}
            fill
            className="object-cover"
            sizes="(min-width: 640px) 128px, 96px"
            quality={75}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-1.5">
          <div>
            <Link
              href={`/trips/${trip.slug}`}
              className="text-sm font-semibold text-stone-900 underline-offset-4 hover:text-trailhead hover:underline"
            >
              {trip.title}
            </Link>
            <p className="text-xs text-stone-500">{trip.destination}</p>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <DifficultyBadge level={trip.difficulty} />
          {trip.activity_type && (
            <span className="inline-flex items-center rounded-full bg-trailhead-muted px-2 py-0.5 text-xs font-semibold text-trailhead">
              {trip.activity_type}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500">
          <span>{formatDate(trip.date_start)}{trip.duration && ` · ${trip.duration}`}</span>
          <span>{booking.slots} slot{booking.slots !== 1 ? "s" : ""}</span>
          <span>{formatCurrency(booking.total_amount)}</span>
          {!past && trip.meeting_point && (
            <span className="w-full text-stone-400">Meet: {trip.meeting_point}</span>
          )}
        </div>

        {incompleteParticipants.length > 0 && (
          <ParticipantShareLinks participants={incompleteParticipants} />
        )}

        {past && booking.status === "confirmed" && !reviewed && (
          <BookingReviewForm
            tripId={trip.id}
            tripSlug={trip.slug}
            bookingId={booking.id}
          />
        )}

        {past && booking.status === "confirmed" && reviewed && (
          <p className="text-xs text-stone-400">Review submitted ✓</p>
        )}
      </div>
    </article>
  );
}

export default async function AccountPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const activeTab = tab === "profile" ? "profile" : "bookings";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/profile");

  const admin = createSupabaseAdminClient();
  const [{ data: bookingsData }, { data: profileData, error: profileError }] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id,
        slots,
        total_amount,
        status,
        trip:trips(id, title, slug, date_start, destination, photos, difficulty, activity_type, duration, meeting_point)
      `)
      .eq("email", user.email ?? "")
      .order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("birthdate, emergency_contact_name, emergency_contact_phone, phone")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  console.log("PROFILE DEBUG:", JSON.stringify(profileData));
  console.log("PROFILE ERROR:", JSON.stringify(profileError));
  console.log("PROFILE USER ID:", user.id);

  const bookings = (bookingsData ?? []) as unknown as Booking[];
  const now = new Date().toISOString();

  const pastConfirmedBookingIds = bookings
    .filter((b) => b.trip.date_start <= now && b.status === "confirmed")
    .map((b) => b.id);

  let reviewedBookingIds = new Set<number>();
  if (pastConfirmedBookingIds.length > 0) {
    const { data: reviewsData } = await supabase
      .from("reviews")
      .select("booking_id")
      .eq("user_id", user.id)
      .in("booking_id", pastConfirmedBookingIds);
    reviewedBookingIds = new Set(
      (reviewsData ?? []).map((r) => r.booking_id).filter(Boolean)
    );
  }

  const multiSlotIds = bookings.filter((b) => b.slots > 1).map((b) => b.id);
  const incompleteParticipantsMap = new Map<number, IncompleteParticipant[]>();

  if (multiSlotIds.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: participantsData } = await admin
      .from("booking_participants")
      .select("booking_id, slot_number, token")
      .in("booking_id", multiSlotIds)
      .eq("completed", false)
      .order("slot_number");

    for (const p of (participantsData ?? []) as { booking_id: number; slot_number: number; token: string }[]) {
      if (!incompleteParticipantsMap.has(p.booking_id)) incompleteParticipantsMap.set(p.booking_id, []);
      incompleteParticipantsMap.get(p.booking_id)!.push({ slotNumber: p.slot_number, token: p.token });
    }
  }

  const isCancelledOrRejected = (b: Booking) => b.status === "cancelled" || b.status === "rejected";
  const upcoming = bookings.filter((b) => b.trip.date_start > now && !isCancelledOrRejected(b));
  const past = bookings.filter((b) => b.trip.date_start <= now && !isCancelledOrRejected(b));
  const cancelled = bookings.filter(isCancelledOrRejected);

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";

  const tabClass = (t: string) =>
    `shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition ${
      activeTab === t
        ? "bg-trailhead text-white shadow-sm"
        : "text-stone-600 hover:bg-stone-100"
    }`;

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
          <Link
            href="/trips"
            className="text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            ← Browse trips
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          My account
        </h1>
        <p className="mt-1 text-stone-500">{fullName || user.email}</p>

        <div className="mt-6 flex gap-2">
          <Link href="/profile" className={tabClass("bookings")}>
            My Bookings
          </Link>
          <Link href="/profile?tab=profile" className={tabClass("profile")}>
            Profile
          </Link>
        </div>

        {activeTab === "bookings" && (
          <>
            {bookings.length === 0 && (
              <div className="mt-16 flex flex-col items-center gap-4 text-center">
                <p className="text-stone-500">You haven&apos;t booked any trips yet.</p>
                <Link
                  href="/trips"
                  className="rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
                >
                  Browse trips
                </Link>
              </div>
            )}

            {upcoming.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-bold text-stone-900">
                  Upcoming
                  <span className="ml-2 text-base font-normal text-stone-400">({upcoming.length})</span>
                </h2>
                <ul className="mt-4 space-y-4">
                  {upcoming.map((b) => (
                    <li key={b.id}>
                      <BookingCard
                        booking={b}
                        past={false}
                        reviewed={false}
                        incompleteParticipants={incompleteParticipantsMap.get(b.id) ?? []}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {past.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-bold text-stone-900">
                  Past trips
                  <span className="ml-2 text-base font-normal text-stone-400">({past.length})</span>
                </h2>
                <ul className="mt-4 space-y-4">
                  {past.map((b) => (
                    <li key={b.id}>
                      <BookingCard
                        booking={b}
                        past={true}
                        reviewed={reviewedBookingIds.has(b.id)}
                        incompleteParticipants={incompleteParticipantsMap.get(b.id) ?? []}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {cancelled.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-bold text-stone-900">
                  Cancelled / rejected
                  <span className="ml-2 text-base font-normal text-stone-400">({cancelled.length})</span>
                </h2>
                <ul className="mt-4 space-y-4">
                  {cancelled.map((b) => (
                    <li key={b.id}>
                      <BookingCard
                        booking={b}
                        past={false}
                        reviewed={false}
                        incompleteParticipants={[]}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {activeTab === "profile" && (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold text-stone-900">Personal info</h2>
              <div className="mt-6">
                <ProfileForm
                  fullName={fullName}
                  email={user.email ?? ""}
                  phone={profileData?.phone ?? null}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-semibold text-stone-900">Safety information</h2>
              <p className="mt-1 text-sm text-stone-500">
                Helps organizers maintain accurate safety and registration records for their trips.
              </p>
              <div className="mt-6">
                <SafetyForm
                  birthdate={profileData?.birthdate ?? null}
                  emergencyContactName={profileData?.emergency_contact_name ?? null}
                  emergencyContactPhone={profileData?.emergency_contact_phone ?? null}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
        {" · "}
        <Link href="/organizer/apply" className="underline-offset-4 hover:text-trailhead hover:underline">
          Become an Organizer
        </Link>
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
