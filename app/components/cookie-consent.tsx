"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cookie_consent")) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function accept() {
    localStorage.setItem("cookie_consent", "true");
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200 bg-white px-4 py-4 shadow-lg">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-600">
          We use cookies to keep you logged in and improve your experience. By
          using Sama, you agree to our use of cookies.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/privacy"
            className="text-sm text-stone-500 underline hover:text-stone-700"
          >
            Privacy Policy
          </Link>
          <button
            onClick={accept}
            className="rounded-lg bg-trailhead px-4 py-2 text-sm font-semibold text-white transition hover:bg-trailhead-dark"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
