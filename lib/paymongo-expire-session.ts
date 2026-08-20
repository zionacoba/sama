export type ExpireSessionResult =
  | { kind: "response"; httpStatus: number; detail: string | null }
  | { kind: "unreachable" };

/**
 * Ask PayMongo to expire a checkout session so its hosted payment page can no
 * longer be paid. Called on the cleanup path immediately before an abandoned
 * booking is cancelled, closing the window where a participant pays a page for
 * a booking that no longer exists.
 *
 * This function NEVER throws, and that is deliberate: it differs from
 * fetchPaymongoCheckoutPayment, which throws so its callers fail safe. A throw
 * here would land in the reconcile route's enclosing catch and start the
 * strand-escalation clock on a booking whose payment status was already
 * definitively established. So a missing secret key, a thrown fetch, and an
 * unparseable body all collapse into "unreachable" and the caller decides.
 *
 * On a readable response the FIRST error's detail is returned verbatim, since
 * that sentence is the only thing that distinguishes an already-expired session
 * from a genuine refusal. The accompanying `code` is a generic bucket that
 * discriminates nothing, so it is never read. The secret key is never logged or
 * returned.
 */
export async function expireCheckoutSession(sessionId: string): Promise<ExpireSessionResult> {
  try {
    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    if (!secretKey) {
      return { kind: "unreachable" };
    }
    const auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
    const res = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}/expire`, {
      method: "POST",
      headers: { Authorization: auth, Accept: "application/json" },
    });
    const data = await res.json();
    const errors = data?.errors as Array<Record<string, unknown>> | undefined;
    const firstDetail = errors?.[0]?.detail;
    return {
      kind: "response",
      httpStatus: res.status,
      detail: typeof firstDetail === "string" ? firstDetail : null,
    };
  } catch {
    return { kind: "unreachable" };
  }
}
