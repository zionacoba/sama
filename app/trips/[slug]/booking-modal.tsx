"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import { createBooking } from "@/app/actions/booking";

type MeetingPoint = { location: string; time: string };

const CANCELLATION_POLICIES: Record<string, { label: string; text: string }> = {
  flexible: { label: "Flexible", text: "Full refund if cancelled 7 or more days before the trip. 50% refund if cancelled 3–7 days before. No refund within 3 days." },
  moderate: { label: "Moderate", text: "Full refund if cancelled 14 or more days before the trip. 50% refund if cancelled 7–14 days before. No refund within 7 days." },
  strict:   { label: "Strict",   text: "Full refund if cancelled 30 or more days before the trip. No refund within 30 days." },
};

type BookingModalProps = {
  tripId: number;
  tripSlug: string;
  tripTitle: string;
  tripDateStart: string;
  unitPrice: number;
  remainingSlots: number;
  paymentType: string;
  minDownpayment: number | null;
  downpaymentCutoffDays: number;
  meetingPoints: MeetingPoint[];
  difficulty: string;
  cancellationPolicy: string | null;
  cancellationPolicyCustom: string | null;
  waiverText?: string | null;
  compact?: boolean;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BookingModal({
  tripId,
  tripSlug,
  tripTitle,
  tripDateStart,
  unitPrice,
  remainingSlots,
  paymentType,
  minDownpayment,
  downpaymentCutoffDays,
  meetingPoints,
  difficulty,
  cancellationPolicy,
  cancellationPolicyCustom,
  waiverText,
  compact = false,
}: BookingModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionRef = useRef<Session | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [slots, setSlots] = useState(1);
  const [participants, setParticipants] = useState<string[]>([]);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMeetingPoint, setSelectedMeetingPoint] = useState("");
  const [phoneError, setPhoneError] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverError, setWaiverError] = useState(false);
  const [platformWaiverAccepted, setPlatformWaiverAccepted] = useState(false);
  const [platformWaiverError, setPlatformWaiverError] = useState(false);
  const [bookingStatus, setBookingStatus] = useState<"confirmed" | "pending" | null>(null);
  const [paymentOption, setPaymentOption] = useState<"full" | "downpayment">("full");
  const [participantTokens, setParticipantTokens] = useState<{ slotIndex: number; token: string }[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const hasDownpayment = paymentType === "downpayment" && minDownpayment != null;
  const totalAmount = unitPrice * slots;
  const daysUntilTrip = Math.floor((new Date(tripDateStart).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const canUseDownpayment = hasDownpayment && minDownpayment! < unitPrice && daysUntilTrip > downpaymentCutoffDays;
  const amountDue = paymentOption === "downpayment" && canUseDownpayment
    ? Math.min(minDownpayment! * slots, totalAmount)
    : totalAmount;

  // Keep a ref so the slots effect can read fullName without being a dependency
  const fullNameRef = useRef(fullName);
  fullNameRef.current = fullName;

  // Sync participant list length with slots; pre-fill slot 0 with booker name on first expansion
  useEffect(() => {
    setParticipants((prev) => {
      if (slots <= 1) return [];
      return Array.from({ length: slots }, (_, i) => {
        if (i < prev.length) return prev[i];
        return i === 0 ? fullNameRef.current : "";
      });
    });
  }, [slots]);

  function applySession(session: Session | null) {
    sessionRef.current = session;
    if (session?.user) {
      setEmail((prev) => prev || (session.user.email ?? ""));
      setFullName((prev) => prev || ((session.user.user_metadata?.full_name as string) || ""));
    }
  }

  async function applyProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("emergency_contact_name, emergency_contact_phone")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      setEmergencyContactName((prev) => prev || data.emergency_contact_name || "");
      setEmergencyContactPhone((prev) => prev || data.emergency_contact_phone || "");
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      if (session?.user) applyProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      if (session?.user) applyProfile(session.user.id);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push a history entry when the modal opens so the Android back button
  // closes the modal instead of navigating away from the page.
  useEffect(() => {
    if (!open) return;

    history.pushState({ modal: "booking" }, "");

    function handlePopState() {
      setOpen(false);
      resetForm();
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  // resetForm is stable enough; excluding it avoids re-pushing history on
  // every render while the modal is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !success) setOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, success]);

  function resetForm() {
    setFullName("");
    setEmail("");
    setPhone("");
    setSlots(1);
    setParticipants([]);
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setNotes("");
    setSelectedMeetingPoint("");
    setWaiverAccepted(false);
    setWaiverError(false);
    setPlatformWaiverAccepted(false);
    setPlatformWaiverError(false);
    setError(null);
    setSuccess(false);
    setBookingStatus(null);
    setPaymentOption("full");
    setParticipantTokens([]);
    setCopiedIndex(null);
  }

  function handleClose() {
    history.back(); // pop the modal history entry pushed on open
    setOpen(false);
    resetForm();
  }

  function handleBookClick() {
    if (!sessionRef.current) {
      router.push(`/login?redirectTo=${encodeURIComponent(`/trips/${tripSlug}`)}`);
      return;
    }
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const phoneValid = phone.startsWith("09") || phone.startsWith("+63");
    if (!phoneValid) setPhoneError(true);
    const hasErrors = !platformWaiverAccepted || !waiverAccepted || !phoneValid;
    if (!platformWaiverAccepted) setPlatformWaiverError(true);
    if (!waiverAccepted) setWaiverError(true);
    if (hasErrors) return;
    setError(null);
    setLoading(true);

    const result = await createBooking({
      tripSlug,
      fullName,
      email,
      phone,
      slots,
      totalAmount,
      notes: notes.trim() || null,
      paymentOption,
      amountDue,
      participants: slots > 1 ? participants : null,
      emergencyContactName,
      emergencyContactPhone,
      waiverAgreed: waiverAccepted,
      platformWaiverAgreed: platformWaiverAccepted,
      medicalNotes: notes.trim() || null,
      meetingPoint: selectedMeetingPoint || null,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setBookingStatus((result.status ?? "pending") as "confirmed" | "pending");
    if (result.participantTokens) {
      setParticipantTokens(result.participantTokens);
    }
    setSuccess(true);
  }

  return (
    <>
      {remainingSlots === 0 ? (
        <button
          type="button"
          disabled
          className={compact
            ? "w-full cursor-not-allowed rounded-xl bg-stone-200 px-5 py-3 text-sm font-semibold text-stone-500"
            : "mt-10 w-full cursor-not-allowed rounded-xl bg-stone-200 px-6 py-4 text-base font-semibold text-stone-500 sm:w-auto sm:min-w-[240px]"}
        >
          Sold Out
        </button>
      ) : (
        <button
          type="button"
          onClick={handleBookClick}
          className={compact
            ? "w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
            : "mt-10 w-full rounded-xl bg-trailhead px-6 py-4 text-base font-semibold text-white shadow-md transition hover:bg-trailhead-dark sm:w-auto sm:min-w-[240px]"}
        >
          {difficulty === "Advanced" ? "Apply to Join" : "Book This Trip"}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close booking form"
            onClick={success ? undefined : handleClose}
          />

          <div className="relative z-10 flex w-full flex-col max-h-[85dvh] rounded-t-2xl border border-stone-200 bg-white pt-8 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-100 px-6 pb-4">
              <div>
                <h2
                  id="booking-modal-title"
                  className="text-lg font-bold text-stone-900"
                >
                  {success
                    ? bookingStatus === "confirmed" ? "You're in! 🎉" : "Booking request sent!"
                    : "Book this trip"}
                </h2>
                {!success && (
                  <p className="mt-0.5 text-sm text-stone-600">{tripTitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="shrink-0 rounded-lg p-1.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-6 pb-5">
              {success ? (
                <div className="space-y-4">
                  <p
                    role="status"
                    className="rounded-lg border border-trailhead/30 bg-trailhead-muted px-4 py-3 text-sm text-trailhead"
                  >
                    {bookingStatus === "confirmed"
                      ? <>Your booking for <strong>{tripTitle}</strong> is confirmed. The organizer will be in touch with trip details closer to the date.</>
                      : <>Your request to join <strong>{tripTitle}</strong> has been sent to the organizer. You&apos;ll receive a confirmation email once they review your booking. This usually takes 24&ndash;48 hours.</>
                    }
                  </p>

                  {participantTokens.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-base font-bold text-stone-900">Share with your group</p>
                      <p className="mt-1 text-sm text-stone-600">
                        Each participant must confirm their own details and sign their individual waiver. Send them their personal link.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const allUrls = participantTokens
                            .map(({ slotIndex, token }) =>
                              `Participant ${slotIndex + 1}: ${window.location.origin}/join/${token}`
                            )
                            .join("\n");
                          navigator.clipboard.writeText(allUrls).then(() => {
                            setCopiedIndex(-1);
                            setTimeout(() => setCopiedIndex(null), 2000);
                          });
                        }}
                        className="mt-3 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                      >
                        {copiedIndex === -1 ? "✓ All links copied!" : "Copy all links"}
                      </button>
                      <div className="mt-3 space-y-3">
                        {participantTokens.map(({ slotIndex, token }) => {
                          const url = `${window.location.origin}/join/${token}`;
                          return (
                            <div key={slotIndex} className="rounded-lg border border-stone-200 bg-white p-3">
                              <p className="text-sm font-semibold text-stone-900">
                                Send this link to Participant {slotIndex + 1}
                              </p>
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  readOnly
                                  value={url}
                                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(url).then(() => {
                                      setCopiedIndex(slotIndex);
                                      setTimeout(() => setCopiedIndex(null), 2000);
                                    });
                                  }}
                                  className="shrink-0 rounded-xl bg-trailhead px-3 py-2 text-sm font-semibold text-white transition hover:bg-trailhead-dark"
                                >
                                  {copiedIndex === slotIndex ? "Copied!" : "Copy"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form id="booking-form" onSubmit={handleSubmit} className="space-y-3">
                  {/* Compact price line */}
                  <p className="text-sm text-stone-500">
                    {tripTitle} · {formatCurrency(unitPrice)} × {slots} slot{slots !== 1 ? "s" : ""} ={" "}
                    <span className="font-semibold text-stone-800">{formatCurrency(totalAmount)}</span>
                    {paymentOption === "downpayment" && canUseDownpayment && (
                      <> · <span className="font-semibold text-trailhead">Due now: {formatCurrency(amountDue)}</span></>
                    )}
                  </p>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    >
                      {error}
                    </p>
                  )}

                  {/* Contact details */}
                  <div>
                    <label htmlFor="booking-full-name" className="block text-sm font-medium text-stone-700">
                      Full name
                    </label>
                    <input
                      id="booking-full-name"
                      type="text"
                      required
                      maxLength={100}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="booking-email" className="block text-sm font-medium text-stone-700">
                      Email
                    </label>
                    <input
                      id="booking-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  <div>
                    <label htmlFor="booking-phone" className="block text-sm font-medium text-stone-700">
                      Phone number
                    </label>
                    <input
                      id="booking-phone"
                      type="tel"
                      required
                      maxLength={20}
                      pattern="[0-9+\-\s]+"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }}
                      className={`mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-trailhead/30 ${phoneError ? "border-red-400 focus:border-red-400" : "border-stone-200 focus:border-trailhead"}`}
                    />
                    {phoneError && (
                      <p role="alert" className="mt-1.5 text-xs text-red-600">
                        Please enter a valid Philippine phone number (09XX or +63)
                      </p>
                    )}
                  </div>

                  {/* Slots */}
                  <div>
                    <label htmlFor="booking-slots" className="block text-sm font-medium text-stone-700">
                      Number of slots
                    </label>
                    <input
                      id="booking-slots"
                      type="number"
                      required
                      min={1}
                      max={remainingSlots}
                      value={slots}
                      onChange={(e) =>
                        setSlots(Math.min(remainingSlots, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  {/* Pickup point */}
                  {meetingPoints.length > 0 && (
                    <div>
                      <label htmlFor="booking-meeting-point" className="block text-sm font-medium text-stone-700">
                        Pickup point
                      </label>
                      <select
                        id="booking-meeting-point"
                        required
                        value={selectedMeetingPoint}
                        onChange={(e) => setSelectedMeetingPoint(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                      >
                        <option value="">Select a pickup point…</option>
                        {meetingPoints.map((mp) => (
                          <option key={mp.location} value={mp.location}>
                            {mp.location}{mp.time ? ` · ${mp.time}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Participant names — shown when booking multiple slots */}
                  {slots > 1 && (
                    <div>
                      <p className="block text-sm font-medium text-stone-700">Participant names</p>
                      <div className="mt-1.5 space-y-2">
                        {participants.map((name, i) => (
                          <div key={i}>
                            <label
                              htmlFor={`participant-${i}`}
                              className="mb-0.5 block text-xs text-stone-500"
                            >
                              Participant {i + 1}{i === 0 ? " (you)" : ""}
                            </label>
                            <input
                              id={`participant-${i}`}
                              type="text"
                              required
                              maxLength={100}
                              value={name}
                              onChange={(e) => {
                                const next = [...participants];
                                next[i] = e.target.value;
                                setParticipants(next);
                              }}
                              className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                              placeholder="Full name"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Emergency contact */}
                  <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                      Emergency contact
                    </p>
                    <div>
                      <label htmlFor="booking-ec-name" className="block text-sm font-medium text-stone-700">
                        Name
                      </label>
                      <input
                        id="booking-ec-name"
                        type="text"
                        required
                        maxLength={100}
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        placeholder="Full name"
                        className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                      />
                    </div>
                    <div>
                      <label htmlFor="booking-ec-phone" className="block text-sm font-medium text-stone-700">
                        Phone number
                      </label>
                      <input
                        id="booking-ec-phone"
                        type="tel"
                        required
                        maxLength={20}
                        pattern="[0-9+\-\s]+"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(e.target.value)}
                        placeholder="+63 9XX XXX XXXX"
                        className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                      />
                    </div>
                  </div>

                  {/* Payment option */}
                  {canUseDownpayment && (
                    <div>
                      <p className="block text-sm font-medium text-stone-700">Payment option</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPaymentOption("full")}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            paymentOption === "full"
                              ? "border-trailhead bg-trailhead-muted font-semibold text-trailhead"
                              : "border-stone-200 bg-white text-stone-700 hover:border-trailhead"
                          }`}
                        >
                          <span className="block font-medium">Pay in full</span>
                          <span className="block text-xs opacity-75">{formatCurrency(totalAmount)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentOption("downpayment")}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            paymentOption === "downpayment"
                              ? "border-trailhead bg-trailhead-muted font-semibold text-trailhead"
                              : "border-stone-200 bg-white text-stone-700 hover:border-trailhead"
                          }`}
                        >
                          <span className="block font-medium">Pay downpayment</span>
                          <span className="block text-xs opacity-75">{formatCurrency(amountDue)} deposit</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Combined notes */}
                  <div>
                    <label htmlFor="booking-notes" className="block text-sm font-medium text-stone-700">
                      Notes for organizer <span className="text-stone-400">(optional)</span>
                    </label>
                    <textarea
                      id="booking-notes"
                      rows={2}
                      maxLength={500}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Medical conditions, allergies, special requests, or questions"
                      className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  {/* Waivers */}
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-stone-700">
                        Platform terms
                      </p>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={platformWaiverAccepted}
                          onChange={(e) => {
                            setPlatformWaiverAccepted(e.target.checked);
                            if (e.target.checked) setPlatformWaiverError(false);
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30"
                        />
                        <span className="text-xs leading-relaxed text-stone-600">
                          I understand that Sama is a technology marketplace connecting independent trip organizers with participants. Sama does not operate or take responsibility for any trip. By booking, I agree to Sama&apos;s{" "}
                          <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-trailhead">Terms of Service</a>
                          {" "}and{" "}
                          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-trailhead">Privacy Policy</a>.
                        </span>
                      </label>
                      {platformWaiverError && (
                        <p role="alert" className="mt-1.5 text-xs text-red-600">
                          You must agree to the platform terms before confirming your booking.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="mb-1.5 text-sm font-medium text-stone-700">
                        Organizer waiver
                      </p>
                      {waiverText && (
                        <div className="mb-2 max-h-[200px] overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-700 whitespace-pre-wrap">
                          {waiverText}
                        </div>
                      )}
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={waiverAccepted}
                          onChange={(e) => {
                            setWaiverAccepted(e.target.checked);
                            if (e.target.checked) setWaiverError(false);
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30"
                        />
                        <span className="text-xs leading-relaxed text-stone-600">
                          {waiverText
                            ? "I have read and agree to the waiver above."
                            : slots === 1
                              ? "I understand the risks of this outdoor activity and agree to participate at my own risk. I have read and agree to the cancellation policy for this trip."
                              : "I understand the risks of this outdoor activity and agree to participate at my own risk. I confirm that I have informed all other participants listed in this booking of the trip risks, cancellation policy, and terms. I am booking on their behalf with their full knowledge and consent. Each participant will receive a personal link to confirm their own details and sign their individual waiver."
                          }
                        </span>
                      </label>
                      {waiverError && (
                        <p role="alert" className="mt-1.5 text-xs text-red-600">
                          You must accept the organizer waiver before confirming your booking.
                        </p>
                      )}
                    </div>
                  </div>

                </form>
              )}
            </div>

            {!success && (
              <div className="shrink-0 border-t border-stone-100 px-6 py-3">
                {cancellationPolicy && (() => {
                  const meta = CANCELLATION_POLICIES[cancellationPolicy];
                  const text = cancellationPolicy === "custom"
                    ? (cancellationPolicyCustom ?? "")
                    : (meta?.text ?? "");
                  return text ? (
                    <p className="mb-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                      <span className="font-semibold text-stone-600">Cancellation: </span>{text}
                    </p>
                  ) : null;
                })()}
                <p className="mb-2 text-center text-xs text-stone-400">
                  Need help?{" "}
                  <a href="mailto:sama.com.ph@gmail.com" className="underline hover:text-stone-600">
                    sama.com.ph@gmail.com
                  </a>
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-xl border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    form="booking-form"
                    disabled={loading}
                    className="flex-1 rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Submitting…" : "Confirm booking"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
