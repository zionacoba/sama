import { describe, expect, it } from "vitest";
import { isTripInPast, resolvePastTripGate } from "@/lib/past-trip-gate";

const TODAY = "2026-07-17";

describe("resolvePastTripGate", () => {
  it("fails with fetch-error when the trip fetch errored", () => {
    expect(resolvePastTripGate(null, { message: "boom" }, TODAY)).toEqual({ failure: "fetch-error" });
  });

  it("fails with fetch-error even if a valid trip row is present alongside the error", () => {
    expect(resolvePastTripGate({ date_start: "2026-08-01" }, { message: "boom" }, TODAY)).toEqual({ failure: "fetch-error" });
  });

  it("fails with missing-data when the trip row is null and there is no error", () => {
    expect(resolvePastTripGate(null, null, TODAY)).toEqual({ failure: "missing-data" });
  });

  it("fails with missing-data when the trip row is undefined and there is no error", () => {
    expect(resolvePastTripGate(undefined, null, TODAY)).toEqual({ failure: "missing-data" });
  });

  it("fails with trip-in-past when date_start is strictly before todayPH", () => {
    expect(resolvePastTripGate({ date_start: "2026-07-16" }, null, TODAY)).toEqual({ failure: "trip-in-past" });
  });

  it("passes a trip whose date_start is strictly after todayPH", () => {
    expect(resolvePastTripGate({ date_start: "2026-07-18" }, null, TODAY)).toEqual({ trip: { date_start: "2026-07-18" } });
  });

  it("passes a trip happening today: date_start equal to todayPH is not past", () => {
    expect(resolvePastTripGate({ date_start: TODAY }, null, TODAY)).toEqual({ trip: { date_start: TODAY } });
  });

  it("preserves extra columns on the returned row", () => {
    const row = {
      date_start: "2026-08-01",
      slug: "mt-pulag",
      title: "Mt. Pulag",
      organizer_id: "org-1",
      cancellation_policy: "flexible",
    };
    const result = resolvePastTripGate(row, null, TODAY);
    expect(result).toEqual({ trip: row });
    if ("trip" in result) {
      expect(result.trip.slug).toBe("mt-pulag");
      expect(result.trip.cancellation_policy).toBe("flexible");
    }
  });
});

describe("isTripInPast", () => {
  it("is true for a start date before today", () => {
    expect(isTripInPast("2026-07-16", TODAY)).toBe(true);
  });

  it("is false for a trip starting today: strictly before, never on", () => {
    expect(isTripInPast(TODAY, TODAY)).toBe(false);
  });

  it("is false for a start date after today", () => {
    expect(isTripInPast("2026-07-18", TODAY)).toBe(false);
  });

  it("keeps past trips out of a rejected organizer's cascade, the way rejectOrganizer filters", () => {
    const active = [
      { id: "ran-last-month", date_start: "2026-06-20" },
      { id: "starts-today", date_start: TODAY },
      { id: "december", date_start: "2026-12-05" },
    ];
    const tripIds = active.filter((t) => !isTripInPast(t.date_start, TODAY)).map((t) => t.id);
    expect(tripIds).toEqual(["starts-today", "december"]);
  });
});
