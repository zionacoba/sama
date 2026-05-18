import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { BookingModal } from "@/app/trips/[slug]/booking-modal";

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
  organizer_id: number | null;
};

type OrganizerInfo = {
  full_name: string;
  bio: string | null;
};

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
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

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

  let organizer: OrganizerInfo | null = null;
  if (tripData.organizer_id) {
    const { data } = await supabase
      .from("organizers")
      .select("full_name, bio")
      .eq("id", tripData.organizer_id)
      .maybeSingle();
    organizer = data as OrganizerInfo | null;
  }

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
            <p className="mt-4 text-2xl font-bold text-trailhead">
              {formatPrice(tripData.price)}
            </p>
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
              <p className="mt-3 font-semibold text-stone-900">{organizer.full_name}</p>
              {organizer.bio && (
                <p className="mt-1 leading-relaxed text-stone-600">{organizer.bio}</p>
              )}
            </div>
          )}

          <BookingModal
            tripId={tripData.id}
            tripSlug={slug}
            tripTitle={tripData.title}
            unitPrice={getUnitPrice(tripData.price)}
            remainingSlots={tripData.remaining_slots}
          />
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Sama. Adventure, together.
      </footer>
    </div>
  );
}
