import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { signOut } from "@/app/actions/auth";
import { MobileMenu } from "./mobile-menu";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;

const navLinks = [
  { label: "Explore", href: "/trips" },
] as const;

type AuthLinksProps = {
  email: string;
  displayName: string;
  organizerStatus: string | null;
  organizerId: string | null;
  className?: string;
};

function AuthLinks({ email, displayName, organizerStatus, organizerId, className }: AuthLinksProps) {
  return (
    <div className={`flex items-center gap-2 sm:gap-3 ${className ?? ""}`}>
      <span className="hidden max-w-[200px] truncate text-sm text-stone-600 sm:inline">
        {displayName}
      </span>
      {email === ADMIN_EMAIL && (
        <Link
          href="/admin/organizers"
          className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
        >
          Admin
        </Link>
      )}
      <Link
        href="/profile"
        className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
      >
        My Account
      </Link>
      {organizerStatus === "approved" && organizerId && (
        <Link
          href={`/organizers/${organizerId}`}
          className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
        >
          Organizer Profile
        </Link>
      )}
      {organizerStatus === "approved" ? (
        <Link
          href="/organizer/dashboard"
          className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
        >
          Dashboard
        </Link>
      ) : organizerStatus === "pending" ? (
        <span className="shrink-0 text-sm text-stone-400">Application pending</span>
      ) : null}
      <form action={signOut}>
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
        >
          Logout
        </button>
      </form>
    </div>
  );
}

export async function Navbar() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let organizerStatus: string | null = null;
  let organizerId: string | null = null;
  let displayName = "";

  if (user) {
    const { data: organizer } = await supabase
      .from("organizers")
      .select("id, user_id, status")
      .eq("user_id", user.id)
      .maybeSingle();

    organizerStatus = organizer?.status ?? null;
    organizerId = organizer?.id ? String(organizer.id) : null;

    const fullName = user.user_metadata?.full_name as string | undefined;
    displayName = fullName?.trim()
      ? fullName.trim().split(" ")[0]
      : (user.email?.split("@")[0] ?? "You");
  }

  const loginLink = (
    <Link
      href="/login"
      className="shrink-0 rounded-lg border border-trailhead bg-trailhead px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark sm:px-4"
    >
      Login
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-1">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
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
        </div>

        <div className="flex items-center gap-2">
          {/* Desktop auth */}
          <div className="hidden sm:flex">
            {user
              ? <AuthLinks
                  email={user.email ?? ""}
                  displayName={displayName}
                  organizerStatus={organizerStatus}
                  organizerId={organizerId}
                />
              : loginLink}
          </div>

          {/* Mobile hamburger */}
          <MobileMenu
            isLoggedIn={!!user}
            email={user?.email ?? ""}
            displayName={displayName}
            organizerStatus={organizerStatus}
            organizerId={organizerId}
          />
        </div>
      </div>
    </header>
  );
}
