import * as Sentry from "@sentry/nextjs";

// Next 16 / Turbopack loads the client Sentry init from this file, not reliably
// from sentry.client.config.ts. This is the authoritative client init.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
  environment: process.env.NODE_ENV,
});

// Required by the SDK to instrument client-side router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
