"use client";

import Image from "next/image";
import { useState } from "react";

export function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [heroIndex, setHeroIndex] = useState(0);

  if (photos.length === 0) return null;

  const thumbnailIndices = photos
    .map((_, i) => i)
    .filter((i) => i !== heroIndex)
    .slice(0, 4);

  return (
    <div className="space-y-2">
      <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80">
        <Image
          src={photos[heroIndex]}
          alt={alt}
          fill
          className="object-cover transition-all duration-300"
          sizes="(min-width: 768px) 768px, 100vw"
          priority
        />
      </div>

      {thumbnailIndices.length > 0 && (
        <div className="flex gap-2">
          {thumbnailIndices.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setHeroIndex(i)}
              aria-label={`View photo ${i + 1}`}
              className="group relative flex-1 overflow-hidden rounded-xl border-2 border-transparent transition hover:border-trailhead focus:outline-none focus:ring-2 focus:ring-trailhead focus:ring-offset-2"
            >
              <div className="relative aspect-[4/3]">
                <Image
                  src={photos[i]}
                  alt={`${alt} — photo ${i + 1}`}
                  fill
                  className="object-cover transition group-hover:scale-105"
                  sizes="(min-width: 768px) 180px, 25vw"
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
