import * as Sentry from "@sentry/nextjs";

export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) {
    Sentry.captureException(new Error("escapeHtml received a nullish argument"), {
      extra: { context: "escape-html-nullish-argument" },
    });
    return "";
  }
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
