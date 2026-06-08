"use client";

import { useTransition } from "react";
import { approveOrganizer } from "@/app/actions/admin";

export function OrganizerApproveButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await approveOrganizer(id);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Approving…" : "Approve"}
    </button>
  );
}
