"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { BookingActions } from "@/app/organizer/dashboard/booking-actions";
import { MarkBalanceButton } from "./mark-balance-button";
import { MarkTransferButton } from "./mark-transfer-button";
import { MarkNoShowButton } from "./mark-no-show-button";
import { safeExternalUrl } from "@/lib/safe-url";
import { formatPeso } from "@/lib/format";

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
};

type BookingParticipant = {
  booking_id: number;
  slot_number: number;
  full_name: string | null;
  completed: boolean;
};

type Tab = "confirmed" | "pending" | "awaiting_payment" | "all" | "cancelled";

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
    payment_pending: "bg-sky-100 text-sky-700",
    transferred: "bg-stone-100 text-stone-600",
    no_show: "bg-stone-100 text-stone-500",
  };
  const labels: Record<string, string> = {
    payment_pending: "Awaiting payment",
    transferred: "Transferred",
    no_show: "No show",
  };
  const label = labels[status] ?? (status.charAt(0).toUpperCase() + status.slice(1));
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? "bg-stone-100 text-stone-600"}`}
    >
      {label}
    </span>
  );
}

function BookingCard({
  b,
  participants,
  needsManualApproval,
  tripHasPassed,
  customQuestions,
  customQuestion,
}: {
  b: Booking;
  participants: BookingParticipant[] | undefined;
  needsManualApproval: boolean;
  tripHasPassed: boolean;
  customQuestions?: string[] | null;
  customQuestion?: string | null;
}) {
  const qs: string[] = customQuestions ?? (customQuestion ? [customQuestion] : []);
  const answers: string[] =
    (b.custom_question_answers as string[] | null) ?? (b.custom_question_answer ? [b.custom_question_answer] : []);
  const showBalance = b.payment_option === "downpayment" && b.amount_due != null;
  const balance = showBalance ? b.total_amount - (b.amount_due as number) : 0;
  const showActions = (b.status === "pending" && needsManualApproval) || b.status === "confirmed";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {b.nickname && <div className="font-semibold text-stone-900">{b.nickname}</div>}
          <div className={b.nickname ? "text-sm text-stone-500" : "font-semibold text-stone-900"}>{b.full_name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <a href={`tel:${b.phone}`} className="text-xs text-stone-500 hover:text-trailhead hover:underline">
              {b.phone}
            </a>
            {safeExternalUrl(b.facebook_url) && (
              <a
                href={safeExternalUrl(b.facebook_url)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-trailhead hover:underline"
              >
                FB Profile
              </a>
            )}
          </div>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {(b.medical_notes || b.notes) && (
        <p className="mt-2 text-xs text-stone-600">
          🏥 {[b.medical_notes, b.notes].filter(Boolean).join(" · ")}
        </p>
      )}
      {qs.map((q, qi) =>
        answers[qi] ? (
          <p key={qi} className="mt-1 text-xs text-stone-500">
            <span className="font-medium text-stone-600">{q}:</span> {answers[qi]}
          </p>
        ) : null,
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-stone-100 pt-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Email</dt>
          <dd className="mt-0.5 break-words text-stone-600">{b.email}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Emergency contact</dt>
          <dd className="mt-0.5 text-stone-700">
            {b.emergency_contact_name ? (
              <>
                <span className="font-medium">{b.emergency_contact_name}</span>
                {b.emergency_contact_phone && (
                  <span className="block text-stone-600">{b.emergency_contact_phone}</span>
                )}
              </>
            ) : (
              <span className="text-stone-300">—</span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Slots</dt>
          <dd className="mt-0.5 text-stone-700">{b.slots}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">Booked on</dt>
          <dd className="mt-0.5 text-stone-500">{formatDateTime(b.created_at)}</dd>
        </div>
      </dl>

      {b.slots > 1 &&
        participants &&
        (() => {
          const done = participants.filter((p) => p.completed).length;
          return (
            <details className="mt-3">
              <summary className="cursor-pointer list-none text-xs font-medium text-stone-500 hover:text-stone-600">
                {done}/{b.slots} confirmed
              </summary>
              <ul className="mt-1 space-y-0.5 pl-0.5">
                {participants.map((p) => (
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

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-stone-100 pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Amount</span>
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold text-trailhead">{formatPeso(b.total_amount)}</span>
          {showBalance &&
            (b.balance_collected ? (
              b.balance_payment_gateway_status === "paid" ? (
                <span className="text-xs font-semibold text-emerald-600">Paid online ✓</span>
              ) : (
                <span className="text-xs font-semibold text-emerald-600">Collected ✓</span>
              )
            ) : (
              <div className="flex flex-col items-end gap-1">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
                  Balance pending
                </span>
                {b.status === "confirmed" && (
                  <MarkBalanceButton
                    bookingId={b.id}
                    participantName={b.full_name}
                    balanceAmount={formatPeso(balance)}
                  />
                )}
              </div>
            ))}
        </div>
      </div>

      {showActions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
          {b.status === "pending" && needsManualApproval && <BookingActions bookingId={b.id} />}
          {b.status === "confirmed" && (
            <>
              <MarkTransferButton bookingId={b.id} participantName={b.full_name} />
              {tripHasPassed && <MarkNoShowButton bookingId={b.id} participantName={b.full_name} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function BookingsListWithTabs({
  bookings,
  participantsRecord,
  needsManualApproval,
  navLinks,
  price,
  paymentType,
  minDownpayment,
  tripDateStart,
  customQuestions,
  customQuestion,
}: {
  bookings: Booking[];
  participantsRecord: Record<string, BookingParticipant[]>;
  needsManualApproval: boolean;
  navLinks: ReactNode;
  price: number;
  paymentType: string | null;
  minDownpayment: number | null;
  tripDateStart: string;
  customQuestions?: string[] | null;
  customQuestion?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("confirmed");

  const todayPH = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const tripHasPassed = tripDateStart < todayPH;

  const confirmedBookings = bookings.filter((b) => b.status === "confirmed");
  const pendingBookings = bookings.filter((b) => b.status === "pending");
  const awaitingPaymentBookings = bookings.filter((b) => b.status === "payment_pending");
  const cancelledBookings = bookings.filter(
    (b) => b.status === "cancelled" || b.status === "rejected" || b.status === "transferred" || b.status === "no_show",
  );

  const displayed =
    tab === "confirmed"
      ? confirmedBookings
      : tab === "pending"
        ? pendingBookings
        : tab === "awaiting_payment"
          ? awaitingPaymentBookings
          : tab === "cancelled"
            ? cancelledBookings
            : bookings;

  const tabs: { key: Tab; label: string; count: number; badge?: string }[] = [
    { key: "confirmed", label: "Confirmed", count: confirmedBookings.length },
    { key: "pending", label: "Pending", count: pendingBookings.length, badge: "amber" },
    { key: "awaiting_payment", label: "Awaiting Payment", count: awaitingPaymentBookings.length, badge: "sky" },
    { key: "all", label: "All", count: bookings.length },
    { key: "cancelled", label: "Cancelled / Rejected / No shows", count: cancelledBookings.length },
  ];

  const emptyMessage =
    tab === "confirmed"
      ? "No confirmed bookings yet."
      : tab === "pending"
        ? "No pending bookings."
        : tab === "awaiting_payment"
          ? "No bookings awaiting payment."
          : tab === "cancelled"
            ? "No cancelled, rejected, transferred, or no show bookings."
            : "No bookings yet.";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(({ key, label, count, badge }) => {
            const isActive = tab === key;
            const badgeClass = isActive
              ? "bg-white/20 text-white"
              : badge === "amber" && count > 0
                ? "bg-amber-100 text-amber-800"
                : badge === "sky" && count > 0
                  ? "bg-sky-100 text-sky-700"
                  : "bg-stone-100 text-stone-500";
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-trailhead text-white shadow-sm"
                    : "border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none ${badgeClass}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">{navLinks}</div>
      </div>

      {paymentType === "downpayment" && minDownpayment != null ? (
        <div className="text-sm text-stone-500 mb-3">
          Trip price: {formatPeso(price)} · Downpayment: {formatPeso(minDownpayment)} · Balance due: {formatPeso(price - minDownpayment)}
        </div>
      ) : (
        <div className="text-sm text-stone-500 mb-3">
          Trip price: {formatPeso(price)} · Full payment
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <p className="px-6 py-12 text-center text-sm text-stone-500">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-3 lg:hidden">
            {displayed.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                participants={participantsRecord[String(b.id)]}
                needsManualApproval={needsManualApproval}
                tripHasPassed={tripHasPassed}
                customQuestions={customQuestions}
                customQuestion={customQuestion}
              />
            ))}
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Emergency contact</th>
                  <th className="px-5 py-3 text-center">Slots</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Booked on</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {displayed.map((b) => {
                  const participants = participantsRecord[String(b.id)];
                  return (
                    <tr key={b.id} className="hover:bg-stone-50">
                      <td className="px-5 py-3.5 font-medium text-stone-900">
                        <div>
                          {b.nickname && <span className="font-medium">{b.nickname}</span>}
                          <span className={b.nickname ? "text-sm text-stone-500 block" : "font-medium"}>
                            {b.full_name}
                          </span>
                        </div>
                        <a
                          href={`tel:${b.phone}`}
                          className="text-xs text-stone-500 hover:text-trailhead hover:underline"
                        >
                          {b.phone}
                        </a>
                        {safeExternalUrl(b.facebook_url) && (
                          <a
                            href={safeExternalUrl(b.facebook_url)!}
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
                          const qs: string[] = customQuestions ?? (customQuestion ? [customQuestion] : []);
                          const as_: string[] = (b.custom_question_answers as string[] | null) ?? (b.custom_question_answer ? [b.custom_question_answer] : []);
                          return qs.map((q, qi) => as_[qi] ? (
                            <p key={qi} className="text-xs text-stone-500 mt-0.5">
                              <span className="font-medium text-stone-600">{q}:</span>{" "}
                              {as_[qi]}
                            </p>
                          ) : null);
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-stone-500">{b.email}</td>
                      <td className="px-5 py-3.5 text-stone-700">
                        {b.emergency_contact_name ? (
                          <>
                            <span className="font-medium">{b.emergency_contact_name}</span>
                            {b.emergency_contact_phone && (
                              <>
                                <br />
                                <span className="text-stone-600">{b.emergency_contact_phone}</span>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center text-stone-700">
                        {b.slots}
                        {b.slots > 1 && participants && (() => {
                          const done = participants.filter((p) => p.completed).length;
                          return (
                            <details className="mt-1 text-left">
                              <summary className="cursor-pointer list-none text-xs font-medium text-stone-500 hover:text-stone-600">
                                {done}/{b.slots} confirmed
                              </summary>
                              <ul className="mt-1 space-y-0.5 pl-0.5">
                                {participants.map((p) => (
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
                      <td className="px-5 py-3.5 text-right font-semibold text-trailhead">
                        {formatPeso(b.total_amount)}
                        {b.payment_option === "downpayment" && b.amount_due != null && (() => {
                          const balance = b.total_amount - b.amount_due;
                          return (
                            <div className="mt-0.5 flex flex-col items-end gap-0.5">
                              {b.balance_collected ? (
                                b.balance_payment_gateway_status === "paid" ? (
                                  <span className="text-xs font-semibold text-emerald-600">Paid online ✓</span>
                                ) : (
                                  <span className="text-xs font-semibold text-emerald-600">Collected ✓</span>
                                )
                              ) : (
                                <>
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
                                    Balance pending
                                  </span>
                                  {b.status === "confirmed" && (
                                    <MarkBalanceButton
                                      bookingId={b.id}
                                      participantName={b.full_name}
                                      balanceAmount={formatPeso(balance)}
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-5 py-3.5 text-stone-500">{formatDateTime(b.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        {b.status === "pending" && needsManualApproval && (
                          <BookingActions bookingId={b.id} />
                        )}
                        {b.status === "confirmed" && (
                          <div className="flex flex-col items-end gap-1.5">
                            <MarkTransferButton bookingId={b.id} participantName={b.full_name} />
                            {tripHasPassed && (
                              <MarkNoShowButton bookingId={b.id} participantName={b.full_name} />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
