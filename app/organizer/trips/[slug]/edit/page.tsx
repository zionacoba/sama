import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { EditTripForm } from "./edit-form";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function EditTripPage({ params }: PageProps) {
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/dashboard");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, full_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer) redirect("/organizer/apply");
  if (organizer.status !== "approved") redirect("/organizer/dashboard");

  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, title, activity_type, difficulty, destination, date_start, price, total_slots, meeting_point, description, includes, what_to_bring, photos, payment_type, min_downpayment, cancellation_policy, cancellation_policy_custom",
    )
    .eq("slug", slug)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  if (!trip) redirect("/organizer/dashboard");

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
            <p className="mt-0.5 text-sm text-trailhead-muted">Edit Trip</p>
          </div>
          <Link
            href="/organizer/dashboard"
            className="text-sm font-medium text-trailhead-muted transition hover:text-white"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="mb-6 text-xl font-bold tracking-tight text-stone-900">
            Edit trip
          </h1>
          <EditTripForm trip={trip} />
        </div>
      </main>
    </div>
  );
}
