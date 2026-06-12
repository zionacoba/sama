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

  if (!organizer) redirect("/apply");
  if (organizer.status !== "approved") redirect("/organizer/dashboard");

  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, status, title, activity_type, difficulty, duration, destination, region, date_start, date_end, price, total_slots, meeting_point, meeting_points, description, includes, what_to_bring, photos, payment_type, min_downpayment, downpayment_cutoff_days, cancellation_policy, cancellation_policy_custom, waiver_text, messenger_gc_link, is_template, template_id, custom_questions, custom_question",
    )
    .eq("slug", slug)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  if (!trip) redirect("/organizer/dashboard");

  const [{ data: destinationsData }, { data: templatesData }] = await Promise.all([
    supabase
      .from("trips")
      .select("destination")
      .not("destination", "is", null)
      .order("destination"),
    supabase
      .from("trips")
      .select("id, title")
      .eq("organizer_id", organizer.id)
      .eq("is_template", true)
      .neq("id", trip.id)
      .order("title"),
  ]);

  const destinations = [
    ...new Set((destinationsData ?? []).map((t: { destination: string }) => t.destination).filter(Boolean)),
  ] as string[];

  const templates = (templatesData ?? []) as { id: string | number; title: string }[];

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-tight hover:opacity-90"
          >
            <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto brightness-0 invert" />
            Sama
            <span className="mx-1 font-normal text-trailhead-muted">·</span>
            <span className="text-base font-normal text-trailhead-muted">Edit Trip</span>
          </Link>
          <Link
            href="/organizer/dashboard"
            className="text-sm font-medium text-trailhead-muted transition hover:text-white"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <EditTripForm slug={slug} trip={trip} destinations={destinations} templates={templates} />
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
