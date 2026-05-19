import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { signOut } from "@/app/actions/auth";

const navLinks = [
  { label: "Hike", href: "/trips?activity=Hiking" },
] as const;

type AuthLinksProps = {
  email: string;
  displayName: string;
  organizerStatus: string | null;
  className?: string;
};

function AuthLinks({ email: _email, displayName, organizerStatus, className }: AuthLinksProps) {
  return (
    <div className={`flex items-center gap-2 sm:gap-3 ${className ?? ""}`}>
      <span className="hidden max-w-[200px] truncate text-sm text-stone-600 sm:inline">
        {displayName}
      </span>
      <Link
        href="/dashboard/bookings"
        className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
      >
        My Bookings
      </Link>
      <Link
        href="/dashboard/profile"
        className="shrink-0 text-sm font-medium text-stone-600 transition hover:text-trailhead"
      >
        Profile
      </Link>
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
  let displayName = "";

  if (user) {
    const { data: organizer } = await supabase
      .from("organizers")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    organizerStatus = organizer?.status ?? null;

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
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-3.5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
          <div className="sm:hidden">
            {user
              ? <AuthLinks displayName={displayName} email={user.email ?? ""} organizerStatus={organizerStatus} />
              : loginLink}
          </div>
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
        <div className="hidden sm:flex">
          {user
            ? <AuthLinks displayName={displayName} email={user.email ?? ""} organizerStatus={organizerStatus} />
            : loginLink}
        </div>
      </div>
    </header>
  );
}
