import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export default async function OrganizerDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("full_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer) redirect("/organizer/apply");

  if (organizer.status !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-4xl">{organizer.status === "rejected" ? "❌" : "⏳"}</p>
          <h1 className="mt-4 text-xl font-bold text-stone-900">
            {organizer.status === "rejected"
              ? "Application not approved"
              : "Application under review"}
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            {organizer.status === "rejected"
              ? "Your application wasn't approved. Reach out to us if you have questions."
              : "Your application is being reviewed. We'll notify you once it's approved."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
          >
            ← Back to site
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link
              href="/"
              className="text-lg font-bold tracking-tight hover:opacity-90"
            >
              ⛰ Sama
            </Link>
            <p className="mt-0.5 text-sm text-trailhead-muted">Organizer Dashboard</p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-trailhead-muted transition hover:text-white"
          >
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Welcome back, {organizer.full_name}! 👋
          </h1>
          <p className="mt-2 text-stone-600">
            Your organizer dashboard is ready. Trip management is coming soon.
          </p>
        </div>
      </main>
    </div>
  );
}
