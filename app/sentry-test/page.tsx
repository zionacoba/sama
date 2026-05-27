"use client";

export default function SentryTestPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-sm text-stone-500">Sentry test page — delete after verifying.</p>
      <button
        type="button"
        onClick={() => { throw new Error("Sentry test error"); }}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        Throw test error
      </button>
    </div>
  );
}
