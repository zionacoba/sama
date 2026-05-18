"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";

const navLinks = [
  { label: "Hike", href: "/trips?activity=Hiking" },
  { label: "Camp", href: "/trips?activity=Camping" },
  { label: "Dive", href: "/trips?activity=Freediving" },
  { label: "Island Hop", href: "/trips?activity=Island Hopping" },
] as const;

function AuthSection({ className }: { className?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  // undefined = still fetching, null = no organizer row, string = status value
  const [organizerStatus, setOrganizerStatus] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    async function fetchOrganizerStatus(userId: string) {
      try {
        const client = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const { data, error } = await client
          .from("organizers")
          .select("status")
          .eq("user_id", userId)
          .maybeSingle();
        console.log("[navbar] fetchOrganizerStatus data:", data, "error:", error);
        setOrganizerStatus(data?.status ?? null);
      } catch (err) {
        console.error("[navbar] fetchOrganizerStatus threw:", err);
        setOrganizerStatus(null);
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) await fetchOrganizerStatus(currentUser.id);
      else setOrganizerStatus(null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        if (currentUser) await fetchOrganizerStatus(currentUser.id);
        else setOrganizerStatus(null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }

  function getDisplayName(u: User): string {
    const full = u.user_metadata?.full_name as string | undefined;
    if (full?.trim()) return full.trim().split(" ")[0];
    return u.email?.split("@")[0] ?? "You";
  }

  if (user) {
    return (
      <div className={`flex items-center gap-2 sm:gap-3 ${className ?? ""}`}>
        <span className="max-w-[120px] truncate text-sm text-stone-600 sm:max-w-[200px]">
          {getDisplayName(user)}
        </span>
        <Link
          href="/dashboard/bookings"
          className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
        >
          My Bookings
        </Link>
        {organizerStatus === "approved" ? (
          <Link
            href="/organizer/dashboard"
            className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            Dashboard
          </Link>
        ) : organizerStatus === "pending" ? (
          <span className="shrink-0 text-sm text-stone-400">
            Application pending
          </span>
        ) : organizerStatus === null ? (
          <Link
            href="/organizer/apply"
            className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            Become an Organizer
          </Link>
        ) : null /* undefined = still loading */}
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className={`shrink-0 rounded-lg border border-trailhead bg-trailhead px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark sm:px-4 ${className ?? ""}`}
    >
      Login
    </Link>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3.5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-trailhead"
          >
            ⛰ Sama
          </Link>
          <AuthSection className="sm:hidden" />
        </div>
        <nav
          className="-mx-1 flex items-center gap-1 overflow-x-auto pb-1 sm:mx-0 sm:flex-1 sm:justify-center sm:pb-0 sm:px-4"
          aria-label="Main"
        >
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-trailhead-muted hover:text-trailhead"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <AuthSection className="hidden sm:flex" />
      </div>
    </header>
  );
}
