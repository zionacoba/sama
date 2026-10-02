import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// sendAdminAlert (lib/admin-alert.ts) with Resend and Sentry faked. The Resend
// SDK reports a refused send by RETURNING { error } rather than throwing, so a
// refusal must be captured as well as a throw; and Sentry must never receive
// the subject, which can carry a person's name.

const { send, capture } = vi.hoisted(() => ({ send: vi.fn(), capture: vi.fn() }));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send } },
  FROM_ADDRESS: "Sama <from@example.invalid>",
  REPLY_TO_ADDRESS: "reply@example.invalid",
}));
vi.mock("@sentry/nextjs", () => ({ captureException: capture }));

const SUBJECT = "[Admin] Booking for Maria Santos needs review";

// ADMIN_EMAIL is read once at module load, so each test loads a fresh copy.
async function load(adminEmail: string) {
  vi.stubEnv("ADMIN_EMAIL", adminEmail);
  vi.resetModules();
  return (await import("@/lib/admin-alert")).sendAdminAlert;
}

beforeEach(() => {
  send.mockReset();
  capture.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendAdminAlert", () => {
  it("captures a refusal Resend returns, without the subject", async () => {
    send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Invalid from field", statusCode: 422 },
    });
    const sendAdminAlert = await load("admin@example.invalid");

    await expect(sendAdminAlert(SUBJECT, "<p>x</p>")).resolves.toBeUndefined();

    expect(capture).toHaveBeenCalledTimes(1);
    const [err, ctx] = capture.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("Resend refused admin alert: validation_error: Invalid from field");
    expect(ctx.extra.context).toBe("admin-alert-send-failed");
    expect(ctx.extra.resendErrorName).toBe("validation_error");
    expect(ctx.extra.statusCode).toBe(422);
    expect(JSON.stringify(capture.mock.calls)).not.toContain("Maria");
  });

  it("captures a thrown send without the subject, and never throws", async () => {
    send.mockRejectedValue(new Error("network down"));
    const sendAdminAlert = await load("admin@example.invalid");

    await expect(sendAdminAlert(SUBJECT, "<p>x</p>")).resolves.toBeUndefined();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1].extra.context).toBe("admin-alert-send-failed");
    expect(JSON.stringify(capture.mock.calls)).not.toContain("Maria");
  });

  it("captures nothing when the send succeeds", async () => {
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    const sendAdminAlert = await load("admin@example.invalid");

    await sendAdminAlert(SUBJECT, "<p>x</p>");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "admin@example.invalid", subject: SUBJECT });
    expect(capture).not.toHaveBeenCalled();
  });

  it("sends nothing when ADMIN_EMAIL is unset", async () => {
    const sendAdminAlert = await load("");

    await sendAdminAlert(SUBJECT, "<p>x</p>");

    expect(send).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
