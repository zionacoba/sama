"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";

export function PhotoGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const isOpen = lightboxIndex !== null;

  const prev = useCallback(() => {
    setLightboxIndex((i) => (i !== null ? (i - 1 + photos.length) % photos.length : null));
  }, [photos.length]);

  const next = useCallback(() => {
    setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null));
  }, [photos.length]);

  const close = useCallback(() => setLightboxIndex(null), []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, prev, next, close]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    dx < 0 ? next() : prev();
  }

  function onCarouselScroll() {
    const el = carouselRef.current;
    if (!el) return;
    setCarouselIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (photos.length === 0) return null;

  const rightPhotos = photos.slice(1, 5);
  const rightCount = rightPhotos.length;
  const totalCount = photos.length;

  const rightGridCls =
    rightCount === 1 ? "grid-cols-1" :
    rightCount === 2 ? "grid-cols-1 grid-rows-2" :
    "grid-cols-2 grid-rows-2";

  return (
    <>
      {/* Mobile: swipeable carousel */}
      <div className="sm:hidden relative h-60 rounded-2xl bg-stone-100 overflow-hidden">
        {totalCount === 1 ? (
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setLightboxIndex(0)}
            aria-label="View photo"
          >
            <Image src={photos[0]} alt={alt} fill className="object-cover" sizes="100vw" priority />
          </button>
        ) : (
          <>
            <div
              ref={carouselRef}
              className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto"
              onScroll={onCarouselScroll}
              style={{ scrollbarWidth: "none" }}
            >
              {photos.map((photo, i) => (
                <button
                  key={i}
                  type="button"
                  className="relative h-full w-full shrink-0 snap-center"
                  onClick={() => setLightboxIndex(i)}
                  aria-label={`View photo ${i + 1} of ${totalCount}`}
                >
                  <Image
                    src={photo}
                    alt={`${alt} — photo ${i + 1}`}
                    fill
                    className="object-cover"
                    sizes="100vw"
                    priority={i === 0}
                  />
                </button>
              ))}
            </div>
            {/* Dots position indicator */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className={`block h-1.5 w-1.5 rounded-full transition-colors ${
                    i === carouselIndex ? "bg-white" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Desktop: Airbnb-style grid */}
      <div className="relative hidden h-[400px] overflow-hidden rounded-2xl bg-stone-100 sm:block">
        <div className="flex h-full gap-1">
          {/* Main (left) photo */}
          <button
            type="button"
            className={`relative overflow-hidden group ${rightCount > 0 ? "flex-[3]" : "flex-1"}`}
            onClick={() => setLightboxIndex(0)}
            aria-label="View photo 1"
          >
            <Image
              src={photos[0]}
              alt={alt}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              sizes="(min-width: 640px) 60vw, 100vw"
              priority
            />
          </button>

          {/* Right photo grid */}
          {rightCount > 0 && (
            <div className={`flex-[2] grid gap-1 ${rightGridCls}`}>
              {rightPhotos.map((photo, i) => {
                const isLast = i === rightCount - 1;
                const showMoreOverlay = isLast && totalCount > 5;
                const colSpan = rightCount === 3 && i === 0 ? "col-span-2" : "";
                return (
                  <button
                    key={i}
                    type="button"
                    className={`relative overflow-hidden group ${colSpan}`}
                    onClick={() => setLightboxIndex(i + 1)}
                    aria-label={`View photo ${i + 2}`}
                  >
                    <Image
                      src={photo}
                      alt={`${alt} — photo ${i + 2}`}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      sizes="20vw"
                    />
                    {showMoreOverlay && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <span className="text-sm font-semibold text-white">
                          +{totalCount - 5} more
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* "Show all photos" button */}
        {totalCount > 1 && (
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            Show all {totalCount} photos
          </button>
        )}
      </div>

      {/* Lightbox */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Top bar: counter + close */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3">
            <span
              className="tabular-nums text-sm font-medium text-white/70"
              aria-label={`Photo ${lightboxIndex! + 1} of ${totalCount}`}
            >
              <span aria-hidden="true">{lightboxIndex! + 1} / {totalCount}</span>
            </span>
            <button
              type="button"
              onClick={close}
              className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Image area */}
          <div className="relative flex-1">
            {/* Backdrop — click to close */}
            <button
              type="button"
              className="absolute inset-0"
              onClick={close}
              aria-label="Close lightbox"
            />

            {/* Centered image */}
            <div className="absolute inset-0 flex items-center justify-center px-14 py-2 sm:px-20">
              <div className="relative h-full w-full">
                <Image
                  src={photos[lightboxIndex!]}
                  alt={`${alt} — ${lightboxIndex! + 1} of ${totalCount}`}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  priority
                />
              </div>
            </div>

            {/* Prev / Next arrows */}
            {totalCount > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); prev(); }}
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20"
                  aria-label="Previous photo"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); next(); }}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20"
                  aria-label="Next photo"
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
