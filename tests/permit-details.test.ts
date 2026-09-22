import { describe, expect, it } from "vitest";
import { validatePermitDetails } from "@/lib/permit-details";

const valid = {
  age: "34",
  sex: "male",
  homeAddress: "12 Kanlaon St, Quezon City",
  phone: "09171234567",
};

describe("validatePermitDetails", () => {
  it("accepts a fully valid submission", () => {
    expect(validatePermitDetails(valid)).toEqual({
      ok: true,
      value: {
        age: 34,
        sex: "male",
        home_address: "12 Kanlaon St, Quezon City",
        phone: "09171234567",
      },
    });
  });

  it("rejects an empty age", () => {
    expect(validatePermitDetails({ ...valid, age: "" })).toEqual({
      ok: false,
      error: "Please fill in the permit details.",
    });
  });

  it("rejects an empty sex", () => {
    expect(validatePermitDetails({ ...valid, sex: "" })).toEqual({
      ok: false,
      error: "Please fill in the permit details.",
    });
  });

  it("rejects an empty home address", () => {
    expect(validatePermitDetails({ ...valid, homeAddress: "   " })).toEqual({
      ok: false,
      error: "Please fill in the permit details.",
    });
  });

  it("rejects an empty phone", () => {
    expect(validatePermitDetails({ ...valid, phone: null })).toEqual({
      ok: false,
      error: "Please fill in the permit details.",
    });
  });

  it("rejects a participant under 18", () => {
    expect(validatePermitDetails({ ...valid, age: "17" })).toEqual({
      ok: false,
      error: "Please enter your age on the trip date (18 or older).",
    });
  });

  it("accepts exactly 18", () => {
    const result = validatePermitDetails({ ...valid, age: "18" });
    expect(result).toMatchObject({ ok: true, value: { age: 18 } });
  });

  it("accepts exactly 120", () => {
    const result = validatePermitDetails({ ...valid, age: "120" });
    expect(result).toMatchObject({ ok: true, value: { age: 120 } });
  });

  it("rejects an age above 120", () => {
    expect(validatePermitDetails({ ...valid, age: "121" })).toEqual({
      ok: false,
      error: "Please enter your age on the trip date (18 or older).",
    });
  });

  it("rejects a fractional age", () => {
    expect(validatePermitDetails({ ...valid, age: "18.5" })).toEqual({
      ok: false,
      error: "Please enter your age on the trip date (18 or older).",
    });
  });

  it("rejects an age that is not a number", () => {
    expect(validatePermitDetails({ ...valid, age: "abc" })).toEqual({
      ok: false,
      error: "Please enter your age on the trip date (18 or older).",
    });
  });

  it("rejects a capitalised sex — the stored values are lowercase", () => {
    expect(validatePermitDetails({ ...valid, sex: "Male" })).toEqual({
      ok: false,
      error: "Please choose Male or Female.",
    });
  });

  it("rejects a sex outside the permit's two values", () => {
    expect(validatePermitDetails({ ...valid, sex: "other" })).toEqual({
      ok: false,
      error: "Please choose Male or Female.",
    });
  });

  it("accepts a spaced 09XX phone number", () => {
    const result = validatePermitDetails({ ...valid, phone: "0917 123 4567" });
    expect(result).toMatchObject({ ok: true, value: { phone: "0917 123 4567" } });
  });

  it("accepts a +63 phone number", () => {
    const result = validatePermitDetails({ ...valid, phone: "+639171234567" });
    expect(result).toMatchObject({ ok: true, value: { phone: "+639171234567" } });
  });

  it("rejects a phone number that is not Philippine", () => {
    expect(validatePermitDetails({ ...valid, phone: "12345" })).toEqual({
      ok: false,
      error: "Please enter a valid Philippine phone number (09XX or +63).",
    });
  });

  it("trims the values it returns", () => {
    expect(
      validatePermitDetails({
        age: " 34 ",
        sex: " male ",
        homeAddress: "  12 Kanlaon St, Quezon City  ",
        phone: "  09171234567  ",
      }),
    ).toEqual({
      ok: true,
      value: {
        age: 34,
        sex: "male",
        home_address: "12 Kanlaon St, Quezon City",
        phone: "09171234567",
      },
    });
  });
});
