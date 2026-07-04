import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Baseline Content-Security-Policy. Origins below were derived from what the
// browser actually reaches at runtime:
//   - 'self'                      first-party assets, API routes, server actions
//   - *.supabase.co (https/wss)   auth + storage + realtime (lib/supabase-browser.ts)
//   - images.unsplash.com         next/image remotePattern (next.config images)
//   - *.ingest.sentry.io          client error reporting (instrumentation-client.ts)
//   - va.vercel-scripts.com       Vercel Analytics script/beacon (app/layout.tsx)
// PayMongo is NOT listed: checkout is a full top-level navigation
// (window.location.href = checkoutUrl), never embedded or fetched from the page.
// Fonts are self-hosted by next/font/google at build time, so no Google Fonts origin.
//
// NOTE: 'unsafe-inline' is required in script-src because the Next.js App Router
// emits inline hydration scripts and we do not (yet) use a nonce middleware.
// This policy is ENFORCED (Content-Security-Policy): violations are blocked, not
// just reported. No report-uri/report-to sink is wired up yet, so violations
// surface only in the browser console; add a sink before changing directives.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://images.unsplash.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://va.vercel-scripts.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // Enforced: violations are blocked (see note above).
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 2592000,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // Security headers apply to every route.
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        source: "/trips",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=60, stale-while-revalidate=300",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
