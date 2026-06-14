const TZ = "Asia/Manila";

const PESO_FORMATTER = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

/**
 * Canonical peso formatter. Whole pesos (no centavos), matching the dominant
 * convention across the app. Use this everywhere a PHP amount is displayed so
 * screens never drift between centavos and whole pesos again.
 */
export function formatPeso(amount: number): string {
  return PESO_FORMATTER.format(amount);
}

/**
 * Canonical booking reference: the booking id rendered as an 8-character,
 * zero-padded, uppercase hex string (e.g. 0000002A).
 */
export function formatBookingRef(id: number | bigint): string {
  return id.toString(16).toUpperCase().slice(-8).padStart(8, "0");
}

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
