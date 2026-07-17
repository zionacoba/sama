import { describe, expect, it } from "vitest";
import { resolveOrganizerTripGate, resolveUpcomingBookingGate } from "@/lib/delete-account-gate";

const NOW = "2026-07-17T00:00:00.000Z";

const booking = (dateStart: string) => ({ trip: { date_start: dateStart } });

describe("resolveUpcomingBookingGate", () => {
  it("fails with fetch-error when the fetch errored, even with a valid upcoming booking present", () => {
    expect(resolveUpcomingBookingGate([booking("2026-08-01T00:00:00.000Z")], { message: "boom" }, NOW)).toEqual({
      failure: "fetch-error",
    });
  });

  it("fails with fetch-error when bookings is null and there is no error", () => {
    expect(resolveUpcomingBookingGate(null, null, NOW)).toEqual({ failure: "fetch-error" });
  });

  it("passes an empty bookings list", () => {
    expect(resolveUpcomingBookingGate([], null, NOW)).toEqual({ ok: true });
  });

  it("passes when every booking's trip is in the past", () => {
    expect(
      resolveUpcomingBookingGate([booking("2026-06-01T00:00:00.000Z"), booking("2026-07-16T00:00:00.000Z")], null, NOW),
    ).toEqual({ ok: true });
  });

  it("blocks on a single upcoming booking", () => {
    expect(resolveUpcomingBookingGate([booking("2026-08-01T00:00:00.000Z")], null, NOW)).toEqual({
      blocked: "upcoming-bookings",
    });
  });

  it("ignores bookings whose trip is null", () => {
    expect(resolveUpcomingBookingGate([{ trip: null }, { trip: null }], null, NOW)).toEqual({ ok: true });
  });

  it("passes on the boundary: date_start exactly equal to nowIso is not upcoming", () => {
    expect(resolveUpcomingBookingGate([booking(NOW)], null, NOW)).toEqual({ ok: true });
  });

  it("blocks when past and upcoming bookings are mixed", () => {
    expect(
      resolveUpcomingBookingGate([booking("2026-06-01T00:00:00.000Z"), booking("2026-08-01T00:00:00.000Z")], null, NOW),
    ).toEqual({ blocked: "upcoming-bookings" });
  });
});

describe("resolveOrganizerTripGate", () => {
  it("fails with fetch-error when the organizer fetch errored, even with an organizer row present", () => {
    expect(resolveOrganizerTripGate({ message: "boom" }, { id: "org-1" }, null, 0)).toEqual({
      failure: "fetch-error",
    });
  });

  it("passes when the user is not an organizer (null row, no error)", () => {
    expect(resolveOrganizerTripGate(null, null, null, null)).toEqual({ ok: true });
  });

  it("fails with fetch-error when the active trips count fetch errored", () => {
    expect(resolveOrganizerTripGate(null, { id: "org-1" }, { message: "boom" }, null)).toEqual({
      failure: "fetch-error",
    });
  });

  it("fails with fetch-error when the active trips count is null without an error", () => {
    expect(resolveOrganizerTripGate(null, { id: "org-1" }, null, null)).toEqual({ failure: "fetch-error" });
  });

  it("passes an organizer with zero active trips", () => {
    expect(resolveOrganizerTripGate(null, { id: "org-1" }, null, 0)).toEqual({ ok: true });
  });

  it("blocks an organizer with active trips", () => {
    expect(resolveOrganizerTripGate(null, { id: "org-1" }, null, 3)).toEqual({ blocked: "active-trips" });
  });
});
