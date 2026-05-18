import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { BookingReviewForm } from "./booking-review-form";

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

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "confirmed"
      ? "bg-emerald-100 text-emerald-800"
      : status === "pending"
        ? "bg-amber-100 text-amber-900"
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
}: {
  booking: Booking;
  past: boolean;
  reviewed: boolean;
}) {
  const { trip } = booking;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm sm:flex-row">
      <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80 sm:aspect-auto sm:w-40">
        {trip.photos?.[0] && (
          <Image
            src={trip.photos[0]}
            alt={trip.title}
            fill
            className="object-cover"
            sizes="(min-width: 640px) 160px, 100vw"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link
              href={`/trips/${trip.slug}`}
              className="font-bold text-stone-900 underline-offset-4 hover:text-trailhead hover:underline"
            >
              {trip.title}
            </Link>
            <p className="mt-0.5 text-sm text-stone-500">{trip.destination}</p>
          </div>
          <StatusBadge status={booking.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge level={trip.difficulty} />
          {trip.activity_type && (
            <span className="inline-flex items-center rounded-full bg-trailhead-muted px-2 py-0.5 text-xs font-semibold text-trailhead">
              {trip.activity_type}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs text-stone-400">Date</p>
            <p className="font-medium text-stone-700">{formatDate(trip.date_start)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400">Slots</p>
            <p className="font-medium text-stone-700">{booking.slots}</p>
          </div>
          <div>
            <p className="text-xs text-stone-400">Total paid</p>
            <p className="font-medium text-stone-700">{formatCurrency(booking.total_amount)}</p>
          </div>
          {!past && trip.meeting_point && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-xs text-stone-400">Meeting point</p>
              <p className="font-medium text-stone-700">{trip.meeting_point}</p>
            </div>
          )}
        </div>

        {past && booking.status === "confirmed" && !reviewed && (
          <BookingReviewForm
            tripId={trip.id}
            tripSlug={trip.slug}
            bookingId={booking.id}
          />
        )}

        {past && booking.status === "confirmed" && reviewed && (
          <p className="mt-auto pt-1 text-xs text-stone-400">Review submitted ✓</p>
        )}
      </div>
    </article>
  );
}

export default async function BookingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard/bookings");
  }

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(`
      id,
      slots,
      total_amount,
      status,
      trip:trips(id, title, slug, date_start, destination, photos, difficulty, activity_type, meeting_point)
    `)
    .eq("email", user.email ?? "")
    .order("created_at", { ascending: false });

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

  const upcoming = bookings.filter((b) => b.trip.date_start > now);
  const past = bookings.filter((b) => b.trip.date_start <= now);

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
          My bookings
        </h1>
        <p className="mt-1 text-stone-500">{user.email}</p>

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
          <section className="mt-10">
            <h2 className="text-lg font-bold text-stone-900">
              Upcoming
              <span className="ml-2 text-base font-normal text-stone-400">({upcoming.length})</span>
            </h2>
            <ul className="mt-4 space-y-4">
              {upcoming.map((b) => (
                <li key={b.id}>
                  <BookingCard booking={b} past={false} reviewed={false} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section className="mt-10">
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
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
        {" · "}
        <Link href="/organizer/apply" className="underline-offset-4 hover:text-trailhead hover:underline">
          Become an Organizer
        </Link>
      </footer>
    </div>
  );
}
