import { afterEach, describe, expect, it, vi } from "vitest";

// _shared/email.ts reads Deno.env at import time. vi.hoisted runs before the
// static import below, so Node gets a stand-in Deno first.
vi.hoisted(() => {
  (globalThis as Record<string, unknown>).Deno = {
    env: { get: (key: string) => (key === "RESEND_API_KEY" ? "re_test_key" : undefined) },
  };
});

import { SEND_TIMEOUT_MS, sendEmail } from "../supabase/functions/_shared/email";

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

function stubFetch(status: number, body: string) {
  const mock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("edge sendEmail (CS-v121 (c))", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves on a 2xx and sends with a timeout signal, the fixed reply-to and the recipient", async () => {
    const mock = stubFetch(200, JSON.stringify({ id: "email_123" }));
    await expect(sendEmail("joiner@example.com", "Hello", "<p>hi</p>")).resolves.toBeUndefined();
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0] as FetchCall;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
    const sent = JSON.parse(String(init?.body));
    expect(sent.to).toBe("joiner@example.com");
    expect(sent.reply_to).toBe("hello@sama.com.ph");
  });

  it("throws only the status and Resend's short code on a refusal, never the raw message", async () => {
    stubFetch(
      429,
      JSON.stringify({ statusCode: 429, name: "rate_limit_exceeded", message: "Too many requests for joiner@example.com" }),
    );
    const err = await sendEmail("joiner@example.com", "Hello", "<p>hi</p>").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Resend error 429 (rate_limit_exceeded)");
    expect((err as Error).message).not.toContain("joiner@example.com");
  });

  it("drops a code that is not a plain snake_case token", async () => {
    stubFetch(422, JSON.stringify({ name: "<script>alert(1)</script>", message: "x" }));
    const err = await sendEmail("joiner@example.com", "Hello", "<p>hi</p>").catch((e: unknown) => e);
    expect((err as Error).message).toBe("Resend error 422");
  });

  it("copes with a non-JSON error body", async () => {
    stubFetch(502, "<html>Bad Gateway</html>");
    const err = await sendEmail("joiner@example.com", "Hello", "<p>hi</p>").catch((e: unknown) => e);
    expect((err as Error).message).toBe("Resend error 502");
    expect(SEND_TIMEOUT_MS).toBe(10_000);
  });
});
