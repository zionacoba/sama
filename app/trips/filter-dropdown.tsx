"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type Option = { value: string; label: string; href: string };

export function FilterDropdown({
  label,
  options,
  selectedValue,
  defaultValue = "All",
}: {
  label: string;
  options: Option[];
  selectedValue: string;
  defaultValue?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const isActive = selectedValue !== defaultValue;
  const selected = options.find((o) => o.value === selectedValue);
  const buttonText = isActive && selected ? `${label}: ${selected.label}` : label;

  // Close on outside click and Escape while the menu is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Move focus into the menu (selected item, or first) when it opens.
  useEffect(() => {
    if (!open) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']");
    if (!items || items.length === 0) return;
    const selectedIdx = options.findIndex((o) => o.value === selectedValue);
    items[selectedIdx >= 0 ? selectedIdx : 0].focus();
  }, [open, options, selectedValue]);

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`inline-flex min-h-[38px] w-full items-center justify-between gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead focus-visible:ring-offset-2 sm:w-auto ${
          isActive
            ? "border-trailhead bg-trailhead/10 text-trailhead"
            : "border-stone-200 bg-white text-stone-700 hover:border-trailhead hover:text-trailhead"
        }`}
      >
        <span className="truncate">{buttonText}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""} ${
            isActive ? "text-trailhead" : "text-stone-400"
          }`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
        >
          {options.map((o) => {
            const active = o.value === selectedValue;
            return (
              <Link
                key={o.value}
                href={o.href}
                role="menuitem"
                aria-current={active ? "true" : undefined}
                onClick={() => setOpen(false)}
                className={`flex min-h-[40px] items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trailhead ${
                  active
                    ? "bg-trailhead/10 font-semibold text-trailhead"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                <span>{o.label}</span>
                {active && (
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-trailhead"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.79 2.79 6.8-6.79a1 1 0 011.41 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
