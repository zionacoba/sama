const TZ = "Asia/Manila";

export function formatDate(dateStart: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: TZ,
  }).format(new Date(dateStart));
}

export function formatDateShort(dateStart: string) {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(dateStart));
}

export function formatDateRange(dateStart: string, dateEnd?: string | null) {
  if (!dateEnd) return formatDateShort(dateStart);
  return `${formatDateShort(dateStart)} – ${formatDateShort(dateEnd)}`;
}

export function formatReviewDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TZ,
  }).format(new Date(date));
}
