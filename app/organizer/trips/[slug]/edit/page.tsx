import Link from "next/link";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { SLOT_CONSUMING_STATUSES, SLOT_HOLDING_STATUSES } from "@/lib/booking-status";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isDownpaymentLocked, resolveTripSlotSummary } from "@/lib/trip-slot-summary";
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

  const { data: organizer, error: organizerError } = await supabase
    .from("organizers")
    .select("id, full_name, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (organizerError) {
    console.error("[trip-edit] organizer fetch failed:", organizerError);
    Sentry.captureException(organizerError, {
      extra: { context: "trip-edit-organizer-fetch-failed", userId: user.id, slug },
    });
  }
  if (!organizer) redirect("/apply");
  if (organizer.status !== "approved") redirect("/organizer/dashboard");

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select(
      "id, status, title, activity_type, difficulty, duration, destination, region, date_start, date_end, price, total_slots, meeting_point, meeting_points, description, includes, what_to_bring, photos, payment_type, min_downpayment, downpayment_cutoff_days, cancellation_policy, cancellation_policy_custom, waiver_text, messenger_gc_link, is_template, template_id, requires_approval, requires_permit_details, custom_questions, custom_question",
    )
    .eq("slug", slug)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  if (tripError) {
    console.error("[trip-edit] trip fetch failed:", tripError);
    Sentry.captureException(tripError, {
      extra: { context: "trip-edit-trip-fetch-failed", slug, organizerId: organizer.id },
    });
  }
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

  // For active trips (not draft, not template), count bookings that would be
  // notified by email if date/price/meeting points change. Matches the
  // notification-trigger status set in app/actions/trip.ts.
  const isActiveTrip = trip.status !== "draft" && !trip.is_template;
  let activeBookingCount = 0;
  if (isActiveTrip) {
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", trip.id)
      .in("status", [...SLOT_HOLDING_STATUSES]);
    activeBookingCount = count ?? 0;
  }

  // Whether the downpayment lock applies (organizer terms 1.4, section 8), so
  // the form can show the payment type and downpayment as fixed instead of
  // letting the organizer edit them only to have the save refused. Computed
  // with updateTrip's own query and rule (app/actions/trip.ts, the slot-summary
  // fetch): the same columns, statuses and admin client, and skipped for drafts
  // and templates as updateTrip skips them. The trip was fetched above filtered
  // to this organizer, so this admin read is scoped to their own trip.
  // Display only: updateTrip still refuses any locked change on its own. If
  // this read fails, the form keeps its editable fields and the save stays the
  // guard.
  let downpaymentLocked = false;
  if (isActiveTrip) {
    const admin = createSupabaseAdminClient();
    const { data: lockBookings, error: lockBookingsError } = await admin
      .from("bookings")
      .select("status, slots, amount_due, total_amount, cancellation_policy")
      .eq("trip_id", trip.id)
      .in("status", [...SLOT_CONSUMING_STATUSES]);
    const resolvedLock = resolveTripSlotSummary(lockBookings, lockBookingsError);
    if ("failure" in resolvedLock) {
      console.error("[trip-edit] downpayment-lock bookings fetch failed:", lockBookingsError);
      Sentry.captureException(
        lockBookingsError ?? new Error("trip-edit downpayment-lock bookings query returned no data"),
        {
          extra: {
            context: "trip-edit-downpayment-lock-fetch-failed",
            failure: resolvedLock.failure,
            tripId: trip.id,
            organizerId: organizer.id,
          },
        },
      );
    } else {
      downpaymentLocked = isDownpaymentLocked(trip.cancellation_policy, resolvedLock.summary);
    }
  }

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

      <main className="mx-auto max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <EditTripForm slug={slug} trip={trip} destinations={destinations} templates={templates} activeBookingCount={activeBookingCount} downpaymentLocked={downpaymentLocked} />
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
