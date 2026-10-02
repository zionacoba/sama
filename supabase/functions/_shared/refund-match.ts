// Shared, dependency-free refund-matching logic for the retry-failed-refunds edge
// function (CP-v120). Kept free of Deno and Node globals so the edge function can
// import it (`../_shared/refund-match.ts`) and the vitest suite (Node) can import
// it by relative path and unit-test the rule.
//
// Several refunds can exist on one PayMongo payment (one per cancellation), so a
// retry may treat a listed refund as its own only when no other refunds row has
// claimed it and its amount is exactly the row's. If any live listed refund has an
// id or amount that cannot be read, the row is held for a human: issuing could pay
// twice, and reconciling could claim a refund that belongs to another row.

export type RetryDecision =
  | { kind: "reconcile"; refundId: string }
  | { kind: "issue" }
  | { kind: "hold"; reason: string };

type ListedRefund =
  | { id?: unknown; attributes?: { status?: unknown; amount?: unknown } | null }
  | null
  | undefined;

// Same rule the cron used before: anything not explicitly "failed" is live,
// including an entry with no status at all.
function isLive(entry: ListedRefund): boolean {
  return (entry?.attributes?.status ?? "") !== "failed";
}

function readableId(entry: ListedRefund): string | null {
  const id = entry?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

// PayMongo amounts are whole centavos (100 = PHP 1.00).
function readableAmount(entry: ListedRefund): number | null {
  const amount = entry?.attributes?.amount;
  return typeof amount === "number" && Number.isInteger(amount) && amount > 0 ? amount : null;
}

/** The ids of every live (not failed) listed refund whose id can be read. */
export function liveRefundIds(refunds: unknown): string[] {
  if (!Array.isArray(refunds)) return [];
  const ids: string[] = [];
  for (const entry of refunds as ListedRefund[]) {
    if (!isLive(entry)) continue;
    const id = readableId(entry);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/**
 * Decide what the retry job does with one owed/failed refunds row.
 *
 * @param rowAmountCentavos the row's amount in centavos, Math.round(amount * 100)
 * @param refunds the payment's `attributes.refunds` exactly as PayMongo returned it
 * @param claimedIds refund ids already held (paymongo_refund_id) by OTHER refunds rows
 */
export function decideRetryAction(
  rowAmountCentavos: number,
  refunds: unknown,
  claimedIds: ReadonlySet<string>,
): RetryDecision {
  if (refunds == null) return { kind: "issue" };
  if (!Array.isArray(refunds)) {
    return { kind: "hold", reason: "PayMongo's refund list for this payment is not a list" };
  }
  const live = (refunds as ListedRefund[]).filter(isLive);
  for (const entry of live) {
    const id = readableId(entry);
    if (id === null) {
      return { kind: "hold", reason: "a refund listed on this payment has no readable id" };
    }
    if (readableAmount(entry) === null) {
      return { kind: "hold", reason: `refund ${id} listed on this payment has no readable amount` };
    }
  }
  for (const entry of live) {
    const id = readableId(entry) as string;
    if (claimedIds.has(id)) continue;
    if (readableAmount(entry) === rowAmountCentavos) return { kind: "reconcile", refundId: id };
  }
  return { kind: "issue" };
}
