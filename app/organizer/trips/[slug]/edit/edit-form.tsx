"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { updateTrip } from "@/app/actions/trip";
import { CANCELLATION_POLICIES } from "@/lib/cancellation-policies";
import { PhotoUploader, type PhotoItem } from "@/app/components/photo-uploader";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";

const labelClass = "block text-sm font-medium text-stone-700";

const DEFAULT_WAIVER_TEXT =
  "I understand that outdoor activities involve inherent risks including but not limited to physical injury, accidents, and unpredictable weather conditions. I voluntarily participate in this trip organized by [Organizer Name] and assume all risks associated with it. I confirm that I am physically fit to participate and have disclosed any relevant medical conditions. I release the organizer from liability for any injury, loss, or damage arising from my participation, except in cases of gross negligence. I have read and understood the cancellation policy for this trip.";

type MeetingPoint = { location: string; time: string };

type TripForEdit = {
  id: number;
  status: string;
  title: string;
  activity_type: string | null;
  difficulty: string;
  duration: string | null;
  destination: string;
  region: string | null;
  date_start: string;
  date_end: string | null;
  price: number;
  total_slots: number;
  meeting_point: string;
  meeting_points: MeetingPoint[] | null;
  description: string;
  includes: string | null;
  what_to_bring: string | null;
  photos: string[] | null;
  payment_type: string | null;
  min_downpayment: number | null;
  downpayment_cutoff_days: number | null;
  cancellation_policy: string | null;
  cancellation_policy_custom: string | null;
  waiver_text: string | null;
  messenger_gc_link: string | null;
  is_template: boolean | null;
  template_id: string | null;
};

