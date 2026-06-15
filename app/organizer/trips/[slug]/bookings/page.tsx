import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BookingActions } from "@/app/organizer/dashboard/booking-actions";
import { notifyWaitlistEntry } from "@/app/actions/waitlist";
import { ExportCsvButton } from "./export-csv-button";
import { MarkBalanceButton } from "./mark-balance-button";
import { BookingsListWithTabs } from "./bookings-list";
import { formatPeso } from "@/lib/format";

type WaitlistEntry = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  slots: number;
  created_at: string;
  notified: boolean;
};

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ view?: string }>;
};

type Booking = {
  id: number;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  slots: number;
  total_amount: number;
  amount_due: number | null;
  payment_option: string;
  balance_collected: boolean;
  balance_payment_gateway_status: string | null;
  status: string;
  created_at: string;
  participants: string[] | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  waiver_agreed: boolean;
  medical_notes: string | null;
  notes: string | null;
  meeting_point: string | null;
  facebook_url?: string | null;
  nickname?: string | null;
  custom_question_answers?: string[] | null;
  custom_question_answer?: string | null;
  custom_questions_snapshot?: string[] | null;
};

type BookingParticipant = {
  booking_id: number;
  slot_number: number;
  full_name: string | null;
  completed: boolean;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    cancelled: "bg-red-100 text-red-700",
    rejected: "bg-red-100 text-red-700",
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-stone-100 text-stone-600"}`}>
      {label}
    </span>
  );
}

const NO_PICKUP = "No pickup point selected";

