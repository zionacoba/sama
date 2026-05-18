import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { BookingModal } from "@/app/trips/[slug]/booking-modal";
import { ShareButton } from "@/app/components/share-button";

type TripDetail = {
  id: number;
  title: string;
  destination: string;
  activity_type: string | null;
  difficulty: string;
  price: string | number;
  description: string;
  date_start: string;
  meeting_point: string;
  total_slots: number;
  remaining_slots: number;
  photos: string[] | null;
  includes: string | null;
  what_to_bring: string | null;
  organizer_id: string | null;
  payment_type: string | null;
  min_downpayment: number | null;
  cancellation_policy: string | null;
  cancellation_policy_custom: string | null;
};

type OrganizerInfo = {
  full_name: string;
  bio: string | null;
  photo_url: string | null;
};

type Review = {
  id: number;
  full_name: string | null;
  rating: number;
  body: string;
  created_at: string;
  trips: { title: string; date_start: string } | null;
};

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const full = Math.round(rating);
  const cls = size === "lg" ? "text-xl" : "text-base";
  return (
    <span aria-label={`${rating.toFixed(1)} out of 5 stars`} className={cls}>
      <span className="text-amber-400">{"★".repeat(full)}</span>
      <span className="text-stone-200">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  const colorClass =
    level === "Beginner"
      ? "bg-emerald-100 text-emerald-800"
      : level === "Intermediate"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colorClass}`}>
      {level}
    </span>
  );
}

function ActivityBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-trailhead-muted px-2.5 py-0.5 text-xs font-semibold text-trailhead">
      {type}
    </span>
  );
}

function formatPrice(price: string | number) {
  if (typeof price === "string") return price;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(price);
}

function getUnitPrice(price: string | number): number {
  if (typeof price === "number") return price;
  const digits = price.replace(/[^\d.]/g, "");
  return parseFloat(digits) || 0;
}

function formatDate(dateStart: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateStart));
}

function formatReviewDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

const CANCELLATION_POLICIES: Record<string, { label: string; color: string; text: string }> = {
  strict:   { label: "Strict",   color: "bg-red-100 text-red-800",     text: "No refund within 7 days of the trip date. Full refund if cancelled more than 7 days before." },
  moderate: { label: "Moderate", color: "bg-amber-100 text-amber-900", text: "50% refund if cancelled 5 or more days before the trip. No refund within 5 days of the trip date." },
  flexible: { label: "Flexible", color: "bg-emerald-100 text-emerald-800", text: "Full refund if cancelled 3 or more days before the trip. 50% refund if cancelled within 3 days." },
  custom:   { label: "Custom",   color: "bg-stone-100 text-stone-700", text: "" },
};

function CancellationPolicyCard({ policy, custom }: { policy: string | null; custom: string | null }) {
  const key = policy ?? "flexible";
  const meta = CANCELLATION_POLICIES[key] ?? CANCELLATION_POLICIES.flexible;
  const text = key === "custom" ? (custom ?? "") : meta.text;
  if (!text) return null;
  return (
    <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold text-stone-900">Cancellation policy</h2>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}>
          {meta.label}
        </span>
      </div>
      <p className="mt-3 leading-relaxed text-stone-600">{text}</p>
    </div>
  );
}

function parseList(text: string | null): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function TripDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const supabase = await createSupabaseServerClient();

  const [{ data: trip }, { data: { user } }] = await Promise.all([
    supabase.from("trips").select("*").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!trip) {
    return (
      <div className="min-h-full bg-stone-50 text-stone-900 font-sans">
        <header className="border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
            <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
              ⛰ Sama
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-2xl font-bold text-stone-900">Not found</h1>
          <p className="mt-2 text-stone-600">
            We couldn&apos;t find a trip with that link.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
          >
            Back to trips
          </Link>
        </main>
      </div>
    );
  }

  const tripData = trip as TripDetail;

  const [
    { data: reviewsData },
    reviewCountResult,
    { data: organizerData },
  ] = await Promise.all([
    tripData.organizer_id
      ? supabase
          .from("reviews")
          .select("id, full_name, rating, body, created_at, trips(title, date_start)")
          .eq("organizer_id", tripData.organizer_id)
          .order("created_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    tripData.organizer_id
      ? supabase
          .from("reviews")
          .select("*", { count: "exact", head: true })
          .eq("organizer_id", tripData.organizer_id)
      : Promise.resolve({ count: 0 }),
    tripData.organizer_id
      ? supabase.from("organizers").select("full_name, bio, photo_url").eq("id", tripData.organizer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const reviews = (reviewsData ?? []) as unknown as Review[];
  const totalReviewCount = reviewCountResult.count ?? reviews.length;
  const organizer = organizerData as OrganizerInfo | null;

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const includesList = parseList(tripData.includes);
  const whatToBringList = parseList(tripData.what_to_bring);

  return (
    <div className="min-h-full bg-stone-50 text-stone-900 font-sans">
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/" className="text-lg font-bold tracking-tight text-trailhead">
            ⛰ Sama
          </Link>
          <Link
            href="/trips"
            className="text-sm font-medium text-stone-600 transition hover:text-trailhead"
          >
            ← All trips
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-stone-200 bg-gradient-to-b from-trailhead-muted/60 to-stone-50 px-4 py-10 sm:py-14">
          <div className="mx-auto max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              {tripData.activity_type && (
                <ActivityBadge type={tripData.activity_type} />
              )}
              <DifficultyBadge level={tripData.difficulty} />
              <span className="text-sm text-stone-600">
                {tripData.remaining_slots} of {tripData.total_slots} slots left
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              {tripData.title}
            </h1>
            <p className="mt-2 text-lg text-stone-600">{tripData.destination}</p>
            {totalReviewCount > 0 && avgRating !== null && (
              <a href="#reviews" className="mt-3 flex items-center gap-2 group w-fit">
                <Stars rating={avgRating} size="lg" />
                <span className="text-sm text-stone-600 group-hover:text-trailhead group-hover:underline underline-offset-4">
                  {avgRating.toFixed(1)} · {totalReviewCount} review{totalReviewCount !== 1 ? "s" : ""}
                </span>
              </a>
            )}
            <div className="mt-4 flex items-center gap-4">
              <p className="text-2xl font-bold text-trailhead">
                {formatPrice(tripData.price)}
              </p>
              <ShareButton
                url={`/trips/${slug}`}
                title={tripData.title}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:border-trailhead hover:text-trailhead"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80">
            {tripData.photos?.[0] && (
              <Image
                src={tripData.photos[0]}
                alt={tripData.title}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 768px, 100vw"
                priority
              />
            )}
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-trailhead">
                Date
              </h2>
              <p className="mt-2 font-medium text-stone-900">
                {formatDate(tripData.date_start)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-trailhead">
                Meeting point
              </h2>
              <p className="mt-2 font-medium text-stone-900">
                {tripData.meeting_point}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:col-span-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-trailhead">
                Availability
              </h2>
              <p className="mt-2 font-medium text-stone-900">
                {tripData.remaining_slots} remaining · {tripData.total_slots} total slots
              </p>
            </div>
          </div>

          <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-bold text-stone-900">About this trip</h2>
            <p className="mt-4 whitespace-pre-line leading-relaxed text-stone-600">
              {tripData.description}
            </p>
          </div>

          {includesList.length > 0 && (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-bold text-stone-900">What&apos;s included</h2>
              <ul className="mt-4 space-y-2">
                {includesList.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-stone-600">
                    <span className="mt-0.5 shrink-0 text-trailhead">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {whatToBringList.length > 0 && (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-bold text-stone-900">What to bring</h2>
              <ul className="mt-4 space-y-2">
                {whatToBringList.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-stone-600">
                    <span className="mt-0.5 shrink-0 text-stone-400">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {organizer && (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="text-lg font-bold text-stone-900">Your organizer</h2>
              <Link
                href={`/organizers/${tripData.organizer_id}`}
                className="mt-4 flex items-center gap-3 group"
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-trailhead-muted text-lg font-bold text-trailhead">
                  {organizer.photo_url ? (
                    <Image src={organizer.photo_url} alt={organizer.full_name} fill className="object-cover" sizes="48px" />
                  ) : (
                    organizer.full_name.charAt(0).toUpperCase()
                  )}
                </div>
                <span className="font-semibold text-trailhead underline-offset-4 group-hover:underline">
                  {organizer.full_name}
                </span>
              </Link>
              {organizer.bio && (
                <p className="mt-3 leading-relaxed text-stone-600">{organizer.bio}</p>
              )}
            </div>
          )}

          <CancellationPolicyCard
            policy={tripData.cancellation_policy}
            custom={tripData.cancellation_policy_custom}
          />

          <BookingModal
            tripId={tripData.id}
            tripSlug={slug}
            tripTitle={tripData.title}
            unitPrice={getUnitPrice(tripData.price)}
            remainingSlots={tripData.remaining_slots}
            paymentType={tripData.payment_type ?? "full"}
            minDownpayment={tripData.min_downpayment ?? null}
          />

          {/* Reviews */}
          {organizer && (
            <div className="mt-12" id="reviews">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-xl font-bold tracking-tight text-stone-900">
                  Reviews for {organizer.full_name}
                  {totalReviewCount > 0 && (
                    <span className="ml-2 text-base font-normal text-stone-500">
                      ({totalReviewCount})
                    </span>
                  )}
                </h2>
                {totalReviewCount > 3 && (
                  <Link
                    href={`/organizers/${tripData.organizer_id}`}
                    className="shrink-0 text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
                  >
                    See all →
                  </Link>
                )}
              </div>

              {reviews.length === 0 && (
                <p className="mt-4 text-stone-500">No reviews yet for this organizer.</p>
              )}

              {reviews.length > 0 && (
                <ul className="mt-6 space-y-4">
                  {reviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-stone-900">
                            {review.full_name ?? "Verified adventurer"}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Stars rating={review.rating} />
                            <span className="text-xs text-stone-400">
                              {formatReviewDate(review.created_at)}
                            </span>
                          </div>
                          {review.trips && (
                            <p className="mt-1 text-xs text-stone-400">
                              {review.trips.title} · {formatReviewDate(review.trips.date_start)}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 leading-relaxed text-stone-600">{review.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              {totalReviewCount > 3 && (
                <Link
                  href={`/organizers/${tripData.organizer_id}`}
                  className="mt-6 inline-block text-sm font-semibold text-trailhead underline-offset-4 hover:underline"
                >
                  See all {totalReviewCount} reviews →
                </Link>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
        {" · "}
        <Link href="/organizer/apply" className="underline-offset-4 hover:text-trailhead hover:underline">
          Become an Organizer
        </Link>
      </footer>
    </div>
  );
}
