import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/app/components/navbar";

export const metadata: Metadata = {
  title: "Payment received | Sama",
  robots: { index: false },
};

type PageProps = {
  searchParams: Promise<{ bookingId?: string }>;
};

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const { bookingId } = await searchParams;

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

          {bookingId && (
            <p className="mt-2 text-xs text-stone-400">
              Booking reference:{" "}
              <span className="font-mono font-medium text-stone-600">
                {parseInt(bookingId, 10).toString(16).toUpperCase().slice(-8).padStart(8, "0")}
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
            <Link
              href="/trips"
              className="text-sm text-stone-500 underline-offset-4 hover:text-trailhead hover:underline"
            >
              Browse more trips
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
