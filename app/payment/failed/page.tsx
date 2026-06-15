import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";
import { formatBookingRef } from "@/lib/format";

export const metadata: Metadata = {
  title: "Payment not completed | Sama",
  robots: { index: false },
};

type PageProps = {
  searchParams: Promise<{ bookingId?: string }>;
};

export default async function PaymentFailedPage({ searchParams }: PageProps) {
  const { bookingId } = await searchParams;

  return (
    <>
      <Navbar />
      <main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-stone-900">Payment was not completed</h1>

          <p className="mt-3 text-sm text-stone-600">
            Your booking slot is reserved for 15 minutes. You can try again or contact us for help.
          </p>

          {bookingId && (
            <p className="mt-2 text-xs text-stone-500">
              Booking reference:{" "}
              <span className="font-mono font-medium text-stone-600">
                {formatBookingRef(parseInt(bookingId, 10))}
              </span>
            </p>
          )}

          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/profile"
              className="w-full rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto sm:min-w-[220px]"
            >
              View my bookings
            </Link>
            <a
              href="mailto:hello@sama.com.ph"
              className="text-sm text-stone-500 underline-offset-4 hover:text-trailhead hover:underline"
            >
              Contact support
            </a>
            <Link
              href="/trips"
              className="text-sm text-stone-500 underline-offset-4 hover:text-trailhead hover:underline"
            >
              Browse all trips
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama.
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
