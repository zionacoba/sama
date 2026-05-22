"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-5xl">⚠️</p>
        <h1 className="mt-4 text-2xl font-bold text-stone-900">Something went wrong</h1>
        <p className="mt-2 text-stone-600">Please try again or go back home.</p>
        <div className="mt-8 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
          >
            Go home
          </Link>
        </div>
      </main>
    </div>
  );
}