export default async function TripBookingsPage({ params, searchParams }: PageProps) {
  const [{ slug }, { view }] = await Promise.all([params, searchParams]);
  const activeView = view === "waitlist" ? "waitlist" : view === "grouped" ? "grouped" : "list";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/organizer/trips/${slug}/bookings`);

  const { data: organizer } = await supabase
    .from("organizers")
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!organizer || organizer.status !== "approved") redirect("/organizer/dashboard");

  const { data: trip } = await supabase
    .from("trips")
    .select("id, title, slug, difficulty, activity_type, date_start, total_slots, remaining_slots, price, payment_type, min_downpayment, custom_questions, custom_question")
    .eq("slug", slug)
    .eq("organizer_id", organizer.id)
    .maybeSingle();

  if (!trip) redirect("/organizer/dashboard");

  const admin = createSupabaseAdminClient();

  const [{ data: bookingsData }, { data: waitlistData }] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, user_id, full_name, email, phone, slots, total_amount, amount_due, payment_option, balance_collected, balance_payment_gateway_status, status, created_at, participants, emergency_contact_name, emergency_contact_phone, waiver_agreed, medical_notes, notes, meeting_point, custom_question_answers, custom_question_answer, custom_questions_snapshot"
      )
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false }),
    admin
      .from("waitlist")
      .select("id, full_name, email, phone, slots, created_at, notified")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: true }),
  ]);

  const rawBookings = (bookingsData ?? []) as Booking[];
  const waitlist = (waitlistData ?? []) as WaitlistEntry[];

  const userIds = rawBookings.map((b) => b.user_id).filter((id): id is string => id != null);
  let facebookUrlMap = new Map<string, string | null>();
  let nicknameMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profilesData } = await admin
      .from("profiles")
      .select("id, facebook_url, nickname")
      .in("id", userIds);
    facebookUrlMap = new Map((profilesData ?? []).map((p: { id: string; facebook_url: string | null }) => [p.id, p.facebook_url]));
    nicknameMap = new Map((profilesData ?? []).map((p: { id: string; nickname: string | null }) => [p.id, p.nickname]));
  }

  const bookings: Booking[] = rawBookings.map((b) => ({
    ...b,
    facebook_url: b.user_id ? (facebookUrlMap.get(b.user_id) ?? null) : null,
    nickname: b.user_id ? (nicknameMap.get(b.user_id) ?? null) : null,
  }));

  // Load per-slot participant rows for multi-slot bookings (the {done}/{slots}
  // manifest) and also for transferred bookings, whose repurposed slot-0 row
  // carries the replacement's completion status shown in the organizer view.
  const participantBookingIds = bookings
    .filter((b) => b.slots > 1 || b.status === "transferred")
    .map((b) => b.id);
  const participantsMap = new Map<number, BookingParticipant[]>();

  if (participantBookingIds.length > 0) {
    const { data: participantsData } = await admin
      .from("booking_participants")
      .select("booking_id, slot_number, full_name, completed")
      .in("booking_id", participantBookingIds)
      .order("slot_number");

    for (const p of (participantsData ?? []) as BookingParticipant[]) {
      if (!participantsMap.has(p.booking_id)) participantsMap.set(p.booking_id, []);
      participantsMap.get(p.booking_id)!.push(p);
    }
  }

  const pending = bookings.filter((b) => b.status === "pending");
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  const rejected = bookings.filter((b) => b.status === "rejected" || b.status === "cancelled" || b.status === "transferred" || b.status === "no_show");

  const needsManualApproval = trip.difficulty === "Advanced";
  const awaitingPayment = bookings.filter((b) => b.status === "payment_pending");
  const slotsBooked = bookings
    .filter((b) => b.status === "confirmed" || b.status === "pending" || b.status === "payment_pending")
    .reduce((sum, b) => sum + b.slots, 0);

  // Grouped view: confirmed + pending only, grouped by meeting_point
  const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "pending");
  const groupMap = new Map<string, Booking[]>();
  for (const b of activeBookings) {
    const key = b.meeting_point?.trim() || NO_PICKUP;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(b);
  }
  const groups = Array.from(groupMap.entries()).sort(([a], [b]) => {
    if (a === NO_PICKUP) return 1;
    if (b === NO_PICKUP) return -1;
    return a.localeCompare(b);
  });

  const baseUrl = `/organizer/trips/${slug}/bookings`;

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900">
      <header className="border-b border-trailhead-dark/20 bg-trailhead text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight hover:opacity-90">
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

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Trip summary */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-stone-500">
                {trip.activity_type ?? "Trip"} · {trip.difficulty}
              </p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                {trip.title}
              </h1>
              <p className="mt-1 text-stone-500">{formatDate(trip.date_start)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-bold text-trailhead">
                {slotsBooked}
                <span className="text-base font-normal text-stone-500"> / {trip.total_slots}</span>
              </p>
              <p className="text-sm text-stone-500">slots filled</p>
            </div>
          </div>

          {/* Fill bar */}
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-2 rounded-full bg-trailhead transition-all"
                style={{ width: `${trip.total_slots > 0 ? Math.min(100, (slotsBooked / trip.total_slots) * 100) : 0}%` }}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {pending.length} pending
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              {confirmed.length} confirmed
            </span>
            {awaitingPayment.length > 0 && (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-700">
                {awaitingPayment.length} awaiting payment
              </span>
            )}
            {rejected.length > 0 && (
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-500">
                {rejected.length} cancelled / rejected
              </span>
            )}
            {waitlist.length > 0 && (
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                {waitlist.length} waitlisted
              </span>
            )}
          </div>
        </div>

        {/* View toggle + status tabs */}
        {activeView === "list" ? (
          <BookingsListWithTabs
            bookings={bookings}
            participantsRecord={Object.fromEntries(
              Array.from(participantsMap.entries()).map(([k, v]) => [String(k), v])
            )}
            needsManualApproval={needsManualApproval}
            price={trip.price}
            paymentType={trip.payment_type}
            minDownpayment={trip.min_downpayment}
            tripDateStart={trip.date_start}
            customQuestions={(trip as { custom_questions?: string[] | null }).custom_questions ?? null}
            customQuestion={(trip as { custom_question?: string | null }).custom_question ?? null}
            navLinks={
              <>
                <Link
                  href={`${baseUrl}?view=grouped`}
                  className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
                >
                  By pickup point
                </Link>
                <Link
                  href={`${baseUrl}?view=waitlist`}
                  className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
                >
                  {`Waitlist${waitlist.length > 0 ? ` (${waitlist.length})` : ""}`}
                </Link>
                <ExportCsvButton
                  bookings={bookings}
                  tripTitle={trip.title}
                  tripDate={trip.date_start}
                />
              </>
            }
          />
        ) : (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={baseUrl}
                className="rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
              >
                Bookings
              </Link>
              {(
                [
                  { key: "grouped", label: "By pickup point", href: `${baseUrl}?view=grouped` },
                  { key: "waitlist", label: `Waitlist${waitlist.length > 0 ? ` (${waitlist.length})` : ""}`, href: `${baseUrl}?view=waitlist` },
                ] as const
              ).map(({ key, label, href }) => (
                <Link
                  key={key}
                  href={href}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                    activeView === key
                      ? "bg-trailhead text-white shadow-sm"
                      : "border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
            <ExportCsvButton
              bookings={bookings}
              tripTitle={trip.title}
              tripDate={trip.date_start}
            />
          </div>
        )}

        {/* Grouped view */}
        {activeView === "grouped" && (
          <div className="mt-4 space-y-4">
            {trip.payment_type === "downpayment" && trip.min_downpayment != null ? (
              <div className="text-sm text-stone-500 mb-3">
                Trip price: {formatPeso(trip.price)} · Downpayment: {formatPeso(trip.min_downpayment)} · Balance due: {formatPeso(trip.price - trip.min_downpayment)}
              </div>
            ) : (
              <div className="text-sm text-stone-500 mb-3">
                Trip price: {formatPeso(trip.price)} · Full payment
              </div>
            )}
            {activeBookings.length === 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center text-sm text-stone-500">
                No confirmed or pending bookings yet.
              </div>
            )}
            {groups.map(([label, group]) => {
              const totalSlots = group.reduce((sum, b) => sum + b.slots, 0);
              const isUnknown = label === NO_PICKUP;
              return (
                <div key={label} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                  <div className={`flex items-center gap-3 border-b border-stone-100 px-5 py-3.5 ${isUnknown ? "bg-stone-50" : "bg-white"}`}>
                    <h2 className={`font-semibold ${isUnknown ? "text-stone-500 italic" : "text-stone-900"}`}>
                      {label}
                    </h2>
                    <span className="rounded-full bg-trailhead-muted px-2.5 py-0.5 text-xs font-semibold text-trailhead">
                      {totalSlots} {totalSlots === 1 ? "joiner" : "joiners"}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-stone-100 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                          <th className="px-5 py-3">Name</th>
                          <th className="px-5 py-3 text-center">Slots</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3">Payment</th>
                          <th className="px-5 py-3">Booked on</th>
                          {needsManualApproval && <th className="px-5 py-3" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {group.map((b) => (
                          <tr key={b.id} className="hover:bg-stone-50">
                            <td className="px-5 py-3.5 font-medium text-stone-900">
                              <div>
                                {b.nickname && <span className="font-medium">{b.nickname}</span>}
                                <span className={b.nickname ? "text-sm text-stone-500 block" : "font-medium"}>
                                  {b.full_name}
                                </span>
                              </div>
                              {b.facebook_url && (
                                <a
                                  href={b.facebook_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-0 text-xs text-trailhead hover:underline"
                                >
                                  FB Profile
                                </a>
                              )}
                              {(b.medical_notes || b.notes) && (
                                <p className="text-xs text-stone-600 mt-0.5">
                                  🏥 {[b.medical_notes, b.notes].filter(Boolean).join(' · ')}
                                </p>
                              )}
                              {(() => {
                                const qs: string[] = b.custom_questions_snapshot ?? (trip as { custom_questions?: string[] | null; custom_question?: string | null }).custom_questions ?? ((trip as { custom_question?: string | null }).custom_question ? [(trip as { custom_question?: string | null }).custom_question!] : []);
                                const as_: string[] = (b.custom_question_answers as string[] | null) ?? (b.custom_question_answer ? [b.custom_question_answer] : []);
                                return qs.map((q, qi) => as_[qi] ? (
                                  <p key={qi} className="text-xs text-stone-500 mt-0.5">
                                    <span className="font-medium text-stone-600">{q}:</span>{" "}
                                    {as_[qi]}
                                  </p>
                                ) : null);
                              })()}
                            </td>
                            <td className="px-5 py-3.5 text-center text-stone-700">
                              {b.slots}
                              {b.slots > 1 && participantsMap.has(b.id) && (() => {
                                const ps = participantsMap.get(b.id)!;
                                const done = ps.filter((p) => p.completed).length;
                                return (
                                  <details className="mt-1 text-left">
                                    <summary className="cursor-pointer list-none text-xs font-medium text-stone-500 hover:text-stone-600">
                                      {done}/{b.slots} confirmed
                                    </summary>
                                    <ul className="mt-1 space-y-0.5 pl-0.5">
                                      {ps.map((p) => (
                                        <li key={p.slot_number} className="flex items-center gap-1 text-xs">
                                          <span className={p.completed ? "text-emerald-500" : "text-stone-300"}>●</span>
                                          <span className={p.completed ? "text-stone-700" : "text-stone-500"}>
                                            {p.full_name ?? `Participant ${p.slot_number + 1}`}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                );
                              })()}
                            </td>
                            <td className="px-5 py-3.5">
                              <StatusBadge status={b.status} />
                            </td>
                            <td className="px-5 py-3.5">
                              {b.payment_option === "downpayment" && b.amount_due != null ? (
                                b.balance_collected ? (
                                  <span className="text-xs font-semibold text-emerald-600">Fully paid</span>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">Balance pending</span>
                                    {b.status === "confirmed" && (
                                      <>
                                        <MarkBalanceButton
                                          bookingId={b.id}
                                          participantName={b.full_name}
                                          balanceAmount={formatPeso(b.total_amount - b.amount_due)}
                                        />
                                        <span className="text-xs text-stone-500">Participant can pay balance online or directly to you. Mark as collected once received. Balance payments made online are remitted 24-48 hours after the trip date.</span>
                                      </>
                                    )}
                                  </div>
                                )
                              ) : (
                                <span className="text-xs text-stone-500">Paid in full</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-stone-500">{formatDateTime(b.created_at)}</td>
                            {needsManualApproval && (
                              <td className="px-5 py-3.5 text-right">
                                {b.status === "pending" && <BookingActions bookingId={b.id} />}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Waitlist tab */}
        {activeView === "waitlist" && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            {waitlist.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-stone-500">No waitlist entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3">Phone</th>
                      <th className="px-5 py-3 text-center">Slots</th>
                      <th className="px-5 py-3">Joined on</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {waitlist.map((entry) => (
                      <tr key={entry.id} className="hover:bg-stone-50">
                        <td className="px-5 py-3.5 font-medium text-stone-900">{entry.full_name}</td>
                        <td className="px-5 py-3.5 text-stone-500">{entry.email}</td>
                        <td className="px-5 py-3.5 text-stone-500">{entry.phone ?? "—"}</td>
                        <td className="px-5 py-3.5 text-center text-stone-700">{entry.slots}</td>
                        <td className="px-5 py-3.5 text-stone-500">{formatDateTime(entry.created_at)}</td>
                        <td className="px-5 py-3.5 text-right">
                          {entry.notified ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              Notified ✓
                            </span>
                          ) : (
                            <form action={notifyWaitlistEntry}>
                              <input type="hidden" name="id" value={entry.id} />
                              <button
                                type="submit"
                                className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-trailhead hover:text-trailhead"
                              >
                                Notify
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
