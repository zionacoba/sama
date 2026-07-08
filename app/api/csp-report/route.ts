import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Public CSP violation report sink.
 *
 * Named by the CSP `report-uri`/`report-to` directives in next.config.ts, this
 * route receives violation reports the browser POSTs when the enforced policy
 * blocks something. It is UNAUTHENTICATED by necessity: browsers send these
 * reports with no bearer token, so there is nothing to authenticate against.
 *
 * Because it is public, it is size-capped (64KB) and only forwards a bounded
 * set of known fields to Sentry - it never dumps the raw body - so a flood of
 * junk reports can neither exhaust memory nor bloat Sentry payloads. It never
 * throws to the client; a Sentry hiccup still returns a normal response.
 *
 * Two content types arrive here:
 *   - application/csp-report      (legacy report-uri) body: { "csp-report": {...} }
 *   - application/reports+json    (modern report-to)  body: [ { type, body: {...} }, ... ]
 * Both are normalized to a flat list of violation objects.
 */

const MAX_BODY_BYTES = 64 * 1024; // 64KB abuse cap
const MAX_FIELD_CHARS = 500; // per-field truncation to bound Sentry payload

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > MAX_FIELD_CHARS ? value.slice(0, MAX_FIELD_CHARS) : value;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// Pull the useful, bounded fields out of one violation object. Handles both the
// hyphenated keys (legacy report-uri) and the camelCase keys (report-to body).
function selectFields(v: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    context: "csp-report",
    blockedURI: str(v["blocked-uri"] ?? v.blockedURI),
    violatedDirective: str(v["violated-directive"] ?? v.violatedDirective),
    effectiveDirective: str(v["effective-directive"] ?? v.effectiveDirective),
    documentURI: str(v["document-uri"] ?? v.documentURI),
    disposition: str(v.disposition),
    sourceFile: str(v["source-file"] ?? v.sourceFile),
    lineNumber: num(v["line-number"] ?? v.lineNumber),
  };
  // Drop undefined keys so Sentry extra stays clean.
  for (const key of Object.keys(fields)) {
    if (fields[key] === undefined) delete fields[key];
  }
  return fields;
}

// Normalize either content-type shape into a flat list of violation objects.
function normalize(parsed: unknown): Record<string, unknown>[] {
  // Modern report-to: an array of { type, body } report objects.
  if (Array.isArray(parsed)) {
    return parsed
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r) => (typeof r.body === "object" && r.body !== null ? r.body : r))
      .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null);
  }
  // Legacy report-uri: a single { "csp-report": {...} } object.
  if (typeof parsed === "object" && parsed !== null) {
    const report = (parsed as Record<string, unknown>)["csp-report"];
    if (typeof report === "object" && report !== null) {
      return [report as Record<string, unknown>];
    }
  }
  return [];
}

export async function POST(req: NextRequest) {
  // Abuse guard: reject oversized reports by declared length before reading.
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  // Read the raw body defensively and enforce the cap again on actual size, in
  // case content-length was absent or lied.
  let text: string;
  try {
    text = await req.text();
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  // Parse quietly: bad/empty bodies get a silent 204 so we never amplify junk.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const violations = normalize(parsed);

  for (const violation of violations) {
    try {
      Sentry.captureMessage("CSP violation", {
        level: "warning",
        extra: selectFields(violation),
      });
    } catch {
      // A Sentry hiccup must not turn into a client error; drop and continue.
    }
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
