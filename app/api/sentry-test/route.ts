// TEMPORARY Sentry verification endpoint — DELETE after confirming capture works.
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

export async function GET() {
  // 1. Manual server-side capture. Flush to ensure it is sent before the throw.
  Sentry.captureException(new Error(`Sentry manual server test ${Date.now()}`));
  await Sentry.flush(2000);

  // 2. Automatic capture via the onRequestError hook in instrumentation.ts.
  throw new Error(`Sentry server test throw ${Date.now()}`);
}
