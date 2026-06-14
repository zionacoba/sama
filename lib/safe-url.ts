export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
