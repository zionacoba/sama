/**
 * Send work (typically Resend emails) in bounded-concurrency chunks so we do not
 * blast a large set of requests at once and trip Resend's rate limit (~2 req/s),
 * which silently drops sends at scale.
 *
 * Items are processed in chunks of `chunkSize` (default 4), with a short `delayMs`
 * pause (default 600ms) between chunks. Each chunk uses Promise.allSettled so one
 * failure never aborts the rest. The returned array of settled results is aligned
 * with the input `items` order, so callers can still detect which items succeeded
 * or failed (e.g. mark-notified-on-success, collect failures for admin alerts).
 */
export async function sendInChunks<T, R = void>(
  items: T[],
  sender: (item: T) => Promise<R>,
  opts: { chunkSize?: number; delayMs?: number } = {},
): Promise<PromiseSettledResult<R>[]> {
  const chunkSize = opts.chunkSize ?? 4;
  const delayMs = opts.delayMs ?? 600;

  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.allSettled(chunk.map(sender));
    results.push(...chunkResults);
    if (i + chunkSize < items.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return results;
}
