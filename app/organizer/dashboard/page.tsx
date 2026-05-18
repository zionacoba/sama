import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type OrganizerTrip = {
  id: string | number;
  slug: string;
  title: string;
  activity_type: string | null;
  date_start: string;
  price: number;
  total_slots: number;
  remaining_slots: number;
  status: string;
  bookings: { count: number }[];
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(price);
}

type OrganizerBooking = {
  id: string | number;
  full_name: string;
  email: string;
  phone: string;
  slots: number;
  total_amount: number;
  status: string;
  created_at: string;
  trips: { title: string } | null;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export default async function OrganizerDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, full_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer) redirect("/organizer/apply");

  if (organizer.status !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">{organizer.status === "rejected" ? "❌" : "⏳"}</p>
          <h1 className="mt-4 text-xl font-bold text-stone-900">
            {organizer.status === "rejected"
              ? "Application not approved"
              : "Application under review"}
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {organizer.status === "rejected"
              ? "Your application wasn't approved. Reach out to us if you have questions."
              : "Your application is being reviewed. We'll notify you once it's approved."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
          >
            ← Back to site
          </Link>
        </div>
      </div>
    );
  }

  const { data: tripsData } = await supabase
    .from("trips")
    .select("id, slug, title, activity_type, date_start, price, total_slots, remaining_slots, status, bookings(count)")
    .eq("organizer_id", organizer.id)
    .order("created_at", { ascending: false });

  const trips = (tripsData ?? []) as OrganizerTrip[];

  const tripIds = trips.map((t) => t.id);
  const { data: bookingsData } =
    tripIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, full_name, email, phone, slots, total_amount, status, created_at, trips(title)")
          .in("trip_id", tripIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  const bookings = (bookingsData ?? []) as unknown as OrganizerBooking[];

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link
              href="/"
              className="text-lg font-bold tracking-tight hover:opacity-90"
            >
              ⛰ Sama
            </Link>
            <p className="mt-0.5 text-sm text-trailhead-muted">Organizer Dashboard</p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-trailhead-muted transition hover:text-white"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Welcome back, {organizer.full_name}! 👋
              </h1>
              <p className="mt-2 text-stone-600">
                Manage your trips and track your bookings from here.
              </p>
            </div>
            <Link
              href="/organizer/trips/new"
              className="shrink-0 rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
            >
              + Create new trip
            </Link>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="mb-4 text-xl font-bold tracking-tight text-stone-900">
            Your trips
          </h2>

          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-trailhead/20 bg-trailhead text-white">
                    <th className="px-4 py-3 font-semibold">Title</th>
                    <th className="px-4 py-3 font-semibold">Activity</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Price</th>
                    <th className="px-4 py-3 font-semibold">Slots left</th>
                    <th className="px-4 py-3 font-semibold">Bookings</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {trips.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                        No trips yet.{" "}
                        <Link href="/organizer/trips/new" className="font-semibold text-trailhead underline-offset-4 hover:underline">
                          Create your first trip →
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    trips.map((trip) => (
                      <tr
                        key={trip.id}
                        className="border-b border-stone-100 last:border-0 hover:bg-trailhead-muted/30"
                      >
                        <td className="px-4 py-3 font-medium text-stone-900">
                          <Link
                            href={`/trips/${trip.slug}`}
                            className="hover:text-trailhead hover:underline underline-offset-4"
                          >
                            {trip.title}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {trip.activity_type ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                          {formatDate(trip.date_start)}
                        </td>
                        <td className="px-4 py-3 font-medium text-trailhead">
                          {formatPrice(trip.price)}
                        </td>
                        <td className="px-4 py-3 text-stone-900">
                          {trip.remaining_slots}{" "}
                          <span className="text-stone-400">/ {trip.total_slots}</span>
                        </td>
                        <td className="px-4 py-3 text-stone-900">
                          {trip.bookings[0]?.count ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                              trip.status === "active"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-stone-100 text-stone-600"
                            }`}
                          >
                            {trip.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/organizer/trips/${trip.slug}/edit`}
                            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {trips.length > 0 && (
            <p className="mt-3 text-sm text-stone-500">
              {trips.length} trip{trips.length !== 1 ? "s" : ""} total
            </p>
          )}
        </div>

        <div className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight text-stone-900">
            My bookings
          </h2>

          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-trailhead/20 bg-trailhead text-white">
                    <th className="px-4 py-3 font-semibold">Joiner name</th>
                    <th className="px-4 py-3 font-semibold">Email</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Trip</th>
                    <th className="px-4 py-3 font-semibold">Slots</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Date booked</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                        No bookings yet.
                      </td>
                    </tr>
                  ) : (
                    bookings.map((booking) => (
                      <tr
                        key={booking.id}
                        className="border-b border-stone-100 last:border-0 hover:bg-trailhead-muted/30"
                      >
                        <td className="px-4 py-3 font-medium text-stone-900">
                          {booking.full_name}
                        </td>
                        <td className="px-4 py-3 text-stone-600">{booking.email}</td>
                        <td className="px-4 py-3 text-stone-600">{booking.phone}</td>
                        <td className="px-4 py-3 text-stone-900">
                          {booking.trips?.title ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-stone-900">{booking.slots}</td>
                        <td className="px-4 py-3 font-medium text-trailhead">
                          {formatPrice(booking.total_amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                              booking.status === "confirmed"
                                ? "bg-emerald-100 text-emerald-800"
                                : booking.status === "cancelled"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                          {formatDateTime(booking.created_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {bookings.length > 0 && (
            <p className="mt-3 text-sm text-stone-500">
              {bookings.length} booking{bookings.length !== 1 ? "s" : ""} total
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
