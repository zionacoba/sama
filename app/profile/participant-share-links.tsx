"use client";

import { useState } from "react";

type Participant = { slotNumber: number; token: string };

export function ParticipantShareLinks({ participants }: { participants: Participant[] }) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (participants.length === 0) return null;

  function copy(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/join/${token}`).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="text-xs font-semibold text-amber-800">Pending confirmations</p>
      <ul className="mt-1.5 space-y-1.5">
        {participants.map(({ slotNumber, token }) => (
          <li key={token} className="flex items-center justify-between gap-2">
            <span className="text-xs text-stone-600">Participant {slotNumber + 1}</span>
            <button
              type="button"
              onClick={() => copy(token)}
              className="shrink-0 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
            >
              {copiedToken === token ? "Copied!" : "Copy link"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
