"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "sans-serif", backgroundColor: "#fafaf9", color: "#1c1917" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "3rem" }}>⚠️</p>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginTop: "1rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#57534e", marginTop: "0.5rem" }}>
            Please try again or go back home.
          </p>
          <div style={{ marginTop: "2rem", display: "flex", gap: "0.75rem" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.75rem",
                border: "1px solid #e7e5e4",
                background: "white",
                fontWeight: "600",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "0.625rem 1.25rem",
                borderRadius: "0.75rem",
                background: "#4a7c59",
                color: "white",
                fontWeight: "600",
                textDecoration: "none",
                fontSize: "0.875rem",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
