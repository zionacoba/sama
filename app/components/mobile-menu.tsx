"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";

type Props = {
  isLoggedIn: boolean;
  isAdmin: boolean;
  email: string;
  displayName: string;
  organizerStatus: string | null;
  organizerId: string | null;
};

export function MobileMenu({ isLoggedIn, isAdmin, email, displayName, organizerStatus, organizerId }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        !containerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function handleToggle() {
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  }

  const close = () => setOpen(false);

  return (
    <div ref={containerRef} className="relative sm:hidden">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition hover:bg-stone-100"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropdownRef}
          style={{ top: menuPos.top, right: menuPos.right }}
          className="fixed z-50 w-56 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl"
        >
          <nav className="flex flex-col text-sm" aria-label="Mobile navigation">
            <Link
              href="/trips"
              onClick={close}
              className="px-4 py-3 font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
            >
              Explore
            </Link>

            {isLoggedIn ? (
              <>
                {displayName && (
                  <p className="border-t border-stone-100 px-4 py-2 text-xs text-stone-400">
                    {displayName}
                  </p>
                )}
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={close}
                    className="px-4 py-3 font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/profile"
                  onClick={close}
                  className="px-4 py-3 font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
                >
                  My Account
                </Link>
                {organizerStatus === "approved" && organizerId && (
                  <Link
                    href={`/organizers/${organizerId}`}
                    onClick={close}
                    className="px-4 py-3 font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
                  >
                    Organizer Profile
                  </Link>
                )}
                {organizerStatus === "approved" ? (
                  <Link
                    href="/organizer/dashboard"
                    onClick={close}
                    className="px-4 py-3 font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
                  >
                    Dashboard
                  </Link>
                ) : organizerStatus === "pending" ? (
                  <span className="px-4 py-3 text-stone-400">Application pending</span>
                ) : (
                  <Link
                    href="/apply"
                    onClick={close}
                    className="px-4 py-3 font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
                  >
                    Become an organizer
                  </Link>
                )}
                <form action={signOut} className="border-t border-stone-100">
                  <button
                    type="submit"
                    className="w-full px-4 py-3 text-left font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={close}
                  className="border-t border-stone-100 px-4 py-3 font-medium text-stone-700 transition hover:bg-trailhead-muted hover:text-trailhead"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={close}
                  className="border-t border-stone-100 px-4 py-3 font-medium text-trailhead transition hover:bg-trailhead-muted"
                >
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>,
        document.body
      )}
    </div>
  );
}