export function EditTripForm({
  trip,
  destinations = [],
  templates = [],
}: {
  trip: TripForEdit;
  destinations?: string[];
  templates?: { id: string | number; title: string }[];
}) {
  const [state, action] = useActionState(updateTrip, null);
  const [isPending, startTransition] = useTransition();
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>(
    (trip.photos ?? []).map((url) => ({ kind: "url" as const, url })),
  );
  const [duration, setDuration] = useState<string>(trip.duration ?? "");
  const [dateStart, setDateStart] = useState<string>(trip.date_start.slice(0, 10));
  const [isTemplate, setIsTemplate] = useState(trip.is_template ?? false);
  const [meetingPoints, setMeetingPoints] = useState<MeetingPoint[]>(
    trip.meeting_points?.length ? trip.meeting_points : [{ location: "", time: "" }],
  );
  const [paymentType, setPaymentType] = useState<"full" | "downpayment">(
    trip.payment_type === "downpayment" ? "downpayment" : "full",
  );
  const [cancellationPolicy, setCancellationPolicy] = useState<"flexible" | "moderate" | "strict" | "custom">(
    (trip.cancellation_policy as "flexible" | "moderate" | "strict" | "custom") ?? "flexible",
  );
  const isUploadingPhotos = photoItems.some((i) => i.kind === "uploading");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [editedAfterSubmit, setEditedAfterSubmit] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const photosJsonRef = useRef<HTMLInputElement>(null);
  const meetingPointsJsonRef = useRef<HTMLInputElement>(null);
  const submitIntentRef = useRef<"active" | "draft">(trip.status === "draft" ? "draft" : "active");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setHasSubmitted(true);
    setEditedAfterSubmit(false);

    if (photosJsonRef.current) photosJsonRef.current.value = JSON.stringify(photoItems.filter((i) => i.kind === "url").map((i) => i.url));
    if (meetingPointsJsonRef.current) meetingPointsJsonRef.current.value = JSON.stringify(meetingPoints);

    const formData = new FormData(formRef.current);
    formData.set("status", submitIntentRef.current);

    startTransition(async () => {
      await action(formData);
    });
  }

  const errorMessage = hasSubmitted && !editedAfterSubmit && !isPending ? state?.error : null;
  const warningMessage = hasSubmitted && !editedAfterSubmit && !isPending && state && "success" in state ? state.warning : null;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={() => { if (hasSubmitted) setEditedAfterSubmit(true); }}
      className="space-y-6"
    >
      <input type="hidden" name="trip_id" value={trip.id} />
      <input type="hidden" name="photos_json" ref={photosJsonRef} defaultValue={JSON.stringify(trip.photos ?? [])} />
      <input type="hidden" name="meeting_points" ref={meetingPointsJsonRef} defaultValue={JSON.stringify(trip.meeting_points?.length ? trip.meeting_points : meetingPoints)} />

      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      )}

      {warningMessage && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <p className="font-semibold">Trip saved</p>
          <p className="mt-1">{warningMessage}</p>
          <a
            href="/organizer/dashboard"
            className="mt-2 inline-block text-xs font-semibold underline underline-offset-2 hover:text-amber-900"
          >
            Go to dashboard
          </a>
        </div>
      )}

      {/* Template toggle */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={(e) => setIsTemplate(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-trailhead accent-trailhead"
          />
          <input type="hidden" name="is_template" value={isTemplate.toString()} />
          <span className="text-sm font-medium text-stone-700">
            This is a recurring trip template
          </span>
        </label>
        <p className="ml-7 mt-0.5 text-xs text-stone-500">
          Templates hold the trip details. You&apos;ll create separate dated runs linked to this template.
        </p>
      </div>

      {/* Template link (only for non-templates when templates exist) */}
      {!isTemplate && templates.length > 0 && (
        <div>
          <label htmlFor="template_id" className={labelClass}>
            Link to template <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <select
            id="template_id"
            name="template_id"
            defaultValue={trip.template_id ?? ""}
            className={inputClass}
          >
            <option value="">No template — standalone trip</option>
            {templates.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Title */}
      <div>
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={trip.title}
          className={inputClass}
          placeholder="Mt. Pulag Summit Hike"
        />
      </div>

      {/* Activity type + Level */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="activity_type" className={labelClass}>
            Activity type
          </label>
          <select
            id="activity_type"
            name="activity_type"
            required
            defaultValue={trip.activity_type ?? ""}
            className={inputClass}
          >
            <option value="">Select activity…</option>
            <option value="Hiking">Hiking</option>
            <option value="Freediving">Freediving</option>
            <option value="Beach & Island">Beach &amp; Island</option>
          </select>
        </div>
        <div>
          <label htmlFor="difficulty" className={labelClass}>
            Level
          </label>
          <select
            id="difficulty"
            name="difficulty"
            required
            defaultValue={trip.difficulty}
            className={inputClass}
          >
            <option value="">Select level…</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>
      </div>
      {/* Duration */}
      <div>
        <label htmlFor="duration" className={labelClass}>
          Duration
        </label>
        <select
          id="duration"
          name="duration"
          required
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={inputClass}
        >
          <option value="">Select duration…</option>
          <option value="Day tour">Day tour</option>
          <option value="2D1N">2D1N</option>
          <option value="3D2N">3D2N</option>
          <option value="4D3N+">4D3N+</option>
        </select>
      </div>

      {/* Destination */}
      <div>
        <label htmlFor="destination" className={labelClass}>
          Destination
        </label>
        <input
          id="destination"
          name="destination"
          type="text"
          required
          list="destination-suggestions"
          defaultValue={trip.destination}
          className={inputClass}
          placeholder="Mt. Pulag, Benguet"
        />
        {destinations.length > 0 && (
          <datalist id="destination-suggestions">
            {destinations.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        )}
      </div>

      {/* Region */}
      <div>
        <label htmlFor="region" className={labelClass}>
          Region
        </label>
        <select
          id="region"
          name="region"
          required
          defaultValue={trip.region ?? ""}
          className={inputClass}
        >
          <option value="">Select region…</option>
          <option value="Luzon">Luzon</option>
          <option value="Visayas">Visayas</option>
          <option value="Mindanao">Mindanao</option>
        </select>
        <p className="mt-1.5 text-xs text-stone-500">
          Select the island group where this trip takes place.
        </p>
      </div>

      {/* Date + Price + Slots (hidden for templates) */}
      {!isTemplate && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="date_start" className={labelClass}>
                Start date
              </label>
              <input
                id="date_start"
                name="date_start"
                type="date"
                required
                min={new Date().toISOString().split("T")[0]}
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="date_end" className={labelClass}>
                End date{duration === "" || duration === "Day tour" ? (
                  <span className="font-normal text-stone-400"> (optional — for overnight/multi-day trips)</span>
                ) : null}
              </label>
              <input
                id="date_end"
                name="date_end"
                type="date"
                required={duration !== "" && duration !== "Day tour"}
                min={dateStart || trip.date_start.slice(0, 10)}
                defaultValue={trip.date_end?.slice(0, 10) ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="price" className={labelClass}>
                Price per person (PHP)
              </label>
              <input
                id="price"
                name="price"
                type="number"
                min="0"
                step="1"
                required
                defaultValue={trip.price}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="total_slots" className={labelClass}>
                Total slots
              </label>
              <input
                id="total_slots"
                name="total_slots"
                type="number"
                min="1"
                step="1"
                required
                defaultValue={trip.total_slots}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="payment_type" className={labelClass}>
                Payment type
              </label>
              <select
                id="payment_type"
                name="payment_type"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as "full" | "downpayment")}
                className={inputClass}
              >
                <option value="full">Full payment only</option>
                <option value="downpayment">Downpayment available</option>
              </select>
            </div>
            {paymentType === "downpayment" && (
              <div>
                <label htmlFor="min_downpayment" className={labelClass}>
                  Downpayment amount (PHP)
                </label>
                <input
                  id="min_downpayment"
                  name="min_downpayment"
                  type="number"
                  min="200"
                  step="1"
                  required
                  defaultValue={trip.min_downpayment ?? ""}
                  className={inputClass}
                  placeholder="500"
                />
                <p className="mt-1 text-xs font-medium text-trailhead">Minimum ₱200</p>
                <p className="mt-1 text-xs text-stone-500">
                  This is the amount participants pay to reserve their slot. They can choose to pay in full or this downpayment amount. You set this — participants cannot change it.
                </p>
              </div>
            )}
          </div>

          {paymentType === "downpayment" && (
            <div>
              <label htmlFor="downpayment_cutoff_days" className={labelClass}>
                Accept downpayments until
              </label>
              <input
                id="downpayment_cutoff_days"
                name="downpayment_cutoff_days"
                type="number"
                min="0"
                step="1"
                defaultValue={trip.downpayment_cutoff_days ?? 10}
                className={inputClass}
                placeholder="e.g. 10"
              />
              <p className="mt-1.5 text-xs text-stone-500">
                Number of days before the trip after which participants must pay in full. Set to 0 to allow downpayments until the day before the trip.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="cancellation_policy" className={labelClass}>
              Cancellation policy
            </label>
            <select
              id="cancellation_policy"
              name="cancellation_policy"
              value={cancellationPolicy}
              onChange={(e) => setCancellationPolicy(e.target.value as typeof cancellationPolicy)}
              className={inputClass}
            >
              <option value="flexible">{CANCELLATION_POLICIES.flexible.label} — {CANCELLATION_POLICIES.flexible.short}</option>
              <option value="moderate">{CANCELLATION_POLICIES.moderate.label} — {CANCELLATION_POLICIES.moderate.short}</option>
              <option value="strict">{CANCELLATION_POLICIES.strict.label} — {CANCELLATION_POLICIES.strict.short}</option>
              <option value="custom">{CANCELLATION_POLICIES.custom.label} — {CANCELLATION_POLICIES.custom.short}</option>
            </select>
            {cancellationPolicy === "custom" && (
              <textarea
                name="cancellation_policy_custom"
                required
                rows={3}
                defaultValue={trip.cancellation_policy_custom ?? ""}
                className={`${inputClass} mt-3 resize-none`}
                placeholder="Describe your cancellation and refund terms…"
              />
            )}
          </div>

          <div>
            <label htmlFor="messenger_gc_link" className={labelClass}>
              Messenger Group Chat Link{" "}
              <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="messenger_gc_link"
              name="messenger_gc_link"
              type="url"
              defaultValue={trip.messenger_gc_link ?? ""}
              className={inputClass}
              placeholder="https://m.me/j/..."
            />
            <p className="mt-1.5 text-xs text-stone-500">
              Participants will receive this link after their booking is confirmed. You can add or update this anytime.
            </p>
          </div>

          {/* Meeting points */}
          <div>
            <label className={labelClass}>Meeting points</label>
            <p className="mt-0.5 text-xs text-stone-500">
              Add all pickup locations with optional pickup times.
            </p>
            <div className="mt-2 space-y-2">
              <div className="hidden grid-cols-[1fr_1fr_32px] gap-2 sm:grid">
                <span className="text-xs font-medium text-stone-500">Location</span>
                <span className="text-xs font-medium text-stone-500">Pickup time</span>
                <span />
              </div>
              {meetingPoints.map((mp, idx) => (
                <div key={idx} className="flex gap-2">
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={mp.location}
                      onChange={(e) => setMeetingPoints((prev) => prev.map((m, i) => i === idx ? { ...m, location: e.target.value } : m))}
                      placeholder="Cubao, EDSA"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={mp.time}
                      onChange={(e) => setMeetingPoints((prev) => prev.map((m, i) => i === idx ? { ...m, time: e.target.value } : m))}
                      placeholder="e.g. 4:00 AM (optional)"
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setMeetingPoints((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={meetingPoints.length === 1}
                    aria-label="Remove meeting point"
                    className="mt-1.5 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center self-start rounded-lg border border-stone-200 text-sm text-stone-400 transition hover:border-red-200 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setMeetingPoints((prev) => [...prev, { location: "", time: "" }])}
              className="mt-2 w-full rounded-lg border border-dashed border-stone-300 py-2 text-sm text-stone-500 transition hover:border-trailhead hover:text-trailhead"
            >
              + Add meeting point
            </button>
          </div>
        </>
      )}

      {/* Description */}
      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          defaultValue={trip.description}
          className={`${inputClass} resize-none`}
          placeholder="Describe the trip experience, highlights, and what participants can expect…"
        />
      </div>

      {/* What's included */}
      <div>
        <label htmlFor="includes" className={labelClass}>
          What&apos;s included
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          List items separated by new lines (e.g. Guide fee, Camping gear, Meals)
        </p>
        <textarea
          id="includes"
          name="includes"
          rows={4}
          defaultValue={trip.includes ?? ""}
          className={`${inputClass} mt-1.5 resize-none`}
          placeholder={"Guide fee\nCamping gear\nBreakfast and dinner"}
        />
      </div>

      {/* What to bring */}
      <div>
        <label htmlFor="what_to_bring" className={labelClass}>
          What to bring
        </label>
        <p className="mt-0.5 text-xs text-stone-500">
          List items separated by new lines (e.g. Sleeping bag, Rain jacket, Headlamp)
        </p>
        <textarea
          id="what_to_bring"
          name="what_to_bring"
          rows={4}
          defaultValue={trip.what_to_bring ?? ""}
          className={`${inputClass} mt-1.5 resize-none`}
          placeholder={"Sleeping bag\nRain jacket\nHeadlamp\nExtra clothes"}
        />
      </div>

      {/* Photo upload */}
      <div>
        <p className={labelClass}>
          Photos{" "}
          <span className="font-normal text-stone-400">(up to 5 — first is cover)</span>
        </p>
        <div className="mt-1.5">
          <PhotoUploader
            initial={trip.photos ?? []}
            onChange={setPhotoItems}
          />
        </div>
      </div>

      {/* Participant Waiver */}
      <div>
        <label htmlFor="waiver_text" className={labelClass}>
          Participant Waiver
        </label>
        <textarea
          id="waiver_text"
          name="waiver_text"
          rows={6}
          defaultValue={trip.waiver_text ?? DEFAULT_WAIVER_TEXT}
          className={`${inputClass} resize-y`}
          placeholder="Enter waiver text…"
        />
        <p className="mt-1.5 text-xs text-stone-500">
          This waiver will be shown to each participant when they confirm their spot. You can customize it or use the default template.
        </p>
      </div>

      <div className="flex items-center justify-end gap-4 border-t border-stone-100 pt-6">
        <a
          href="/organizer/dashboard"
          className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
        >
          Cancel
        </a>
        {trip.status === "draft" ? (
          <>
            <button
              type="button"
              disabled={isPending || isUploadingPhotos}
              onClick={() => {
                submitIntentRef.current = "draft";
                formRef.current?.requestSubmit();
              }}
              className="rounded-xl border border-stone-200 px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploadingPhotos ? "Uploading…" : isPending && submitIntentRef.current === "draft" ? "Saving…" : "Save as Draft"}
            </button>
            <button
              type="button"
              disabled={isPending || isUploadingPhotos}
              onClick={() => {
                submitIntentRef.current = "active";
                formRef.current?.requestSubmit();
              }}
              className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploadingPhotos ? "Uploading photos…" : isPending && submitIntentRef.current === "active" ? "Publishing…" : "Publish Trip"}
            </button>
          </>
        ) : (
          <button
            type="submit"
            disabled={isPending || isUploadingPhotos}
            onClick={() => { submitIntentRef.current = "active"; }}
            className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploadingPhotos ? "Uploading photos…" : isPending ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
    </form>
  );
}
