"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";

type BookingModalProps = {
  tripId: string | number;
  tripSlug: string;
  tripTitle: string;
  unitPrice: number;
  remainingSlots: number;
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
  unitPrice,
  remainingSlots,
}: BookingModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [slots, setSlots] = useState(1);
  const [notes, setNotes] = useState("");

  const totalAmount = unitPrice * slots;

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
    setNotes("");
    setError(null);
    setSuccess(false);
  }

  function handleClose() {
    setOpen(false);
    resetForm();
  }

  async function handleBookClick() {
    setCheckingAuth(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    setCheckingAuth(false);

    if (!session) {
      const redirectTo = encodeURIComponent(`/trips/${tripSlug}`);
      router.push(`/login?redirectTo=${redirectTo}`);
      return;
    }

    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: insertError } = await supabase.from("bookings").insert({
      trip_id: tripId,
      full_name: fullName,
      email,
      phone,
      slots,
      total_amount: totalAmount,
      status: "pending",
      notes: notes.trim() || null,
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
  }

  return (
    <>
      {remainingSlots === 0 ? (
        <button
          type="button"
          disabled
          className="mt-10 w-full cursor-not-allowed rounded-xl bg-stone-200 px-6 py-4 text-base font-semibold text-stone-500 sm:w-auto sm:min-w-[240px]"
        >
          Sold Out
        </button>
      ) : (
        <button
          type="button"
          onClick={handleBookClick}
          disabled={checkingAuth}
          className="mt-10 w-full rounded-xl bg-trailhead px-6 py-4 text-base font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[240px]"
        >
          {checkingAuth ? "Checking…" : "Book This Trip"}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-stone-900/50"
            aria-label="Close booking form"
            onClick={handleClose}
          />

          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4">
              <div>
                <h2
                  id="booking-modal-title"
                  className="text-lg font-bold text-stone-900"
                >
                  {success ? "Booking confirmed" : "Book this trip"}
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

            <div className="px-6 py-5">
              {success ? (
                <div className="space-y-4">
                  <p
                    role="status"
                    className="rounded-lg border border-trailhead/30 bg-trailhead-muted px-4 py-3 text-sm text-trailhead"
                  >
                    Your booking for <strong>{tripTitle}</strong>{" "}has been submitted.{" "}
                    We'll contact you at {email} once it's confirmed.
                  </p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="rounded-xl bg-trailhead-muted/60 px-4 py-3">
                    <p className="text-sm font-medium text-stone-700">
                      {tripTitle}
                    </p>
                    <p className="mt-1 text-lg font-bold text-trailhead">
                      Total: {formatCurrency(totalAmount)}
                    </p>
                    <p className="text-xs text-stone-500">
                      {formatCurrency(unitPrice)} × {slots} slot
                      {slots !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                    >
                      {error}
                    </p>
                  )}

                  <div>
                    <label
                      htmlFor="booking-full-name"
                      className="block text-sm font-medium text-stone-700"
                    >
                      Full name
                    </label>
                    <input
                      id="booking-full-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="booking-email"
                      className="block text-sm font-medium text-stone-700"
                    >
                      Email
                    </label>
                    <input
                      id="booking-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="booking-phone"
                      className="block text-sm font-medium text-stone-700"
                    >
                      Phone number
                    </label>
                    <input
                      id="booking-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="booking-slots"
                      className="block text-sm font-medium text-stone-700"
                    >
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
                        setSlots(
                          Math.min(remainingSlots, Math.max(1, Number(e.target.value) || 1))
                        )
                      }
                      className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="booking-notes"
                      className="block text-sm font-medium text-stone-700"
                    >
                      Notes <span className="text-stone-400">(optional)</span>
                    </label>
                    <textarea
                      id="booking-notes"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="mt-1.5 w-full resize-none rounded-xl border border-stone-200 px-4 py-2.5 text-sm outline-none focus:border-trailhead focus:ring-2 focus:ring-trailhead/30"
                      placeholder="Dietary needs, emergency contact, questions…"
                    />
                  </div>

                  <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="rounded-xl border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="rounded-xl bg-trailhead px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? "Submitting…" : "Confirm Booking"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
