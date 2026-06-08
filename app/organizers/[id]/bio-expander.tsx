"use client";

import { useState } from "react";

export function BioExpander({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = bio.slice(0, 200);
  const needsTruncation = bio.length > 200;

  return (
    <p className="mt-4 text-sm leading-relaxed text-stone-600">
      {needsTruncation && !expanded ? (
        <>
          {truncated}
          {"…"}
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-1 font-medium text-trailhead underline-offset-2 hover:underline"
          >
            Read more
          </button>
        </>
      ) : (
        bio
      )}
    </p>
  );
}
