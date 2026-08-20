export const ALREADY_EXPIRED_DETAIL = "Checkout session is already expired";

export type ExpireOutcome =
  | { kind: "expired" }
  | { kind: "already-expired" }
  | { kind: "refused" }
  | { kind: "unreachable" };

/**
 * Resolve what an expire-checkout-session attempt actually achieved, from the
 * raw result of expireCheckoutSession. Pure: no I/O, so the ordering below is
 * testable on its own.
 *
 * The ordering is load-bearing:
 *
 * "unreachable" is checked first because that result carries no httpStatus and
 * no detail at all. Nothing further can be read from it, and it is a different
 * kind of fact from anything PayMongo said: we never reached PayMongo, so the
 * session's state is unknown rather than refused.
 *
 * httpStatus 200 is checked next, before any reading of detail, because a
 * success is a success no matter what else the body carries. A 200 that also
 * happens to include a detail string must still resolve to "expired", so the
 * status wins over the sentence.
 *
 * The already-expired sentence is checked only after 200, and deliberately
 * WITHOUT looking at httpStatus. PayMongo's status code for this case is not
 * something we want to pin down; the sentence alone identifies it, and matching
 * on the sentence alone keeps the check from breaking if the code moves.
 * Already-expired is an equivalent end state to having just expired it: the
 * page cannot be paid either way, so the caller may proceed.
 *
 * The comparison is exact string equality on the whole detail: no includes, no
 * lowercasing, no trimming, no regex. A reworded message is one we have not
 * verified means what we think it means, so it falls through to "refused" and
 * the caller does less. Doing less is the safe direction here, because refusing
 * to cancel leaves the booking pending for a future cycle, while wrongly
 * reading a refusal as success would cancel a booking whose payment page is
 * still live.
 */
export function resolveExpireOutcome(
  result: { kind: "response"; httpStatus: number; detail: string | null }
        | { kind: "unreachable" },
): ExpireOutcome {
  if (result.kind === "unreachable") return { kind: "unreachable" };
  if (result.httpStatus === 200) return { kind: "expired" };
  if (result.detail === ALREADY_EXPIRED_DETAIL) return { kind: "already-expired" };
  return { kind: "refused" };
}
