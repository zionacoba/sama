"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }

    setSuccess("Check your email to confirm your account, then sign in.");
  }

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-trailhead"
          >
            ⛰ Sama
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900">
              Create your account
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Start exploring the Philippines with people who love the outdoors. Sama ka?
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

              {success && (
                <p
                  role="status"
                  className="rounded-lg border border-trailhead/30 bg-trailhead-muted px-4 py-3 text-sm text-trailhead"
                >
                  {success}
                </p>
              )}

              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium text-stone-700"
                >
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  name="fullName"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                  placeholder="Juan dela Cruz"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-stone-700"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                  placeholder="you@example.com"
                />
              </div>

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
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                  placeholder="••••••••"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  required
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 accent-trailhead focus:ring-2 focus:ring-trailhead/30"
                />
                <span className="text-xs leading-relaxed text-stone-600">
                  I agree to Sama&apos;s{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-trailhead">Terms of Service</a>
                  {" "}and{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-trailhead">Privacy Policy</a>.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating account…" : "Sign up"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-stone-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-trailhead underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
