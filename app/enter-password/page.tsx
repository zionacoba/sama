"use client";

import Link from "next/link";
import { useState } from "react";

export default function EnterPasswordPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/enter-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      window.location.href = "/";
      return;
    }

    const data = await res.json();
    setError(data.error ?? "Something went wrong.");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3.5">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-trailhead"
          >
            ⛰ Sama
          </Link>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Coming soon
            </h1>
            <p className="mt-1 text-sm text-stone-500">
              Enter the password to access the site.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
                >
                  {error}
                </p>
              )}

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-stone-700"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="mt-1.5 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:border-trailhead focus:outline-none focus:ring-2 focus:ring-trailhead/20"
                  placeholder="Enter password"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full rounded-lg bg-trailhead px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Checking…" : "Enter"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
