"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import { createBooking } from "@/app/actions/booking";
import { formatDateRange, formatPeso } from "@/lib/format";
import { DEFAULT_WAIVER_TEXT } from "@/lib/constants";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";

type MeetingPoint = { location: string; time: string };

type BookingModalProps = {
  tripId: number;
  tripSlug: string;
  tripTitle: string;
  tripDateStart: string;
  tripDateEnd?: string | null;
  unitPrice: number;
  remainingSlots: number;
  paymentType: string;
  minDownpayment: number | null;
  downpaymentCutoffDays: number;
  meetingPoints: MeetingPoint[];
  difficulty: string;
  waiverText?: string | null;
  organizerName?: string | null;
  customQuestions?: string[] | null;
  autoOpen?: boolean;
  compact?: boolean;
  initialName?: string;
  initialEmail?: string;
};


export function BookingModal({
  tripId,
  tripSlug,
  tripTitle,
  tripDateStart,
  tripDateEnd,
  unitPrice,
  remainingSlots,
  paymentType,
  minDownpayment,
  downpaymentCutoffDays,
  meetingPoints,
  difficulty,
  waiverText,
  organizerName,
  customQuestions,
  autoOpen = false,
  compact = false,
  initialName = "",
  initialEmail = "",
}: BookingModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [pendingBookClick, setPendingBookClick] = useState(false);

  const rawWaiverText = waiverText ?? DEFAULT_WAIVER_TEXT;
  const resolvedWaiverText = rawWaiverText.replace(/\[Organizer Name\]/gi, organizerName || "the organizer");
  const [success, setSuccess] = useState(false);
  const [redirectBlocked, setRedirectBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [waiverExpanded, setWaiverExpanded] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const redirectUrlRef = useRef<string | null>(null);
  const openRef = useRef(false);
  openRef.current = open;

  const [fullName, setFullName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [slots, setSlots] = useState(1);
  const [participants, setParticipants] = useState<string[]>([]);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedMeetingPoint, setSelectedMeetingPoint] = useState(() =>
    meetingPoints.length === 1 ? meetingPoints[0].location : ""
  );
  const [phoneError, setPhoneError] = useState(false);
  const [samePhoneError, setSamePhoneError] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverError, setWaiverError] = useState(false);
  const [platformWaiverAccepted, setPlatformWaiverAccepted] = useState(false);
  const [platformWaiverError, setPlatformWaiverError] = useState(false);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [adultError, setAdultError] = useState(false);
  const [paymentOption, setPaymentOption] = useState<"full" | "downpayment">("full");
  const activeQuestions = (customQuestions ?? []).filter((q) => q.trim());
  const [customQuestionAnswers, setCustomQuestionAnswers] = useState<string[]>(() => activeQuestions.map(() => ""));

  const isDemo = /^\[demo\]/i.test(tripTitle.trim());

  const formRef = useRef<HTMLFormElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const slotsExceedsAvailable = slots > remainingSlots;
  const hasDownpayment = paymentType === "downpayment" && minDownpayment != null;
  const totalAmount = unitPrice * slots;
  const daysUntilTrip = Math.floor((new Date(tripDateStart).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const canUseDownpayment = hasDownpayment && Number(minDownpayment!) < unitPrice && daysUntilTrip > downpaymentCutoffDays;
  const downpaymentAmount = canUseDownpayment ? Math.min(Number(minDownpayment!) * slots, totalAmount) : totalAmount;
  const amountDue = paymentOption === "downpayment" && canUseDownpayment ? downpaymentAmount : totalAmount;

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
      .select("phone, emergency_contact_name, emergency_contact_phone, first_name, last_name, nickname")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      setPhone((prev) => prev || data.phone || "");
      setEmergencyContactName((prev) => prev || data.emergency_contact_name || "");
      setEmergencyContactPhone((prev) => prev || data.emergency_contact_phone || "");
      if (data.first_name && data.last_name) {
        setFullName((prev) => prev || `${data.first_name} ${data.last_name}`);
      }
    }
  }

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      if (session?.user) applyProfile(session.user.id);
      setSessionReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" && openRef.current) {
        setError("Your session has expired. Please close this form and log in again.");
        return;
      }
      applySession(session);
      if (session?.user) applyProfile(session.user.id);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoOpen || !sessionReady) return;
    if (sessionRef.current) {
      setOpen(true);
    } else {
      setShowSignInPrompt(true);
    }
  }, [autoOpen, sessionReady]);

  useEffect(() => {
    if (!pendingBookClick || !sessionReady) return;
    setPendingBookClick(false);
    if (sessionRef.current) {
      setOpen(true);
    } else {
      setShowSignInPrompt(true);
    }
  }, [pendingBookClick, sessionReady]);

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

  // Escape is owned by useFocusTrap below (single Escape path); this effect only
  // locks body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Trap focus inside the dialog, return it to the trigger on close, and route
  // Escape to handleClose (no-op while redirecting after a successful booking).
  useFocusTrap(dialogRef, open, {
    onClose: () => {
      if (!success) handleClose();
    },
  });

  useEffect(() => {
    if (!showSignInPrompt) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setShowSignInPrompt(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSignInPrompt]);

  useEffect(() => {
    if (error) {
      errorSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  function resetForm() {
    setFullName(initialName);
    setEmail(initialEmail);
    setPhone("");
    setSlots(1);
    setParticipants([]);
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setNotes("");
    setSelectedMeetingPoint(meetingPoints.length === 1 ? meetingPoints[0].location : "");
    setPhoneError(false);
    setSamePhoneError(false);
    setWaiverAccepted(false);
    setWaiverError(false);
    setWaiverExpanded(false);
    setPlatformWaiverAccepted(false);
    setPlatformWaiverError(false);
    setAdultConfirmed(false);
    setAdultError(false);
    setError(null);
    setSuccess(false);
    setPaymentOption("full");
    setCustomQuestionAnswers(activeQuestions.map(() => ""));
  }

  function handleClose() {
    history.back(); // pop the modal history entry pushed on open
    setOpen(false);
    resetForm();
  }

  function handleBookClick() {
    if (!sessionReady) {
      setPendingBookClick(true);
      return;
    }
    if (!sessionRef.current) {
      setShowSignInPrompt(true);
      return;
    }
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || success) return;
    const phoneValid = /^(\+63|0)\d{9,10}$/.test(phone.replace(/\s/g, ""));
    if (!phoneValid) setPhoneError(true);
    const isSamePhone = phone.replace(/\s/g, "") === emergencyContactPhone.replace(/\s/g, "") && phone.trim() !== "";
    if (isSamePhone) setSamePhoneError(true);
    const hasErrors = !platformWaiverAccepted || !waiverAccepted || !adultConfirmed || !phoneValid || isSamePhone;
    if (!platformWaiverAccepted) setPlatformWaiverError(true);
    if (!waiverAccepted) setWaiverError(true);
    if (!adultConfirmed) setAdultError(true);
    if (hasErrors) {
      const onlyWaiversBlocking = phoneValid && !isSamePhone && (!platformWaiverAccepted || !waiverAccepted || !adultConfirmed);
      setError(onlyWaiversBlocking
        ? "Please accept the required confirmations at the bottom of the form to continue."
        : "Please fix the highlighted fields before continuing.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const result = await createBooking({
        tripSlug,
        fullName,
        email,
        phone,
        slots,
        totalAmount,
        notes: null,
        paymentOption,
        amountDue,
        participants: slots > 1 ? participants : null,
        emergencyContactName,
        emergencyContactPhone,
        waiverAgreed: waiverAccepted,
        platformWaiverAgreed: platformWaiverAccepted,
        adultConfirmed,
        medicalNotes: notes.trim() || null,
        meetingPoint: selectedMeetingPoint || null,
        customQuestionAnswers: activeQuestions.length > 0 ? customQuestionAnswers.map((a) => a.trim()) : null,
      });

      if (!result.success) {
        setError(result.error);
        setLoading(false);
        return;
      }

      if (result.checkoutUrl) {
        redirectUrlRef.current = result.checkoutUrl;
        setSuccess(true);
        setTimeout(() => {
          window.location.href = result.checkoutUrl!;
        }, 1500);
        // Safety: if still on this page after 8s, the redirect was blocked
        setTimeout(() => {
          setRedirectBlocked(true);
          setLoading(false);
        }, 8000);
      } else {
        setError(
          `Booking created but payment link failed. Please contact support at hello@sama.com.ph with your booking reference: ${result.bookingRef}`
        );
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <>
      {isDemo ? (
        <button
          type="button"
          disabled
          className={compact
            ? "w-full cursor-not-allowed rounded-xl bg-stone-200 px-5 py-3 text-sm font-semibold text-stone-500"
            : "mt-10 w-full cursor-not-allowed rounded-xl bg-stone-200 px-6 py-4 text-base font-semibold text-stone-500 sm:w-auto sm:min-w-[240px]"}
        >
          Booking not available for this trip
        </button>
      ) : remainingSlots === 0 ? (
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

      {showSignInPrompt && mounted && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowSignInPrompt(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-stone-900">Sign in to continue</h2>
            <p className="mt-2 text-sm text-stone-600">You&apos;ll need an account to book this trip.</p>
            <div className="mt-5 flex gap-3">
              <a
                href={`/login?redirectTo=${encodeURIComponent(`/trips/${tripSlug}?book=1`)}`}
                className="flex-1 rounded-xl bg-trailhead px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-trailhead-dark"
              >
                Sign in
              </a>
              <a
                href={`/signup?redirectTo=${encodeURIComponent(`/trips/${tripSlug}?book=1`)}`}
                className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-center text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
              >
                Create account
              </a>
            </div>
          </div>
        </div>,
        document.body
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
            onClick={loading || success ? undefined : handleClose}
          />

          <div ref={dialogRef} className="relative z-10 flex w-full flex-col max-h-[85dvh] rounded-t-2xl border border-stone-200 bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-2xl">
            <span id="booking-modal-title" className="sr-only">
              {success ? "Redirecting to payment" : "Book this trip"}
            </span>
            <button
              type="button"
              onClick={loading || success ? undefined : handleClose}
              className="absolute right-3 top-3 z-10 rounded-lg p-2.5 text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
              aria-label="Close"
              disabled={loading || success}
            >
              ✕
            </button>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-10 pb-5">
              {success ? (
                <div className="flex flex-col items-center gap-4 py-10 text-center">
                  {redirectBlocked ? (
                    <>
                      <p className="text-sm font-semibold text-stone-800">Your browser blocked the redirect.</p>
                      <a
                        href={redirectUrlRef.current ?? "#"}
                        className="rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
                      >
                        Continue to payment →
                      </a>
                      <p className="text-xs text-stone-500">Click the button above to complete your payment.</p>
                    </>
                  ) : (
                    <>
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-trailhead border-t-transparent" />
                      <p className="text-sm font-semibold text-stone-800">Redirecting to payment…</p>
                      <p className="text-xs text-stone-500">
                        You&apos;ll be taken to a secure payment page.<br />Please don&apos;t close this window.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <form id="booking-form" ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                  {/* Compact price line */}
                  <p className="text-sm text-stone-500">
                    {tripTitle} · {formatPeso(unitPrice)} × {slots} slot{slots !== 1 ? "s" : ""} ={" "}
                    <span className="font-semibold text-stone-800">{formatPeso(totalAmount)}</span>
                    {paymentOption === "downpayment" && canUseDownpayment && (
                      <> · <span className="font-semibold text-trailhead">Due now: {formatPeso(amountDue)}</span></>
                    )}
                  </p>
                  <div ref={errorSummaryRef} aria-live="polite" aria-atomic="true">
                    {error && (
                      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                      </p>
                    )}
                  </div>

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
                      disabled={loading}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
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
                      disabled={loading}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
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
                      disabled={loading}
                      placeholder="09XX XXX XXXX"
                      onChange={(e) => { setPhone(e.target.value); setPhoneError(false); }}
                      className={`mt-1.5 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50 ${phoneError ? "border-red-400 focus:border-red-400" : "border-stone-200 focus:border-trailhead"}`}
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
                      max={10}
                      value={slots}
                      disabled={loading}
                      onChange={(e) =>
                        setSlots(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
                    />
                    <p className="text-xs text-stone-500 mt-1">Maximum 10 slots per booking.</p>
                    {slotsExceedsAvailable && (
                      <p role="alert" className="mt-1.5 text-xs text-red-600">
                        Only {remainingSlots} slot{remainingSlots === 1 ? "" : "s"} available for this trip.
                      </p>
                    )}
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
                        disabled={loading}
                        onChange={(e) => setSelectedMeetingPoint(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
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
                              disabled={loading}
                              onChange={(e) => {
                                const next = [...participants];
                                next[i] = e.target.value;
                                setParticipants(next);
                              }}
                              className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
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
                        disabled={loading}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        placeholder="Full name"
                        className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
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
                        disabled={loading}
                        onChange={(e) => { setEmergencyContactPhone(e.target.value); setSamePhoneError(false); }}
                        placeholder="09XX XXX XXXX"
                        className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50 ${samePhoneError ? "border-red-400 focus:border-red-400" : "border-stone-200 focus:border-trailhead"}`}
                      />
                      {samePhoneError && (
                        <p role="alert" className="mt-1.5 text-xs text-red-600">
                          Emergency contact phone must be different from your own phone number.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Payment option */}
                  {canUseDownpayment && (
                    <div>
                      <p className="block text-sm font-medium text-stone-700">Payment option</p>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => setPaymentOption("full")}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition disabled:opacity-50 ${
                            paymentOption === "full"
                              ? "border-trailhead bg-trailhead-muted font-semibold text-trailhead"
                              : "border-stone-200 bg-white text-stone-700 hover:border-trailhead"
                          }`}
                        >
                          <span className="block font-medium">Pay in full</span>
                          <span className="block text-xs opacity-75">{formatPeso(totalAmount)}</span>
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => setPaymentOption("downpayment")}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition disabled:opacity-50 ${
                            paymentOption === "downpayment"
                              ? "border-trailhead bg-trailhead-muted font-semibold text-trailhead"
                              : "border-stone-200 bg-white text-stone-700 hover:border-trailhead"
                          }`}
                        >
                          <span className="block font-medium">Pay downpayment</span>
                          <span className="block text-xs opacity-75">{formatPeso(downpaymentAmount)} deposit</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {paymentOption === "downpayment" && canUseDownpayment && (
                    <p className="text-xs text-stone-500 -mt-1">
                      Your remaining balance of {formatPeso(totalAmount - downpaymentAmount)} can be paid online before the trip, or directly to your organizer on the day.
                    </p>
                  )}

                  {/* Medical / dietary notes */}
                  <div>
                    <label htmlFor="booking-notes" className="block text-sm font-medium text-stone-700">
                      Medical / dietary notes <span className="text-stone-500">(optional)</span>
                    </label>
                    <textarea
                      id="booking-notes"
                      rows={2}
                      maxLength={500}
                      value={notes}
                      disabled={loading}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Allergies, medications, dietary restrictions, or other health info"
                      className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
                    />
                  </div>

                  {/* Custom questions from organizer */}
                  {activeQuestions.map((question, i) => (
                    <div key={i}>
                      <label htmlFor={`booking-custom-question-${i}`} className="block text-sm font-medium text-stone-700">
                        {question}
                      </label>
                      <textarea
                        id={`booking-custom-question-${i}`}
                        rows={2}
                        required
                        maxLength={1000}
                        value={customQuestionAnswers[i] ?? ""}
                        disabled={loading}
                        onChange={(e) => {
                          const next = [...customQuestionAnswers];
                          next[i] = e.target.value;
                          setCustomQuestionAnswers(next);
                        }}
                        className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
                      />
                    </div>
                  ))}

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
                          disabled={loading}
                          onChange={(e) => {
                            setPlatformWaiverAccepted(e.target.checked);
                            if (e.target.checked) setPlatformWaiverError(false);
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
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
                      {resolvedWaiverText && (
                        <div className="mb-2">
                          <div className={`rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-700 whitespace-pre-wrap${waiverExpanded ? "" : " line-clamp-3"}`}>
                            {resolvedWaiverText}
                          </div>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => setWaiverExpanded(!waiverExpanded)}
                            className="mt-1 text-xs text-trailhead underline-offset-2 hover:underline disabled:opacity-50"
                          >
                            {waiverExpanded ? "See less" : "See more"}
                          </button>
                        </div>
                      )}
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={waiverAccepted}
                          disabled={loading}
                          onChange={(e) => {
                            setWaiverAccepted(e.target.checked);
                            if (e.target.checked) setWaiverError(false);
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
                        />
                        <span className="text-xs leading-relaxed text-stone-600">
                          {slots === 1
                            ? "I have read and agree to the waiver above."
                            : "I have read and agree to the waiver above. I confirm that I have informed all other participants listed in this booking of the trip risks, cancellation policy, and terms. I am booking on their behalf with their full knowledge and consent. Each participant will receive a personal link to confirm their own details and sign their individual waiver."
                          }
                        </span>
                      </label>
                      {waiverError && (
                        <p role="alert" className="mt-1.5 text-xs text-red-600">
                          You must accept the organizer waiver before confirming your booking.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="mb-1.5 text-sm font-medium text-stone-700">
                        Age requirement
                      </p>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={adultConfirmed}
                          disabled={loading}
                          onChange={(e) => {
                            setAdultConfirmed(e.target.checked);
                            if (e.target.checked) setAdultError(false);
                          }}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-trailhead accent-trailhead focus:ring-2 focus:ring-trailhead/30 disabled:opacity-50"
                        />
                        <span className="text-xs leading-relaxed text-stone-600">
                          I confirm that I and all other participants in this booking are 18 years of age or older.
                        </span>
                      </label>
                      {adultError && (
                        <p role="alert" className="mt-1.5 text-xs text-red-600">
                          You must confirm that all participants in this booking are 18 years of age or older.
                        </p>
                      )}
                    </div>
                  </div>
                </form>
              )}
            </div>

            {!success && (
              <div className="shrink-0 border-t border-stone-100 px-6 py-3">
                <p className="mb-2 text-center text-xs text-stone-500">
                  Need help?{" "}
                  <a href="mailto:hello@sama.com.ph" className="underline hover:text-stone-600">
                    hello@sama.com.ph
                  </a>
                </p>
                <p className="mb-2 flex items-center justify-center gap-1 text-xs text-stone-500">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
                  </svg>
                  Payments secured by PayMongo. Pay via GCash, Maya, or QR Ph.
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
                    type="button"
                    disabled={loading || slotsExceedsAvailable}
                    onClick={() => formRef.current?.requestSubmit()}
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
