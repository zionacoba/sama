"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { BookingActions } from "@/app/organizer/dashboard/booking-actions";
import { MarkBalanceButton } from "./mark-balance-button";
import { MarkTransferButton } from "./mark-transfer-button";

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
  status: string;
  created_at: string;
  participants: string[] | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  waiver_agreed: boolean;
  medical_notes: string | null;
  notes: string | null;
  meeting_point: string | null;
};

type BookingParticipant = {
  booking_id: number;
  slot_number: number;
  full_name: string | null;
  completed: boolean;
};

type Tab = "confirmed" | "pending" | "all" | "cancelled";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
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
    payment_pending: "bg-sky-100 text-sky-700",
    transferred: "bg-stone-100 text-stone-600",
  };
  const labels: Record<string, string> = {
    payment_pending: "Awaiting payment",
    transferred: "Transferred",
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

export function BookingsListWithTabs({
  bookings,
  participantsRecord,
  needsManualApproval,
  navLinks,
}: {
  bookings: Booking[];
  participantsRecord: Record<string, BookingParticipant[]>;
  needsManualApproval: boolean;
  navLinks: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("confirmed");

  const confirmedBookings = bookings.filter((b) => b.status === "confirmed");
  const pendingBookings = bookings.filter((b) => b.status === "pending");
  const cancelledBookings = bookings.filter(
    (b) => b.status === "cancelled" || b.status === "rejected" || b.status === "transferred",
  );

  const displayed =
    tab === "confirmed"
      ? confirmedBookings
      : tab === "pending"
        ? pendingBookings
        : tab === "cancelled"
          ? cancelledBookings
          : bookings;

  const tabs: { key: Tab; label: string; count: number; badge?: string }[] = [
    { key: "confirmed", label: "Confirmed", count: confirmedBookings.length },
    { key: "pending", label: "Pending", count: pendingBookings.length, badge: "amber" },
    { key: "all", label: "All", count: bookings.length },
    { key: "cancelled", label: "Cancelled / Rejected", count: cancelledBookings.length },
  ];

  const emptyMessage =
    tab === "confirmed"
      ? "No confirmed bookings yet."
      : tab === "pending"
        ? "No pending bookings."
        : tab === "cancelled"
          ? "No cancelled or rejected bookings."
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

      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {displayed.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-stone-400">{emptyMessage}</p>
        ) : (
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
                      <td className="px-5 py-3.5 font-medium text-stone-900">{b.full_name}</td>
                      <td className="px-5 py-3.5 text-stone-500">{b.email}</td>
                      <td className="px-5 py-3.5 text-stone-700">
                        {b.emergency_contact_name ? (
                          <>
                            <span className="font-medium">{b.emergency_contact_name}</span>
                            {b.emergency_contact_phone && (
                              <>
                                <br />
                                <span className="text-stone-400">{b.emergency_contact_phone}</span>
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
                              <summary className="cursor-pointer list-none text-xs font-medium text-stone-400 hover:text-stone-600">
                                {done}/{b.slots} confirmed
                              </summary>
                              <ul className="mt-1 space-y-0.5 pl-0.5">
                                {participants.map((p) => (
                                  <li key={p.slot_number} className="flex items-center gap-1 text-xs">
                                    <span className={p.completed ? "text-emerald-500" : "text-stone-300"}>●</span>
                                    <span className={p.completed ? "text-stone-700" : "text-stone-400"}>
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
                        {formatCurrency(b.total_amount)}
                        {b.payment_option === "downpayment" && b.amount_due != null && (() => {
                          const balance = b.total_amount - b.amount_due;
                          return (
                            <div className="mt-0.5 flex flex-col items-end gap-1">
                              {b.balance_collected ? (
                                <span className="text-xs font-semibold text-emerald-600">Fully paid</span>
                              ) : (
                                <>
                                  <span className="text-xs font-normal text-stone-400">
                                    ({formatCurrency(b.amount_due)} deposit)
                                  </span>
                                  {b.status === "confirmed" && (
                                    <>
                                      <MarkBalanceButton
                                        bookingId={b.id}
                                        participantName={b.full_name}
                                        balanceAmount={formatCurrency(balance)}
                                      />
                                      <span className="text-xs text-stone-400">
                                        Participant can pay balance online or directly to you. Mark as collected once received. Balance payments made online are remitted 24-48 hours after the trip date.
                                      </span>
                                    </>
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
                          <MarkTransferButton bookingId={b.id} participantName={b.full_name} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
