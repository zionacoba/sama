"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";

function getSafeRedirect(path: string | null) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = getSafeRedirect(searchParams.get("redirectTo"));

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace(redirectTo);
    });
  }, [router, redirectTo]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPhoneError(null);
    setAlreadyRegistered(false);
    setSuccess(false);

    const strippedPhone = phone.replace(/[\s-]/g, "");
    if (!/^\d{10,}$/.test(strippedPhone)) {
      setPhoneError("Please enter a valid phone number (at least 10 digits, numbers only).");
      return;
    }

    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone: strippedPhone },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    setLoading(false);

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already exists")) {
        setAlreadyRegistered(true);
      } else {
        setError(authError.message);
      }
      return;
    }

    if (data.session) {
      await supabase.from("profiles").upsert({ id: data.session.user.id, phone: strippedPhone });
      router.push(redirectTo);
      router.refresh();
      return;
    }

    setSuccess(true);
  }

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-trailhead">
            <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            {success ? (
              <div className="flex flex-col items-center py-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h1 className="mt-5 text-2xl font-bold tracking-tight text-stone-900">Check your email</h1>
                <p className="mt-3 text-sm text-stone-600">
                  We sent a confirmation link to{" "}
                  <span className="font-semibold text-stone-900">{email}</span>.
                  Click the link to confirm your account and sign in.
                </p>
                <p className="mt-6 text-xs text-stone-400">
                  Didn&apos;t receive it? Check your spam folder or contact{" "}
                  <a href="mailto:hello@sama.com.ph" className="underline underline-offset-2 hover:text-stone-600">
                    hello@sama.com.ph
                  </a>
                </p>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                  Create your account
                </h1>
                <p className="mt-1 text-sm text-stone-600">
                  Start exploring the Philippines with people who love the outdoors. Sama ka?
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  {alreadyRegistered && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      This email is already in use.{" "}
                      <Link
                        href={`/login${redirectTo !== "/" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
                        className="font-semibold underline underline-offset-2"
                      >
                        Log in instead →
                      </Link>
                    </p>
                  )}

                  {error && (
                    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      {error}
                    </p>
                  )}

                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-stone-700">
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
                    <label htmlFor="phone" className="block text-sm font-medium text-stone-700">
                      Phone number
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      name="phone"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }}
                      className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:ring-2 ${phoneError ? "border-red-400 focus:border-red-400" : "border-stone-200 focus:border-trailhead"}`}
                      placeholder="09xxxxxxxxx"
                    />
                    {phoneError && (
                      <p role="alert" className="mt-1.5 text-xs text-red-600">{phoneError}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-stone-700">
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
                    <label htmlFor="password" className="block text-sm font-medium text-stone-700">
                      Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 pr-10 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-400 hover:text-stone-600"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
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
                    href={`/login${redirectTo !== "/" ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
                    className="font-semibold text-trailhead underline-offset-4 hover:underline"
                  >
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
