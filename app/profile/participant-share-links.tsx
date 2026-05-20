"use client";

import { useState } from "react";

type Participant = { slotNumber: number; token: string };

export function ParticipantShareLinks({ participants }: { participants: Participant[] }) {
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (participants.length === 0) return null;

  function copy(token: string) {
    navigator.clipboard.writeText(`https://landas-zeta.vercel.app/join/${token}`).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs font-semibold text-amber-800">
        Pending participant confirmations
      </p>
      <ul className="mt-2 space-y-2">
        {participants.map(({ slotNumber, token }) => (
          <li key={token} className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-stone-700">
              Participant {slotNumber + 1}
            </span>
            <button
              type="button"
              onClick={() => copy(token)}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-trailhead hover:text-trailhead"
            >
              {copiedToken === token ? "Copied!" : "Copy link"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
