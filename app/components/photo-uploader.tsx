"use client";

import { useEffect, useRef, useState } from "react";

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
          const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
          console.log(`[photo] ${file.name}: ${(file.size / 1024).toFixed(0)} KB → ${(compressed.size / 1024).toFixed(0)} KB`);
          resolve(compressed);
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
  | { kind: "file"; file: File; previewUrl: string };

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
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragSrc = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notify parent of initial state so submit works without any interaction
  useEffect(() => {
    onChange(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: PhotoItem[]) {
    setItems(next);
    onChange(next);
  }

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - items.length);
    e.target.value = "";
    const newItems: PhotoItem[] = await Promise.all(
      files.map(async (file) => {
        const compressed = await compressImage(file);
        return { kind: "file" as const, file: compressed, previewUrl: URL.createObjectURL(compressed) };
      }),
    );
    update([...items, ...newItems]);
  }

  function remove(index: number) {
    const item = items[index];
    if (item.kind === "file") URL.revokeObjectURL(item.previewUrl);
    update(items.filter((_, i) => i !== index));
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

  function handleDrop(e: React.DragEvent, i: number) {
    e.preventDefault();
    if (dragSrc.current === null || dragSrc.current === i) {
      setDragOverIdx(null);
      return;
    }
    const next = [...items];
    const [dragged] = next.splice(dragSrc.current, 1);
    next.splice(i, 0, dragged);
    dragSrc.current = null;
    setDragOverIdx(null);
    update(next);
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
                dragOverIdx === i
                  ? "border-trailhead shadow-md"
                  : "border-stone-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc(item)}
                alt={`Photo ${i + 1}`}
                className="aspect-[4/3] w-full object-cover"
                draggable={false}
              />
              {i === 0 && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  Cover
                </span>
              )}
              <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                ⠿ drag to reorder
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm text-white opacity-0 transition hover:bg-red-600 group-hover:opacity-100"
                aria-label="Remove photo"
              >
                ✕
              </button>
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
            <span className="font-normal text-stone-400">
              ({items.length} / {MAX_PHOTOS})
            </span>
          </button>
        </>
      )}
    </div>
  );
}
