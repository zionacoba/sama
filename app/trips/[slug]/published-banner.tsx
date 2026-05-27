"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PublishedBanner({ tripSlug }: { tripSlug: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Remove ?published=1 from the URL without a full navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("published");
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (!visible) return null;

  const tripUrl = `${window.location.origin}/trips/${tripSlug}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(tripUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text — clipboard may be unavailable in some contexts
    }
  }

  return (
    <div className="relative z-50 bg-trailhead px-4 py-3 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold">
          🎉 Your trip is now live! Share it with your community.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={handleCopy}
            className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/30"
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={() => setVisible(false)}
            aria-label="Dismiss"
            className="rounded-lg p-1 transition hover:bg-white/20"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
