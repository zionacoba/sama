import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// sendEmailChecked (lib/send-email.ts) with Resend and Sentry faked. CS-v121 (b):
// a refusal Resend RETURNS must be captured as well as a throw; the call never
// throws; the payload reaches Resend unchanged; and Sentry gets ids only, never
// the recipient address, the subject or Resend's error message.

const { send, capture } = vi.hoisted(() => ({ send: vi.fn(), capture: vi.fn() }));

vi.mock("@/lib/resend", () => ({ resend: { emails: { send } } }));
vi.mock("@sentry/nextjs", () => ({ captureException: capture }));

import { sendEmailChecked } from "@/lib/send-email";

const PAYLOAD = {
  from: "Sama <from@example.invalid>",
  to: "maria.santos@example.invalid",
  replyTo: "reply@example.invalid",
  subject: "Your booking for Maria Santos is confirmed",
  html: "<p>x</p>",
};
const IDS = { bookingId: 169, tripId: 78 };

beforeEach(() => {
  send.mockReset();
  capture.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendEmailChecked", () => {
  it("returns false and captures a refusal Resend returns, with ids only", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid to field: maria.santos@example.invalid", statusCode: 422 },
    });

    await expect(sendEmailChecked("test-site", IDS, PAYLOAD)).resolves.toBe(false);

    expect(capture).toHaveBeenCalledTimes(1);
    const [err, ctx] = capture.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Resend refused email (test-site): validation_error");
    expect(ctx.extra).toEqual({
      bookingId: 169,
      tripId: 78,
      context: "email-send-failed",
      site: "test-site",
      resendErrorName: "validation_error",
      statusCode: 422,
    });
    expect(JSON.stringify(capture.mock.calls).toLowerCase()).not.toContain("maria");
  });

  it("returns false and captures a thrown send with ids only, and never throws", async () => {
    send.mockRejectedValue(new Error("network down"));

    await expect(sendEmailChecked("test-site", IDS, PAYLOAD)).resolves.toBe(false);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1].extra).toEqual({ bookingId: 169, tripId: 78, context: "email-send-failed", site: "test-site" });
    expect(JSON.stringify(capture.mock.calls).toLowerCase()).not.toContain("maria");
  });

  it("returns true, passes the payload through unchanged and captures nothing on success", async () => {
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });

    await expect(sendEmailChecked("test-site", IDS, PAYLOAD)).resolves.toBe(true);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(PAYLOAD);
    expect(capture).not.toHaveBeenCalled();
  });

  it("never lets an id replace the fixed Sentry keys", async () => {
    send.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", message: "Too many requests", statusCode: 429 } });

    await sendEmailChecked("real-site", { context: "spoofed", site: "spoofed", bookingId: 1 }, PAYLOAD);

    const extra = capture.mock.calls[0][1].extra;
    expect(extra.context).toBe("email-send-failed");
    expect(extra.site).toBe("real-site");
    expect(extra.bookingId).toBe(1);
  });
});
