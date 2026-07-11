// Application-layer commission bounds. The DB CHECK constraint
// organizers_commission_rate_bounds (0 to 0.20) stays wider on purpose as a
// defense-in-depth backstop; these constants are the operative policy.
export const COMMISSION_RATE_MIN_PERCENT = 1;
export const COMMISSION_RATE_MAX_PERCENT = 10;

// Stored as a decimal rate (0.05 = 5%), matching organizers.commission_rate.
export const DEFAULT_COMMISSION_RATE = 0.05;

/**
 * Parse a commission rate expressed in whole-percent units (e.g. 4 means 4%).
 *
 * Accepts finite numbers and non-empty numeric strings (form values arrive as
 * strings). Everything else (null, undefined, empty or non-numeric strings,
 * booleans, objects, NaN, Infinity) returns null, as does any value outside
 * [COMMISSION_RATE_MIN_PERCENT, COMMISSION_RATE_MAX_PERCENT]. Decimal percents
 * inside the bounds (e.g. 7.5) are accepted and returned unchanged.
 */
export function parseCommissionRatePercent(raw: unknown): number | null {
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string" && raw.trim() !== "") {
    value = Number(raw);
  } else {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  if (value < COMMISSION_RATE_MIN_PERCENT || value > COMMISSION_RATE_MAX_PERCENT) return null;
  return value;
}
