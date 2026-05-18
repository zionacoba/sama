"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { updateTrip } from "@/app/actions/trip";
import { supabaseBrowser } from "@/lib/supabase-browser";

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";

const labelClass = "block text-sm font-medium text-stone-700";

type TripForEdit = {
  id: number;
  title: string;
  activity_type: string | null;
  difficulty: string;
  destination: string;
  date_start: string;
  price: number;
  total_slots: number;
  meeting_point: string;
  description: string;
  includes: string | null;
  what_to_bring: string | null;
  photos: string[] | null;
  payment_type: string | null;
  min_downpayment: number | null;
};

export function EditTripForm({ trip }: { trip: TripForEdit }) {
  const [state, action] = useActionState(updateTrip, null);
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paymentType, setPaymentType] = useState<"full" | "downpayment">(
    trip.payment_type === "downpayment" ? "downpayment" : "full",
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    trip.photos?.[0] ?? null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : (trip.photos?.[0] ?? null));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;

    setUploadError(null);
    const formData = new FormData(formRef.current);

    if (selectedFile) {
      const ext = selectedFile.name.split(".").pop() ?? "jpg";
      const path = `${Date.now()}.${ext}`;

      const { data, error } = await supabaseBrowser.storage
        .from("trip-photos")
        .upload(path, selectedFile, { upsert: false });

      if (error || !data) {
        setUploadError(error?.message ?? "Image upload failed. Please try again.");
        return;
      }

      const {
        data: { publicUrl },
      } = supabaseBrowser.storage.from("trip-photos").getPublicUrl(data.path);

      formData.set("photo_url", publicUrl);
    } else {
      formData.set("photo_url", trip.photos?.[0] ?? "");
    }

    startTransition(async () => {
      await action(formData);
    });
  }

  const errorMessage = uploadError ?? state?.error;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="trip_id" value={trip.id} />

      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {errorMessage}
        </p>
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

      {/* Activity type + Difficulty */}
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
            <option value="Camping">Camping</option>
            <option value="Freediving">Freediving</option>
            <option value="Island Hopping">Island Hopping</option>
            <option value="Surfing">Surfing</option>
          </select>
        </div>
        <div>
          <label htmlFor="difficulty" className={labelClass}>
            Difficulty
          </label>
          <select
            id="difficulty"
            name="difficulty"
            required
            defaultValue={trip.difficulty}
            className={inputClass}
          >
            <option value="">Select difficulty…</option>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
            <option value="Expert">Expert</option>
          </select>
        </div>
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
          defaultValue={trip.destination}
          className={inputClass}
          placeholder="Mt. Pulag, Benguet"
        />
      </div>

      {/* Date + Price + Slots */}
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
            defaultValue={trip.date_start.slice(0, 10)}
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
          defaultValue={trip.meeting_point}
          className={inputClass}
          placeholder="Km. 61, Halsema Highway, Bokod"
        />
      </div>

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

      {/* Payment options */}
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
              Minimum downpayment (PHP)
            </label>
            <input
              id="min_downpayment"
              name="min_downpayment"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={trip.min_downpayment ?? ""}
              className={inputClass}
              placeholder="500"
            />
          </div>
        )}
      </div>

      {/* Photo upload */}
      <div>
        <label htmlFor="photo" className={labelClass}>
          Photo{" "}
          <span className="font-normal text-stone-400">(optional — upload a new one to replace)</span>
        </label>
        <input
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="mt-1.5 w-full cursor-pointer rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm file:mr-4 file:rounded-lg file:border-0 file:bg-trailhead file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-trailhead-dark"
        />
        {previewUrl && (
          <div className="mt-3 overflow-hidden rounded-xl border border-stone-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="Photo preview"
              className="h-48 w-full object-cover"
            />
          </div>
        )}
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
            ? selectedFile
              ? "Uploading…"
              : "Saving…"
            : "Save changes"}
        </button>
      </div>
    </form>
  );
}
