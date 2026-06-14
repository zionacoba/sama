// TEMPORARY Sentry verification page — DELETE after confirming capture works.
"use client";

import * as Sentry from "@sentry/nextjs";

export default function SentryTestPage() {
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: "bold" }}>Sentry client test</h1>
      <p style={{ marginTop: "0.5rem", color: "#57534e" }}>
        Temporary page. Click the button to send a manual client event and throw an error.
      </p>
      <button
        onClick={() => {
          // 1. Manual client-side capture.
          Sentry.captureException(new Error(`Sentry manual client test ${Date.now()}`));
          // 2. Throw in an event handler to exercise client error capture.
          throw new Error(`Sentry client test throw ${Date.now()}`);
        }}
        style={{
          marginTop: "1.5rem",
          padding: "0.625rem 1.25rem",
          borderRadius: "0.5rem",
          background: "#b91c1c",
          color: "white",
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
        }}
      >
        Trigger Sentry test error
      </button>
    </div>
  );
}
