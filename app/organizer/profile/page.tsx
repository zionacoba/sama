import Link from "next/link";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProfileForm } from "./profile-form";

export default async function OrganizerProfileEditPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/profile");

  const { data: organizer, error } = await supabase
    .from("organizers")
    .select("id, display_name, full_name, phone, bio, photo_url, cover_image_url, social_links, payout_method, gcash_number, gcash_name, bank_name, bank_account_number, bank_account_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[organizer-profile-edit] organizer fetch failed:", error);
    Sentry.captureException(error, {
      extra: { context: "organizer-profile-edit-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer) redirect("/apply");
  if (organizer.status !== "approved") redirect("/organizer/dashboard");

  const rawSl = organizer.social_links;
  const parsedSocialLinks = typeof rawSl === "string"
    ? (() => { try { return JSON.parse(rawSl); } catch { return null; } })()
    : rawSl;

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight hover:opacity-90">
            <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto brightness-0 invert" />
            Sama
            <span className="mx-1 font-normal text-trailhead-muted">·</span>
            <span className="text-base font-normal text-trailhead-muted">Organizer Dashboard</span>
          </Link>
          <Link
            href="/organizer/dashboard"
            className="text-sm font-medium text-trailhead-muted transition hover:text-white"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="mb-6 text-xl font-bold tracking-tight text-stone-900">Edit profile</h1>
          <ProfileForm organizer={{ ...organizer, social_links: parsedSocialLinks }} />
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama.
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:text-trailhead hover:underline">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/privacy" className="underline-offset-4 hover:text-trailhead hover:underline">
          Privacy Policy
        </Link>
        {" · "}
        <a href="mailto:hello@sama.com.ph" className="underline-offset-4 hover:text-trailhead hover:underline">
          Contact
        </a>
      </footer>
    </div>
  );
}
