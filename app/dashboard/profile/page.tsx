import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("birthdate, emergency_contact_name, emergency_contact_phone")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
          <Link
            href="/dashboard/bookings"
            className="text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            ← My Bookings
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          My profile
        </h1>
        <p className="mt-1 text-stone-500">{fullName || user.email}</p>

        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold text-stone-900">Safety information</h2>
          <p className="mt-1 text-sm text-stone-500">
            Helps organizers maintain accurate safety and registration records for their trips.
          </p>
          <div className="mt-6">
            <ProfileForm
              birthdate={profile?.birthdate ?? null}
              emergencyContactName={profile?.emergency_contact_name ?? null}
              emergencyContactPhone={profile?.emergency_contact_phone ?? null}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
      </footer>
    </div>
  );
}
