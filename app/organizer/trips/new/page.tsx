import Link from "next/link";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { TripForm } from "./trip-form";

type PageProps = { searchParams: Promise<{ template_id?: string; template?: string }> };

export default async function NewTripPage({ searchParams }: PageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/organizer/trips/new");

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[trip-new] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "trip-new-organizer-fetch-failed", userId: user.id },
    });
  }
  if (!organizer || organizer.status !== "approved") {
    redirect("/apply");
  }

  const { template_id, template } = await searchParams;

  const [{ data: destinationsData }, { data: templatesData }, { data: templateData, error: templateError }] =
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
              "id, title, activity_type, difficulty, destination, region, duration, description, includes, what_to_bring, photos, payment_type, min_downpayment, downpayment_cutoff_days, cancellation_policy, cancellation_policy_custom, waiver_text, messenger_gc_link, custom_questions, custom_question",
            )
            .eq("id", template_id)
            .eq("organizer_id", organizer.id)
            .eq("is_template", true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  if (templateError) {
    console.error("[trip-new] template fetch failed:", templateError);
    Sentry.captureException(templateError, {
      extra: { context: "trip-new-template-fetch-failed", templateId: template_id, organizerId: organizer.id },
    });
  }

  const destinations = [
    ...new Set((destinationsData ?? []).map((t: { destination: string }) => t.destination).filter(Boolean)),
  ] as string[];

  const templates = (templatesData ?? []) as { id: string | number; title: string }[];

  const fromTemplate = templateData ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-bold tracking-tight hover:opacity-90"
          >
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

      <main className="mx-auto max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <TripForm
          destinations={destinations}
          templates={templates}
          defaultValues={fromTemplate}
          preselectedTemplateId={fromTemplate ? String(fromTemplate.id) : undefined}
          fromTemplateName={fromTemplate?.title ?? null}
          defaultIsTemplate={template === "true"}
        />
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
