"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/forgot-password?expired=1");
      } else {
        setSessionChecked(true);
      }
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            {!sessionChecked && !done ? (
              <p className="text-center text-sm text-stone-500">Checking your link…</p>
            ) : done ? (
              <div className="text-center">
                <p className="text-4xl">✅</p>
                <h1 className="mt-4 text-xl font-bold text-stone-900">Password updated!</h1>
                <p className="mt-2 text-sm text-stone-600">
                  Redirecting you to login…
                </p>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                  Set a new password
                </h1>
                <p className="mt-1 text-sm text-stone-600">
                  Choose a strong password of at least 8 characters.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  {error && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    >
                      {error}
                    </p>
                  )}

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-stone-700">
                      New password
                    </label>
                    <input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                      placeholder="At least 8 characters"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm" className="block text-sm font-medium text-stone-700">
                      Confirm password
                    </label>
                    <input
                      id="confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                      placeholder="Repeat your password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Updating…" : "Update password"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
