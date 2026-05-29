"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/actions/profile";

const CONFIRM_WORD = "DELETE";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setTyped("");
    setError(null);
    setOpen(true);
  }

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    setTyped("");
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAccount();
      if ("error" in result) {
        setError(result.error);
      } else {
        // Session is cleared server-side; navigate home.
        window.location.href = "/";
      }
    });
  }

  const canConfirm = typed === CONFIRM_WORD;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50"
      >
        Delete my account
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xl" aria-hidden>⚠️</span>
              <div>
                <h2 className="text-base font-bold text-stone-900">Delete your account</h2>
                <p className="mt-1 text-sm text-stone-600">
                  This is permanent and cannot be undone. Your account and personal data will be deleted. Booking history will be anonymized and retained for legal purposes.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium text-stone-700">
                Type <strong className="font-mono tracking-wider text-red-600">DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                spellCheck={false}
                disabled={isPending}
                className="mt-1.5 w-full rounded-xl border border-stone-200 px-3 py-2.5 font-mono text-sm text-stone-900 placeholder:text-stone-300 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:opacity-60"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-900 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm || isPending}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
