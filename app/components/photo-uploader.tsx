"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

const MAX_PHOTOS = 5;
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.8;

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

export type PhotoItem =
  | { kind: "url"; url: string }
  | { kind: "uploading"; previewUrl: string; id: string }
  | { kind: "error"; previewUrl: string; file: File; id: string; error: string };

function previewSrc(item: PhotoItem) {
  return item.kind === "url" ? item.url : item.previewUrl;
}

export function PhotoUploader({
  initial = [],
  onChange,
}: {
  initial?: string[];
  onChange: (items: PhotoItem[]) => void;
}) {
  const [items, setItems] = useState<PhotoItem[]>(() =>
    initial.map((url) => ({ kind: "url" as const, url })),
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragSrc = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Sync all state changes (including async upload completions) to parent
  useEffect(() => {
    onChangeRef.current(items);
  }, [items]);

  async function startUpload(id: string, file: File) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Only JPEG, PNG, and WebP images are allowed.");
      setItems((prev) => prev.filter((i) => !(i.kind === "uploading" && i.id === id)));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("File size must be under 10MB.");
      setItems((prev) => prev.filter((i) => !(i.kind === "uploading" && i.id === id)));
      return;
    }
    setUploadError(null);
    const compressed = await compressImage(file);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

    const { data, error } = await supabaseBrowser.storage
      .from("trip-photos")
      .upload(path, compressed, { upsert: false });

    if (error || !data) {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.kind === "uploading" && i.id === id);
        if (idx === -1) return prev;
        const old = prev[idx] as { kind: "uploading"; previewUrl: string; id: string };
        const next = [...prev];
        next[idx] = { kind: "error", previewUrl: old.previewUrl, file, id, error: error?.message ?? "Upload failed. Please try again." };
        return next;
      });
      return;
    }

    const { data: { publicUrl } } = supabaseBrowser.storage.from("trip-photos").getPublicUrl(data.path);

    setItems((prev) => {
      const idx = prev.findIndex((i) => i.kind === "uploading" && i.id === id);
      if (idx === -1) return prev; // removed while uploading
      const next = [...prev];
      next[idx] = { kind: "url", url: publicUrl };
      return next;
    });
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - items.length);
    e.target.value = "";
    if (files.length === 0) return;

    const pending = files.map((file) => ({
      id: `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setItems((prev) => [
      ...prev,
      ...pending.map(({ id, previewUrl }) => ({ kind: "uploading" as const, previewUrl, id })),
    ]);

    await Promise.all(pending.map(({ id, file }) => startUpload(id, file)));
  }

  async function retryUpload(id: string, file: File, previewUrl: string) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.kind === "error" && i.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { kind: "uploading", previewUrl, id };
      return next;
    });
    await startUpload(id, file);
  }

  function remove(index: number) {
    const item = items[index];
    if (item && (item.kind === "uploading" || item.kind === "error")) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDragStart(e: React.DragEvent, i: number) {
    dragSrc.current = i;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(i);
  }

  // Shared reorder logic for both drag-and-drop (desktop) and the tap-based
  // move buttons (mobile). Moves the item at `from` to position `to`.
  function move(from: number, to: number) {
    setItems((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleDrop(e: React.DragEvent, i: number) {
    e.preventDefault();
    const src = dragSrc.current;
    if (src === null || src === i) { setDragOverIdx(null); return; }
    dragSrc.current = null;
    move(src, i);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    dragSrc.current = null;
    setDragOverIdx(null);
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item, i) => (
            <div
              key={i}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={(e) => handleDrop(e, i)}
              onDragEnd={handleDragEnd}
              className={`group relative cursor-grab overflow-hidden rounded-xl border-2 transition active:cursor-grabbing ${
                dragOverIdx === i ? "border-trailhead shadow-md" : "border-stone-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc(item)}
                alt={`Photo ${i + 1}`}
                className="aspect-[4/3] w-full object-cover"
                draggable={false}
                width={320}
                height={240}
                loading="lazy"
              />
              {i === 0 && item.kind === "url" && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Cover
                </span>
              )}

              {item.kind === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                </div>
              )}

              {item.kind === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-900/70 p-2">
                  <span className="text-center text-[11px] font-medium leading-snug text-white">
                    Upload failed
                  </span>
                  <button
                    type="button"
                    onClick={() => retryUpload(item.id, item.file, item.previewUrl)}
                    className="rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-white/40"
                  >
                    Retry
                  </button>
                </div>
              )}

              {item.kind !== "uploading" && (
                <>
                  <span className="pointer-events-none absolute bottom-1.5 right-1.5 hidden rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100 lg:block">
                    ⠿ drag to reorder
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className={`absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-sm text-white transition hover:bg-red-600 lg:h-6 lg:w-6 ${
                      item.kind === "error" ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                    }`}
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </>
              )}

              {/* Tap-based reorder for touch. Mobile only (lg:hidden) so desktop
                  drag-and-drop is untouched. Sits in a bar along the bottom edge
                  with a semi-opaque backdrop for legibility over any photo. */}
              {item.kind === "url" && (
                <div className="absolute inset-x-0 bottom-0 flex items-stretch justify-between gap-1 bg-black/40 p-1 lg:hidden">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label="Move photo earlier"
                    className="flex h-10 min-w-[40px] flex-1 items-center justify-center rounded-lg bg-white/20 text-base text-white transition hover:bg-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === items.length - 1}
                    aria-label="Move photo later"
                    className="flex h-10 min-w-[40px] flex-1 items-center justify-center rounded-lg bg-white/20 text-base text-white transition hover:bg-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {items.length < MAX_PHOTOS && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFiles}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 py-4 text-sm font-medium text-stone-500 transition hover:border-trailhead hover:text-trailhead"
          >
            + Add photos
            <span className="font-normal text-stone-500">
              ({items.length} / {MAX_PHOTOS})
            </span>
          </button>
        </>
      )}
      {uploadError && (
        <p role="alert" className="mt-2 text-xs text-red-600">{uploadError}</p>
      )}
    </div>
  );
}
