"use client";

import { useState } from "react";

type ShareButtonProps = {
  url: string;
  title: string;
  className?: string;
};

export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const fullUrl = typeof window !== "undefined"
      ? new URL(url, window.location.origin).href
      : url;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: fullUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. non-secure context) — silently ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className={className}
    >
      {copied ? "Link copied!" : "Share"}
    </button>
  );
}
