"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

type Trip = {
  id: number;
  slug: string;
  title: string;
  activity_type: string | null;
  difficulty: string;
  date_start: string;
  price: number;
  total_slots: number;
  remaining_slots: number;
  photos: string[] | null;
  status: string;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function DifficultyBadge({ level }: { level: string }) {
  const colorClass =
    level === "Beginner"
      ? "bg-emerald-100 text-emerald-800"
      : level === "Intermediate"
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {level}
    </span>
  );
}

const PAGE_SIZE = 6;

function groupByMonth(trips: Trip[]) {
  const groups: { label: string; key: string; trips: Trip[] }[] = [];
  for (const trip of trips) {
    const date = new Date(trip.date_start);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-PH", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Manila",
    }).format(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.trips.push(trip);
    } else {
      groups.push({ label, key, trips: [trip] });
    }
  }
  return groups;
}

export function OrganizerTripsSection({ trips }: { trips: Trip[] }) {
  const now = new Date().toISOString();

  const upcoming = trips
    .filter((t) => t.status === "active" && t.date_start > now)
    .sort((a, b) => a.date_start.localeCompare(b.date_start));

  const past = trips
    .filter((t) => t.status === "active" && t.date_start <= now)
    .sort((a, b) => b.date_start.localeCompare(a.date_start));

  const defaultTab: "upcoming" | "past" = upcoming.length > 0 ? "upcoming" : "past";
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">(defaultTab);
  const [activeFilter, setActiveFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const activeTripList = activeTab === "upcoming" ? upcoming : past;

  const activityTypes = [
    ...new Set(activeTripList.map((t) => t.activity_type).filter((v): v is string => !!v)),
  ];
  const showFilter = activityTypes.length > 1;

  const filteredTrips =
    activeFilter === "all"
      ? activeTripList
      : activeTripList.filter((t) => t.activity_type === activeFilter);

  const visibleTrips = filteredTrips.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTrips.length;

  const handleTabChange = useCallback((tab: "upcoming" | "past") => {
    setActiveTab(tab);
    setActiveFilter("all");
    setVisibleCount(PAGE_SIZE);
  }, []);

  const handleFilterChange = useCallback((filter: string) => {
    setActiveFilter(filter);
    setVisibleCount(PAGE_SIZE);
  }, []);

  return (
    <section className="mt-8">
      <div className="flex items-center gap-1 border-b border-stone-200">
        <button
          onClick={() => handleTabChange("upcoming")}
          className={`-mb-px border-b-2 px-1 pb-2.5 pt-1 text-sm font-semibold transition ${
            activeTab === "upcoming"
              ? "border-trailhead text-trailhead"
              : "border-transparent text-stone-500 hover:text-stone-700"
          }`}
        >
          Upcoming
          <span className={`ml-1.5 text-xs font-normal ${activeTab === "upcoming" ? "text-trailhead/70" : "text-stone-400"}`}>
            ({upcoming.length})
          </span>
        </button>
        <button
          onClick={() => handleTabChange("past")}
          className={`-mb-px ml-4 border-b-2 px-1 pb-2.5 pt-1 text-sm font-semibold transition ${
            activeTab === "past"
              ? "border-trailhead text-trailhead"
              : "border-transparent text-stone-500 hover:text-stone-700"
          }`}
        >
          Past
          <span className={`ml-1.5 text-xs font-normal ${activeTab === "past" ? "text-trailhead/70" : "text-stone-400"}`}>
            ({past.length})
          </span>
        </button>
      </div>

      {showFilter && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => handleFilterChange("all")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              activeFilter === "all"
                ? "border-trailhead bg-trailhead text-white"
                : "border-stone-200 text-stone-600 hover:border-trailhead hover:text-trailhead"
            }`}
          >
            All
          </button>
          {activityTypes.map((type) => (
            <button
              key={type}
              onClick={() => handleFilterChange(type)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                activeFilter === type
                  ? "border-trailhead bg-trailhead text-white"
                  : "border-stone-200 text-stone-600 hover:border-trailhead hover:text-trailhead"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {filteredTrips.length === 0 ? (
        <p className="mt-4 text-stone-500">
          {activeTab === "upcoming" ? "No upcoming trips at the moment." : "No past trips yet."}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-6">
            {groupByMonth(visibleTrips).map((group) => (
              <div key={group.key}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">{group.label}</p>
                <ul className="flex flex-col gap-3">
                  {group.trips.map((trip) => (
                    <li key={trip.id}>
                      <Link
                        href={`/trips/${trip.slug}`}
                        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2"
                      >
                        <article className="flex overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md">
                          <div className="relative w-[100px] shrink-0 overflow-hidden bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80 sm:w-[140px]">
                            {trip.photos?.[0] && (
                              <Image
                                src={trip.photos[0]}
                                alt={trip.title}
                                fill
                                className="object-cover"
                                sizes="(min-width: 640px) 140px, 100px"
                                quality={80}
                              />
                            )}
                          </div>
                          <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {trip.activity_type && (
                                <span className="inline-flex items-center rounded-full bg-trailhead-muted px-2 py-0.5 text-xs font-semibold text-trailhead">
                                  {trip.activity_type}
                                </span>
                              )}
                              <DifficultyBadge level={trip.difficulty} />
                            </div>
                            <h3 className="line-clamp-2 font-bold leading-snug text-stone-900">{trip.title}</h3>
                            <p className="text-xs text-stone-400">{formatDate(trip.date_start)}</p>
                            <div className="mt-auto flex items-baseline gap-3">
                              <p className="text-base font-bold text-trailhead">{formatPrice(trip.price)}</p>
                              {activeTab === "upcoming" && (
                                <p className={`text-xs font-medium ${trip.remaining_slots < 5 ? "text-red-600" : "text-stone-400"}`}>
                                  {trip.remaining_slots} slot{trip.remaining_slots !== 1 ? "s" : ""} left
                                </p>
                              )}
                            </div>
                          </div>
                        </article>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="rounded-xl border border-stone-200 bg-white px-6 py-2.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead"
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
