"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import { updateOrganizerProfile } from "@/app/actions/organizer";
import { supabaseBrowser } from "@/lib/supabase-browser";

async function compressToSquare(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const size = Math.min(400, img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const scale = size / Math.min(img.naturalWidth, img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.8,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none ring-trailhead/30 placeholder:text-stone-400 focus:border-trailhead focus:ring-2";
const labelClass = "block text-sm font-medium text-stone-700";

type SocialLinks = { facebook?: string | null; instagram?: string | null; tiktok?: string | null } | null;

type OrganizerData = {
  display_name: string | null;
  full_name: string;
  phone: string;
  bio: string;
  photo_url: string | null;
  cover_image_url: string | null;
  social_links: SocialLinks;
  payout_method: string | null;
  gcash_number: string | null;
  gcash_name: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
};

export function ProfileForm({ organizer }: { organizer: OrganizerData }) {
  const [state, action, pending] = useActionState(updateOrganizerProfile, null);
  const [payoutMethod, setPayoutMethod] = useState<string>(organizer.payout_method ?? "");
  const [photoUrl, setPhotoUrl] = useState<string>(organizer.photo_url ?? "");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = organizer.full_name
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoUploading(true);
    setPhotoError(null);
    const compressed = await compressToSquare(file);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const { data, error } = await supabaseBrowser.storage
      .from("organizer-photos")
      .upload(path, compressed, { upsert: false });
    if (error || !data) {
      setPhotoError(error?.message ?? "Upload failed. Please try again.");
      setPhotoUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabaseBrowser.storage.from("organizer-photos").getPublicUrl(data.path);
    setPhotoUrl(publicUrl);
    setPhotoUploading(false);
  }

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      {/* Profile photo */}
      <div>
        <p className={labelClass}>Profile photo <span className="font-normal text-stone-400">(optional)</span></p>
        <div className="mt-2 flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-trailhead-muted text-lg font-bold text-trailhead">
            {photoUrl ? (
              <Image src={photoUrl} alt="Profile photo" fill className="object-cover" sizes="64px" />
            ) : (
              <span className="flex h-full w-full items-center justify-center">{initials}</span>
            )}
            {photoUploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={photoUploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm transition hover:border-trailhead hover:text-trailhead disabled:cursor-not-allowed disabled:opacity-50"
            >
              {photoUploading ? "Uploading…" : "Change photo"}
            </button>
            {photoError && (
              <p className="text-xs text-red-600">{photoError}</p>
            )}
          </div>
        </div>
        <input type="hidden" name="photo_url" value={photoUrl} />
      </div>

      <div>
        <label htmlFor="display_name" className={labelClass}>
          Display name
        </label>
        <p className="mt-0.5 text-xs text-stone-500">Your public-facing name — club, brand, or trail name.</p>
        <input
          id="display_name"
          name="display_name"
          type="text"
          required
          defaultValue={organizer.display_name ?? ""}
          className={inputClass}
          placeholder="e.g. Summit Seekers PH, Pekeng Mountaineer"
        />
      </div>

      <div>
        <label htmlFor="full_name" className={labelClass}>
          Full name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          defaultValue={organizer.full_name}
          className={inputClass}
          placeholder="Juan dela Cruz"
        />
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          defaultValue={organizer.phone}
          className={inputClass}
          placeholder="+63 9XX XXX XXXX"
        />
      </div>

      <div>
        <label htmlFor="bio" className={labelClass}>
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          required
          rows={5}
          defaultValue={organizer.bio}
          className={`${inputClass} resize-none`}
          placeholder="Tell adventurers about your experience…"
        />
      </div>

      <div>
        <label htmlFor="cover_image_url" className={labelClass}>
          Cover image URL <span className="font-normal text-stone-400">(optional)</span>
        </label>
        <p className="mt-0.5 text-xs text-stone-500">Displayed as a banner at the top of your public profile.</p>
        <input
          id="cover_image_url"
          name="cover_image_url"
          type="url"
          defaultValue={organizer.cover_image_url ?? ""}
          className={inputClass}
          placeholder="https://…"
        />
      </div>

      <div>
        <p className={`${labelClass} mb-1`}>Social links <span className="font-normal text-stone-400">(optional)</span></p>
        <div className="space-y-2">
          <input
            name="social_facebook"
            type="url"
            defaultValue={organizer.social_links?.facebook ?? ""}
            className={inputClass}
            placeholder="https://facebook.com/yourpage"
          />
          <input
            name="social_instagram"
            type="url"
            defaultValue={organizer.social_links?.instagram ?? ""}
            className={inputClass}
            placeholder="https://instagram.com/yourhandle"
          />
          <input
            name="social_tiktok"
            type="url"
            defaultValue={organizer.social_links?.tiktok ?? ""}
            className={inputClass}
            placeholder="https://tiktok.com/@yourhandle"
          />
        </div>
      </div>

      <div className="border-t border-stone-100 pt-5">
        <p className={`${labelClass} mb-1`}>Payout details <span className="font-normal text-stone-400">(optional)</span></p>
        <p className="mb-3 text-xs text-stone-500">Used to process your earnings after each trip.</p>
        <div className="space-y-4">
          <div>
            <label htmlFor="payout_method" className={labelClass}>
              Preferred payout method
            </label>
            <select
              id="payout_method"
              name="payout_method"
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value)}
              className={inputClass}
            >
              <option value="">Select method…</option>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>

          {payoutMethod === "gcash" && (
            <>
              <div>
                <label htmlFor="gcash_number" className={labelClass}>
                  GCash number
                </label>
                <input
                  id="gcash_number"
                  name="gcash_number"
                  type="text"
                  defaultValue={organizer.gcash_number ?? ""}
                  className={inputClass}
                  placeholder="09XXXXXXXXX"
                />
              </div>
              <div>
                <label htmlFor="gcash_name" className={labelClass}>
                  Account name
                </label>
                <input
                  id="gcash_name"
                  name="gcash_name"
                  type="text"
                  defaultValue={organizer.gcash_name ?? ""}
                  className={inputClass}
                  placeholder="Full name on GCash"
                />
              </div>
            </>
          )}

          {payoutMethod === "bank_transfer" && (
            <>
              <div>
                <label htmlFor="bank_name" className={labelClass}>
                  Bank name
                </label>
                <input
                  id="bank_name"
                  name="bank_name"
                  type="text"
                  defaultValue={organizer.bank_name ?? ""}
                  className={inputClass}
                  placeholder="BDO, BPI, etc."
                />
              </div>
              <div>
                <label htmlFor="bank_account_number" className={labelClass}>
                  Account number
                </label>
                <input
                  id="bank_account_number"
                  name="bank_account_number"
                  type="text"
                  defaultValue={organizer.bank_account_number ?? ""}
                  className={inputClass}
                  placeholder="Account number"
                />
              </div>
              <div>
                <label htmlFor="bank_account_name" className={labelClass}>
                  Account name
                </label>
                <input
                  id="bank_account_name"
                  name="bank_account_name"
                  type="text"
                  defaultValue={organizer.bank_account_name ?? ""}
                  className={inputClass}
                  placeholder="Full name on bank account"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 border-t border-stone-100 pt-4">
        <a href="/organizer/dashboard" className="text-sm font-medium text-stone-600 transition hover:text-stone-900">
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-trailhead px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-trailhead-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
