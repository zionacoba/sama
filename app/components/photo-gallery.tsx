"use client";

import Image from "next/image";
import { useState, useRef } from "react";

export function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [heroIndex, setHeroIndex] = useState(0);
  const [thumbOffset, setThumbOffset] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (photos.length === 0) return null;

  const nonHero = photos.map((_, i) => i).filter((i) => i !== heroIndex);
  const needsArrows = nonHero.length > 4;
  const visible = nonHero.slice(thumbOffset, thumbOffset + 4);
  const canPrev = thumbOffset > 0;
  const canNext = thumbOffset + 4 < nonHero.length;

  function goTo(idx: number) {
    setHeroIndex(idx);
    const newNonHero = photos.map((_, i) => i).filter((i) => i !== idx);
    setThumbOffset((o) => Math.min(o, Math.max(0, newNonHero.length - 4)));
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    goTo(dx < 0
      ? (heroIndex + 1) % photos.length
      : (heroIndex - 1 + photos.length) % photos.length
    );
  }

  const arrowBtn = (onClick: () => void, label: string, hidden: boolean, glyph: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-white text-lg leading-none text-stone-600 shadow-sm transition hover:border-trailhead hover:text-trailhead focus:outline-none focus:ring-2 focus:ring-trailhead focus:ring-offset-1 ${hidden ? "invisible" : ""}`}
    >
      {glyph}
    </button>
  );

  const thumbEl = (i: number) => (
    <button
      key={i}
      type="button"
      onClick={() => goTo(i)}
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
          quality={75}
        />
      </div>
    </button>
  );

  return (
    <div className="space-y-2">
      {/* Hero */}
      <div
        className="relative aspect-[16/9] select-none overflow-hidden rounded-2xl bg-gradient-to-br from-trailhead/20 via-trailhead-muted to-emerald-100/80"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          src={photos[heroIndex]}
          alt={alt}
          fill
          className="object-cover transition-all duration-300"
          sizes="(min-width: 768px) 768px, 100vw"
          quality={85}
          priority
        />
        {photos.length > 1 && (
          <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white tabular-nums">
            {heroIndex + 1} / {photos.length}
          </span>
        )}
      </div>

      {/* Thumbnail strip */}
      {nonHero.length > 0 && (
        needsArrows ? (
          <div className="flex items-center gap-2">
            {arrowBtn(() => setThumbOffset((o) => o - 1), "Previous photos", !canPrev, "‹")}
            <div className="flex flex-1 gap-2">
              {visible.map(thumbEl)}
            </div>
            {arrowBtn(() => setThumbOffset((o) => o + 1), "Next photos", !canNext, "›")}
          </div>
        ) : (
          <div className="flex gap-2">
            {nonHero.map(thumbEl)}
          </div>
        )
      )}
    </div>
  );
}
