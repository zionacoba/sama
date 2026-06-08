import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { EmergencyContactPrompt } from "./emergency-contact-prompt";

export const metadata: Metadata = {
  title: "Payment received | Sama",
  robots: { index: false },
};

type PageProps = {
  searchParams: Promise<{ bookingId?: string }>;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const { bookingId } = await searchParams;

  const authClient = await createSupabaseServerClient();
  const { data: { user } } = await authClient.auth.getUser();

  const admin = createSupabaseAdminClient();

  let hasEmergencyContact = true;
  if (user) {
    const { data: profile } = await admin
      .from("profiles")
      .select("emergency_contact_name, emergency_contact_phone")
      .eq("id", user.id)
      .maybeSingle();
    hasEmergencyContact = !!(profile?.emergency_contact_name && profile?.emergency_contact_phone);
  }

  type BookingSummary = {
    id: number;
    total_amount: number;
    trip: {
      title: string;
      date_start: string;
      organizer: { display_name: string | null; full_name: string } | null;
    } | null;
  };

  let booking: BookingSummary | null = null;
  if (bookingId) {
    const { data } = await admin
      .from("bookings")
      .select("id, total_amount, trip:trips(title, date_start, organizer:organizers(display_name, full_name))")
      .eq("id", bookingId)
      .maybeSingle();
    booking = data as BookingSummary | null;
  }

  const bookingRef = bookingId
    ? parseInt(bookingId, 10).toString(16).toUpperCase().slice(-8).padStart(8, "0")
    : null;

  return (
    <>
      <Navbar />
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-trailhead-muted">
            <svg
              className="h-8 w-8 text-trailhead"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-stone-900">Payment received!</h1>

          <p className="mt-3 text-sm text-stone-600">
            We&apos;re confirming your booking — you&apos;ll receive an email shortly with your booking details.
          </p>

          {booking?.trip ? (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-5 text-left">
              <p className="text-base font-semibold text-stone-900">{booking.trip.title}</p>
              <p className="mt-1 text-sm text-stone-500">{formatDate(booking.trip.date_start)}</p>
              {booking.trip.organizer && (
                <p className="mt-0.5 text-sm text-stone-500">
                  Organized by {booking.trip.organizer.display_name ?? booking.trip.organizer.full_name}
                </p>
              )}
              <p className="mt-3 text-sm font-medium text-stone-700">
                Amount paid: <span className="text-trailhead">{formatCurrency(booking.total_amount)}</span>
              </p>
              {bookingRef && (
                <p className="mt-1 text-xs text-stone-400">
                  Ref:{" "}
                  <span className="font-mono font-medium text-stone-500">{bookingRef}</span>
                </p>
              )}
            </div>
          ) : (
            bookingRef && (
              <p className="mt-2 text-xs text-stone-400">
                Booking reference:{" "}
                <span className="font-mono font-medium text-stone-600">{bookingRef}</span>
              </p>
            )
          )}

          {user && !hasEmergencyContact && <EmergencyContactPrompt />}

          <div className="mt-8 flex flex-col items-center gap-3">
            {booking ? (
              <Link
                href={`/profile/bookings/${booking.id}`}
                className="w-full rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto sm:min-w-[220px]"
              >
                View booking details
              </Link>
            ) : (
              <Link
                href="/profile"
                className="w-full rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto sm:min-w-[220px]"
              >
                View my bookings
              </Link>
            )}
            <Link
              href="/trips"
              className="text-sm text-stone-500 underline-offset-4 hover:text-trailhead hover:underline"
            >
              Browse more trips
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
          Privacy Policy
        </Link>
        {" · "}
        <a href="mailto:hello@sama.com.ph" className="underline-offset-4 hover:text-trailhead hover:underline">
          Contact
        </a>
      </footer>
    </>
  );
}
