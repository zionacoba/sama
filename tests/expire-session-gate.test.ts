import { describe, expect, it } from "vitest";
import { ALREADY_EXPIRED_DETAIL, resolveExpireOutcome } from "@/lib/expire-session-gate";

describe("resolveExpireOutcome", () => {
  it("resolves unreachable when PayMongo was never reached", () => {
    expect(resolveExpireOutcome({ kind: "unreachable" })).toEqual({ kind: "unreachable" });
  });

  it("resolves expired on a 200", () => {
    expect(resolveExpireOutcome({ kind: "response", httpStatus: 200, detail: null })).toEqual({ kind: "expired" });
  });

  it("resolves expired on a 200 that also carries a detail: status wins over the sentence", () => {
    expect(
      resolveExpireOutcome({ kind: "response", httpStatus: 200, detail: ALREADY_EXPIRED_DETAIL }),
    ).toEqual({ kind: "expired" });
  });

  it("resolves already-expired on a 400 carrying the exact detail", () => {
    expect(
      resolveExpireOutcome({ kind: "response", httpStatus: 400, detail: ALREADY_EXPIRED_DETAIL }),
    ).toEqual({ kind: "already-expired" });
  });

  it("resolves refused on a 400 whose detail is reworded", () => {
    expect(
      resolveExpireOutcome({ kind: "response", httpStatus: 400, detail: "This checkout session has already expired." }),
    ).toEqual({ kind: "refused" });
  });

  it("resolves refused when the detail differs only in case", () => {
    expect(
      resolveExpireOutcome({ kind: "response", httpStatus: 400, detail: "checkout session is already expired" }),
    ).toEqual({ kind: "refused" });
  });

  it("resolves refused when the detail differs only by surrounding whitespace", () => {
    expect(
      resolveExpireOutcome({ kind: "response", httpStatus: 400, detail: ` ${ALREADY_EXPIRED_DETAIL} ` }),
    ).toEqual({ kind: "refused" });
  });

  it("resolves refused when the detail merely contains the sentence", () => {
    expect(
      resolveExpireOutcome({ kind: "response", httpStatus: 400, detail: `Error: ${ALREADY_EXPIRED_DETAIL}` }),
    ).toEqual({ kind: "refused" });
  });

  it("resolves refused on a 400 with a null detail", () => {
    expect(resolveExpireOutcome({ kind: "response", httpStatus: 400, detail: null })).toEqual({ kind: "refused" });
  });

  it("resolves refused on a 500", () => {
    expect(resolveExpireOutcome({ kind: "response", httpStatus: 500, detail: null })).toEqual({ kind: "refused" });
  });

  it("matches the already-expired sentence regardless of the status code carrying it", () => {
    expect(
      resolveExpireOutcome({ kind: "response", httpStatus: 422, detail: ALREADY_EXPIRED_DETAIL }),
    ).toEqual({ kind: "already-expired" });
  });
});
