"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createTrip } from "@/app/actions/trip";
import { CANCELLATION_POLICIES } from "@/lib/cancellation-policies";
import { PhotoUploader, type PhotoItem } from "@/app/components/photo-uploader";
import { DifficultyInfoButton, RecurringTemplateInfoButton } from "@/app/components/difficulty-info";
import { DEFAULT_WAIVER_TEXT } from "@/lib/constants";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";

const labelClass = "block text-sm font-medium text-stone-700";

type TripDefaults = {
  id?: string | number | null;
  title?: string | null;
  activity_type?: string | null;
  difficulty?: string | null;
  destination?: string | null;
  region?: string | null;
  duration?: string | null;
  description?: string | null;
  includes?: string | null;
  what_to_bring?: string | null;
  photos?: string[] | null;
  payment_type?: string | null;
  min_downpayment?: number | null;
  downpayment_cutoff_days?: number | null;
  cancellation_policy?: string | null;
  cancellation_policy_custom?: string | null;
  price?: number | string | null;
  waiver_text?: string | null;
  messenger_gc_link?: string | null;
  custom_questions?: string[] | null;
  custom_question?: string | null;
};

export function TripForm({
  destinations = [],
  templates = [],
  defaultValues,
  preselectedTemplateId,
  fromTemplateName = null,
  defaultIsTemplate = false,
}: {
  destinations?: string[];
  templates?: { id: string | number; title: string }[];
  defaultValues?: TripDefaults | null;
  preselectedTemplateId?: string;
  fromTemplateName?: string | null;
  defaultIsTemplate?: boolean;
}) {
  const [state, action] = useActionState(createTrip, null);
  const [isPending, startTransition] = useTransition();
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  type MeetingPoint = { location: string; time: string };
  const [isTemplate, setIsTemplate] = useState(defaultIsTemplate);
  const [meetingPoints, setMeetingPoints] = useState<MeetingPoint[]>([{ location: "", time: "" }]);
  const [duration, setDuration] = useState<string>(defaultValues?.duration ?? "");
  const [dateStart, setDateStart] = useState<string>("");
  const [price, setPrice] = useState<number>(Number(defaultValues?.price) || 0);
  const [paymentType, setPaymentType] = useState<"full" | "downpayment">(
    defaultValues?.payment_type === "downpayment" ? "downpayment" : "full",
  );
  const [cancellationPolicy, setCancellationPolicy] = useState<"flexible" | "moderate" | "strict" | "custom">(
    (["flexible", "moderate", "strict", "custom"].includes(defaultValues?.cancellation_policy ?? "")
      ? defaultValues!.cancellation_policy
      : "flexible") as "flexible" | "moderate" | "strict" | "custom",
  );
  const initialQuestions = defaultValues?.custom_questions ?? (defaultValues?.custom_question ? [defaultValues.custom_question] : []);
  const [customQuestions, setCustomQuestions] = useState<string[]>(initialQuestions);
  const isUploadingPhotos = photoItems.some((i) => i.kind === "uploading");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [editedAfterSubmit, setEditedAfterSubmit] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitIntentRef = useRef<"active" | "draft">("active");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setHasSubmitted(true);
    setEditedAfterSubmit(false);
    const formData = new FormData(formRef.current);

    formData.set("photos_json", JSON.stringify(photoItems.filter((i) => i.kind === "url").map((i) => i.url)));
    formData.set("meeting_points", JSON.stringify(meetingPoints));
    formData.set("status", submitIntentRef.current);

    startTransition(async () => {
      await action(formData);
    });
  }

  const errorMessage = hasSubmitted && !editedAfterSubmit && !isPending ? state?.error : null;

  if (state && "success" in state) {
    const checkmark = (
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-600"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );

    if (isTemplate) {
      return (
        <div className="flex flex-col items-center py-12 text-center">
          {checkmark}
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">Template saved!</h1>
          <p className="mt-3 max-w-sm text-sm text-stone-500">
            Your template is ready. Create a run to list a specific date that joiners can book.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={`/organizer/trips/new?template_id=${state.tripId}`}
              className="rounded-xl border border-stone-200 px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
            >
              Create a run
            </a>
            <a
              href="/organizer/dashboard"
              className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
            >
              Go to dashboard
            </a>
          </div>
        </div>
      );
    }

    const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sama.com.ph";
    const tripUrl = `${siteOrigin}/trips/${state.slug}`;
    const isDraftSave = submitIntentRef.current === "draft";
    return (
      <div className="flex flex-col items-center py-12 text-center">
        {checkmark}
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">Trip saved!</h1>
        {state.warning && (
          <p className="mt-4 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {state.warning}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {isDraftSave ? (
            <a
              href={tripUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-stone-200 px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
            >
              Preview listing
            </a>
          ) : (
            <a
              href={tripUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-stone-200 px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
            >
              View listing
            </a>
          )}
          <a
            href="/organizer/dashboard"
            className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          {fromTemplateName ? `New run from ${fromTemplateName}` : "Create a new trip"}
        </h1>
        <p className="mt-1 text-stone-600">
          {fromTemplateName
            ? "Fill in the date, price, and slots for this run."
            : "Fill in the details below to publish your trip on Sama."}
        </p>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onChange={() => { if (hasSubmitted) setEditedAfterSubmit(true); }}
      className="space-y-6"
    >
      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
      )}

      {preselectedTemplateId && (
        <div className="rounded-xl border border-trailhead/30 bg-trailhead-muted px-4 py-3 text-sm text-trailhead">
          Pre-filled from your template. Add a date and price to create this run.
        </div>
      )}

      {/* Template link (only for non-templates when templates exist) */}
      {!isTemplate && templates.length > 0 && (
        <div>
          <label htmlFor="template_id" className={labelClass}>
            Link to template <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <select id="template_id" name="template_id" defaultValue={preselectedTemplateId ?? ""} className={inputClass}>
            <option value="">No template, standalone trip</option>
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
          defaultValue={defaultValues?.title ?? ""}
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
          <select id="activity_type" name="activity_type" required defaultValue={defaultValues?.activity_type ?? ""} className={inputClass}>
            <option value="">Select activity…</option>
            <option value="Hiking">Hiking</option>
            <option value="Freediving">Freediving</option>
            <option value="Beach & Island">Beach &amp; Island</option>
          </select>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <label htmlFor="difficulty" className={labelClass}>
              Level
            </label>
            <DifficultyInfoButton variant="organizer" compact />
          </div>
          <select id="difficulty" name="difficulty" required defaultValue={defaultValues?.difficulty ?? ""} className={inputClass}>
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
        <select id="duration" name="duration" required value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass}>
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
          defaultValue={defaultValues?.destination ?? ""}
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
          Region <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <select
          id="region"
          name="region"
          required
          defaultValue={defaultValues?.region ?? ""}
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
            <div className="flex flex-col">
              <label htmlFor="date_start" className={`${labelClass} flex-1`}>
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
            <div className="flex flex-col">
              <label htmlFor="date_end" className={`${labelClass} flex-1`}>
                End date{duration === "" || duration === "Day tour" ? (
                  <span className="font-normal text-stone-500"> (optional, for overnight or multi-day trips)</span>
                ) : null}
              </label>
              <input
                id="date_end"
                name="date_end"
                type="date"
                required={duration !== "" && duration !== "Day tour"}
                min={dateStart || new Date().toISOString().split("T")[0]}
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
                className={inputClass}
                placeholder="2500"
                onChange={(e) => setPrice(Number(e.target.value) || 0)}
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
                className={inputClass}
                placeholder="20"
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
                  min={Math.round(price * 0.10)}
                  step="1"
                  required
                  defaultValue={defaultValues?.min_downpayment ?? ""}
                  className={inputClass}
                  placeholder="500"
                />
                <p className="mt-1 text-xs font-medium text-trailhead">
                  {price > 0 ? `Minimum ₱${Math.round(price * 0.10).toLocaleString()} (10% of trip price)` : 'Set trip price first'}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  This is the amount participants pay to reserve their slot. They can choose to pay in full or this downpayment amount. You set this, participants cannot change it.
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
                defaultValue={defaultValues?.downpayment_cutoff_days ?? 3}
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
              <option value="flexible">{CANCELLATION_POLICIES.flexible.label}: {CANCELLATION_POLICIES.flexible.short}</option>
              <option value="moderate">{CANCELLATION_POLICIES.moderate.label}: {CANCELLATION_POLICIES.moderate.short}</option>
              <option value="strict">{CANCELLATION_POLICIES.strict.label}: {CANCELLATION_POLICIES.strict.short}</option>
              <option value="custom">{CANCELLATION_POLICIES.custom.label}: {CANCELLATION_POLICIES.custom.short}</option>
            </select>
            {cancellationPolicy !== "custom" && (
              <p className="mt-1.5 text-xs text-stone-500">
                {({
                  flexible: "Full refund up to 7 days before the trip. 50% refund between 3 and 7 days. No refund within 3 days.",
                  moderate: "Full refund up to 14 days before the trip. 50% refund between 7 and 14 days. No refund within 7 days.",
                  strict: "Full refund up to 30 days before the trip. 50% refund between 7 and 30 days. No refund within 7 days.",
                } as Record<string, string>)[cancellationPolicy]}
              </p>
            )}
            {cancellationPolicy === "custom" && (
              <textarea
                name="cancellation_policy_custom"
                required
                rows={3}
                defaultValue={defaultValues?.cancellation_policy_custom ?? ""}
                className={`${inputClass} mt-3 resize-none`}
                placeholder="Describe your cancellation and refund terms…"
              />
            )}
          </div>

          <div>
            <label htmlFor="messenger_gc_link" className={labelClass}>
              Messenger Group Chat Link{" "}
              <span className="font-normal text-stone-500">(optional)</span>
            </label>
            <input
              id="messenger_gc_link"
              name="messenger_gc_link"
              type="url"
              defaultValue={defaultValues?.messenger_gc_link ?? ""}
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
          defaultValue={defaultValues?.description ?? ""}
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
          defaultValue={defaultValues?.includes ?? ""}
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
          defaultValue={defaultValues?.what_to_bring ?? ""}
          className={`${inputClass} mt-1.5 resize-none`}
          placeholder={"Sleeping bag\nRain jacket\nHeadlamp\nExtra clothes"}
        />
      </div>

      {/* Photo upload */}
      <div>
        <p className={labelClass}>
          Photos{" "}
          <span className="font-normal text-stone-500">(up to 5, first is cover)</span>
        </p>
        <div className="mt-1.5">
          <PhotoUploader initial={defaultValues?.photos ?? []} onChange={setPhotoItems} />
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
          defaultValue={defaultValues?.waiver_text ?? DEFAULT_WAIVER_TEXT}
          className={`${inputClass} resize-y`}
          placeholder="Enter waiver text…"
        />
        <p className="mt-1.5 text-xs text-stone-500">
          This waiver will be shown to each participant when they confirm their spot. You can customize it or use the default template.
        </p>
      </div>

      {/* Custom questions */}
      <div>
        <p className={labelClass}>
          Ask joiners questions <span className="font-normal text-stone-500">(optional, up to 3)</span>
        </p>
        <input type="hidden" name="custom_questions" value={JSON.stringify(customQuestions.filter((q) => q.trim()))} />
        <div className="mt-1.5 space-y-2">
          {customQuestions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={q}
                maxLength={500}
                onChange={(e) => {
                  const next = [...customQuestions];
                  next[i] = e.target.value;
                  setCustomQuestions(next);
                }}
                placeholder={`e.g. Are you a confident swimmer?`}
                className="mt-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setCustomQuestions(customQuestions.filter((_, j) => j !== i))}
                className="mt-0 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-500 hover:border-red-300 hover:text-red-600"
                aria-label="Remove question"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {customQuestions.length < 3 && (
          <button
            type="button"
            onClick={() => setCustomQuestions([...customQuestions, ""])}
            className="mt-2 text-sm font-medium text-trailhead hover:underline"
          >
            + Add a question
          </button>
        )}
        <p className="mt-1.5 text-xs text-stone-500">
          If set, joiners must answer these when booking.
        </p>
      </div>

      {/* Template toggle, advanced option, shown at bottom */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isTemplate}
            onChange={(e) => setIsTemplate(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-trailhead accent-trailhead"
          />
          <input type="hidden" name="is_template" value={isTemplate.toString()} />
          <span className="flex items-center gap-1.5 text-sm font-medium text-stone-700">
            This is a recurring trip template
            <RecurringTemplateInfoButton />
          </span>
        </label>
        <p className="ml-7 mt-0.5 text-xs text-stone-500">
          Most organizers skip this, only check if you run this exact trip regularly on different dates.
        </p>
      </div>

      <div className="flex items-center justify-end gap-4 border-t border-stone-100 pt-6">
        <a
          href="/organizer/dashboard"
          className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
        >
          Cancel
        </a>
        <button
          type="button"
          disabled={isPending || isUploadingPhotos || !!(state && "success" in state)}
          onClick={() => {
            submitIntentRef.current = "draft";
            formRef.current?.requestSubmit();
          }}
          className="rounded-xl border border-stone-200 px-6 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploadingPhotos ? "Uploading…" : isPending && submitIntentRef.current === "draft" ? "Saving…" : "Save as Draft"}
        </button>
        <button
          type="submit"
          disabled={isPending || isUploadingPhotos || !!(state && "success" in state)}
          onClick={() => { submitIntentRef.current = "active"; }}
          className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploadingPhotos ? "Uploading photos…" : isPending && submitIntentRef.current === "active" ? "Creating trip…" : "Create trip"}
        </button>
      </div>
    </form>
      </div>
    </div>
  );
}
