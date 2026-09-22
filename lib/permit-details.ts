/**
 * Validate the four permit fields a hiking permit needs from each participant.
 *
 * Both the /join participant form (`confirmParticipant`) and `createBooking`
 * run every submission through this one function, so the rules — the required
 * four, the 18-to-120 integer age, the exact `male`/`female` sex values, the
 * Philippine phone shape — and the exact error strings shown to a participant
 * cannot drift apart between the two entry points. Add or change a rule here
 * and both paths move together.
 */

export type PermitDetailsInput = {
  age: string | null | undefined;
  sex: string | null | undefined;
  homeAddress: string | null | undefined;
  phone: string | null | undefined;
};

export type PermitDetails = {
  age: number;
  sex: "male" | "female";
  home_address: string;
  phone: string;
};

export function validatePermitDetails(
  input: PermitDetailsInput,
): { ok: true; value: PermitDetails } | { ok: false; error: string } {
  const age = input.age?.trim();
  const sex = input.sex?.trim();
  const homeAddress = input.homeAddress?.trim();
  const phone = input.phone?.trim();

  if (!age || !sex || !homeAddress || !phone) {
    return { ok: false, error: "Please fill in the permit details." };
  }

  const ageValue = Number(age);
  if (!Number.isInteger(ageValue) || ageValue < 18 || ageValue > 120) {
    return { ok: false, error: "Please enter your age on the trip date (18 or older)." };
  }

  if (sex !== "male" && sex !== "female") {
    return { ok: false, error: "Please choose Male or Female." };
  }

  if (!/^(\+63|0)\d{9,10}$/.test(phone.replace(/\s/g, ""))) {
    return { ok: false, error: "Please enter a valid Philippine phone number (09XX or +63)." };
  }

  return {
    ok: true,
    value: { age: ageValue, sex, home_address: homeAddress, phone },
  };
}
