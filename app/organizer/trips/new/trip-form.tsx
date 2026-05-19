"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { createTrip } from "@/app/actions/trip";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { PhotoUploader, type PhotoItem } from "@/app/components/photo-uploader";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";

const labelClass = "block text-sm font-medium text-stone-700";

export function TripForm({
  destinations = [],
  templates = [],
}: {
  destinations?: string[];
  templates?: { id: string | number; title: string }[];
}) {
  const [state, action] = useActionState(createTrip, null);
  const [isPending, startTransition] = useTransition();
  const [photoItems, setPhotoItems] = useState<PhotoItem[]>([]);
  const [isTemplate, setIsTemplate] = useState(false);
  const [paymentType, setPaymentType] = useState<"full" | "downpayment">("full");
  const [cancellationPolicy, setCancellationPolicy] = useState<"flexible" | "moderate" | "strict" | "custom">("flexible");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setUploadError(null);
    const formData = new FormData(formRef.current);

    const uploadedUrls: string[] = [];
    for (const item of photoItems) {
      if (item.kind === "url") {
        uploadedUrls.push(item.url);
      } else {
        const ext = item.file.name.split(".").pop() ?? "jpg";
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { data, error } = await supabaseBrowser.storage
          .from("trip-photos")
          .upload(path, item.file, { upsert: false });
        if (error || !data) {
          setUploadError(error?.message ?? "Image upload failed. Please try again.");
          return;
        }
        const { data: { publicUrl } } = supabaseBrowser.storage.from("trip-photos").getPublicUrl(data.path);
        uploadedUrls.push(publicUrl);
      }
    }

    formData.set("photos_json", JSON.stringify(uploadedUrls));

    startTransition(async () => {
      await action(formData);
    });
  }

  const hasNewUploads = photoItems.some((i) => i.kind === "file");
  const errorMessage = uploadError ?? state?.error;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
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
          <select id="template_id" name="template_id" className={inputClass}>
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
          <select id="activity_type" name="activity_type" required className={inputClass}>
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
          <select id="difficulty" name="difficulty" required className={inputClass}>
            <option value="">Select level…</option>
            <option value="Chill">Chill</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
            <option value="Expert">Expert</option>
          </select>
        </div>
      </div>
      {/* Duration */}
      <div>
        <label htmlFor="duration" className={labelClass}>
          Duration
        </label>
        <select id="duration" name="duration" required className={inputClass}>
          <option value="">Select duration…</option>
          <option value="Day tour">Day tour</option>
          <option value="Overnight">Overnight</option>
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

      {/* Date + Price + Slots (hidden for templates) */}
      {!isTemplate && (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="date_start" className={labelClass}>
                Date
              </label>
              <input
                id="date_start"
                name="date_start"
                type="date"
                required
                className={inputClass}
              />
            </div>
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

          {/* Meeting point */}
          <div>
            <label htmlFor="meeting_point" className={labelClass}>
              Meeting point
            </label>
            <input
              id="meeting_point"
              name="meeting_point"
              type="text"
              required
              className={inputClass}
              placeholder="Km. 61, Halsema Highway, Bokod"
            />
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
          className={`${inputClass} mt-1.5 resize-none`}
          placeholder={"Sleeping bag\nRain jacket\nHeadlamp\nExtra clothes"}
        />
      </div>

      {/* Payment options + Cancellation policy (hidden for templates) */}
      {!isTemplate && (
        <>
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
                  min="0"
                  step="1"
                  required
                  className={inputClass}
                  placeholder="500"
                />
              </div>
            )}
          </div>

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
              <option value="flexible">Flexible — full refund 3+ days before, 50% within 3 days</option>
              <option value="moderate">Moderate — 50% refund 5+ days before, no refund within 5 days</option>
              <option value="strict">Strict — no refund within 7 days of trip</option>
              <option value="custom">Custom — write your own policy</option>
            </select>
            {cancellationPolicy === "custom" && (
              <textarea
                name="cancellation_policy_custom"
                required
                rows={3}
                className={`${inputClass} mt-3 resize-none`}
                placeholder="Describe your cancellation and refund terms…"
              />
            )}
          </div>
        </>
      )}

      {/* Photo upload */}
      <div>
        <p className={labelClass}>
          Photos{" "}
          <span className="font-normal text-stone-400">(up to 5 — first is cover)</span>
        </p>
        <div className="mt-1.5">
          <PhotoUploader onChange={setPhotoItems} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 border-t border-stone-100 pt-6">
        <a
          href="/organizer/dashboard"
          className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending
            ? hasNewUploads
              ? "Uploading…"
              : "Creating trip…"
            : "Create trip"}
        </button>
      </div>
    </form>
  );
}
