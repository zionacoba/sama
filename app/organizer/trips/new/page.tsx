import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { TripForm } from "./trip-form";

type PageProps = { searchParams: Promise<{ template_id?: string }> };

export default async function NewTripPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/trips/new");

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") {
    redirect("/organizer/apply");
  }

  const { template_id } = await searchParams;

  const [{ data: destinationsData }, { data: templatesData }, { data: templateData }] =
    await Promise.all([
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
        .order("title"),
      template_id
        ? supabase
            .from("trips")
            .select(
              "id, title, activity_type, difficulty, destination, duration, description, includes, what_to_bring, photos, payment_type, min_downpayment, downpayment_cutoff_days, cancellation_policy, cancellation_policy_custom, waiver_text, messenger_gc_link",
            )
            .eq("id", template_id)
            .eq("organizer_id", organizer.id)
            .eq("is_template", true)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const destinations = [
    ...new Set((destinationsData ?? []).map((t: { destination: string }) => t.destination).filter(Boolean)),
  ] as string[];

  const templates = (templatesData ?? []) as { id: string | number; title: string }[];

  const fromTemplate = templateData ?? null;

  return (
    <div className="min-h-full bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-bold tracking-tight hover:opacity-90"
            >
              <img src="/sama-mark.svg" alt="Sama" className="h-7 w-auto" /> Sama
            </Link>
            <p className="mt-0.5 text-sm text-trailhead-muted">
              Organizer Dashboard
            </p>
          </div>
          <Link
            href="/organizer/dashboard"
            className="text-sm font-medium text-trailhead-muted transition hover:text-white"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            {fromTemplate ? `New run from ${fromTemplate.title}` : "Create a new trip"}
          </h1>
          <p className="mt-1 text-stone-600">
            {fromTemplate
              ? "Fill in the date, price, and slots for this run."
              : "Fill in the details below to publish your trip on Sama."}
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <TripForm
            destinations={destinations}
            templates={templates}
            defaultValues={fromTemplate}
            preselectedTemplateId={fromTemplate ? String(fromTemplate.id) : undefined}
          />
        </div>
      </main>
    </div>
  );
}
