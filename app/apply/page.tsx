import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { Navbar } from "@/app/components/navbar";
import { ApplyForm } from "./apply-form";

const statusConfig = {
  pending: {
    icon: "⏳",
    heading: "Application under review",
    body: "We've received your application and will get back to you soon.",
  },
  approved: {
    icon: "✅",
    heading: "You're an approved organizer!",
    body: "Your application was approved. Head to your dashboard to get started.",
  },
  rejected: {
    icon: "❌",
    heading: "Application not approved",
    body: "Unfortunately your application wasn't approved at this time. Feel free to reach out if you have questions.",
  },
};

export default async function ApplyPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/apply");

  const { data: existing } = await supabase
    .from("organizers")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, phone, facebook_url")
    .eq("id", user.id)
    .maybeSingle();

  const fullName = profile?.first_name && profile?.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : null;

  const cfg = existing
    ? statusConfig[existing.status as keyof typeof statusConfig]
    : null;

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <Navbar />

      <main className="mx-auto max-w-xl px-4 py-12 sm:py-16">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          {cfg ? (
            <div className="text-center">
              <p className="text-4xl">{cfg.icon}</p>
              <h1 className="mt-4 text-xl font-bold text-stone-900">
                {cfg.heading}
              </h1>
              <p className="mt-2 text-sm text-stone-600">{cfg.body}</p>
              {existing?.status === "approved" && (
                <Link
                  href="/organizer/dashboard"
                  className="mt-6 inline-block rounded-xl bg-trailhead px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
                >
                  Go to dashboard →
                </Link>
              )}
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                Become an organizer
              </h1>
              <p className="mt-1 text-sm text-stone-600">
                List your outdoor trips on Sama and reach thousands of adventurers.
              </p>
              <div className="mt-8">
                <ApplyForm
                  defaultFullName={fullName}
                  defaultPhone={profile?.phone ?? null}
                  defaultPersonalFacebookUrl={profile?.facebook_url ?? null}
                />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
