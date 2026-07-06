import { describe, expect, it } from "vitest";
import { buildCsvRows, escapeCsv, CSV_HEADERS } from "@/lib/roster-csv";
import type { CsvBooking, CsvParticipant } from "@/lib/roster-csv";

const COL = Object.fromEntries(CSV_HEADERS.map((h, i) => [h, i])) as Record<string, number>;

const baseBooking: CsvBooking = {
  id: 42,
  full_name: "Ana Booker",
  email: "ana@example.com",
  phone: "0917 000 0000",
  slots: 1,
  meeting_point: "SM North EDSA, 5:00 AM",
  emergency_contact_name: "Ben Kin",
  emergency_contact_phone: "0918 111 1111",
  medical_notes: "Asthma",
  status: "confirmed",
  created_at: "2026-07-01T02:00:00.000Z",
};

function participant(overrides: Partial<CsvParticipant> & { slot_number: number }): CsvParticipant {
  return {
    full_name: null,
    completed: false,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    medical_notes: null,
    meeting_point: null,
    ...overrides,
  };
}

describe("buildCsvRows", () => {
  it("emits one row per participant for a fully completed group booking", () => {
    const booking = { ...baseBooking, slots: 3 };
    const rows = buildCsvRows([booking], {
      "42": [
        participant({
          slot_number: 0,
          full_name: "Ana Booker",
          completed: true,
          emergency_contact_name: "Ben Kin",
          emergency_contact_phone: "0918 111 1111",
          medical_notes: "Asthma",
          meeting_point: "SM North EDSA, 5:00 AM",
        }),
        participant({
          slot_number: 1,
          full_name: "Carla Second",
          completed: true,
          emergency_contact_name: "Dana Kin",
          emergency_contact_phone: "0919 222 2222",
          medical_notes: "Peanut allergy",
          meeting_point: "Trinoma, 4:30 AM",
        }),
        participant({
          slot_number: 2,
          full_name: "Egay Third",
          completed: true,
          emergency_contact_name: "Faye Kin",
          emergency_contact_phone: "0920 333 3333",
          medical_notes: "None declared", // free text is fine
        }),
      ],
    });

    expect(rows).toHaveLength(3);

    // Anchor row: booker identity, booking-level email/phone/slots, booking-row medical.
    expect(rows[0][COL["Full name"]]).toBe("Ana Booker");
    expect(rows[0][COL["Email"]]).toBe("ana@example.com");
    expect(rows[0][COL["Slots"]]).toBe("3");
    expect(rows[0][COL["Emergency contact name"]]).toBe("Ben Kin");
    expect(rows[0][COL["Medical notes"]]).toBe("Asthma");

    // Participant rows: own emergency/medical, blank email/phone/slots.
    expect(rows[1][COL["Full name"]]).toBe("Carla Second");
    expect(rows[1][COL["Email"]]).toBe("");
    expect(rows[1][COL["Phone"]]).toBe("");
    expect(rows[1][COL["Slots"]]).toBe("");
    expect(rows[1][COL["Emergency contact name"]]).toBe("Dana Kin");
    expect(rows[1][COL["Emergency contact phone"]]).toBe("0919 222 2222");
    expect(rows[1][COL["Medical notes"]]).toBe("Peanut allergy");
    // Cells containing commas come back CSV-quoted by escapeCsv.
    expect(rows[1][COL["Pickup point"]]).toBe('"Trinoma, 4:30 AM"');
    expect(rows[1][COL["Status"]]).toBe("confirmed");
    expect(rows[2][COL["Full name"]]).toBe("Egay Third");
  });

  it("exports an incomplete /join participant with the Participant N fallback and blank cells", () => {
    const booking = { ...baseBooking, slots: 2 };
    const rows = buildCsvRows([booking], {
      "42": [
        participant({ slot_number: 0, full_name: "Ana Booker", completed: true }),
        participant({ slot_number: 1 }), // /join not completed: all fields null
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[1][COL["Full name"]]).toBe("Participant 2");
    expect(rows[1][COL["Emergency contact name"]]).toBe("");
    expect(rows[1][COL["Emergency contact phone"]]).toBe("");
    expect(rows[1][COL["Medical notes"]]).toBe("");
    expect(rows[1][COL["Pickup point"]]).toBe("");
  });

  it("exports a blank medical cell for a completed participant with no medical notes", () => {
    const booking = { ...baseBooking, slots: 2 };
    const rows = buildCsvRows([booking], {
      "42": [
        participant({ slot_number: 0, full_name: "Ana Booker", completed: true }),
        participant({
          slot_number: 1,
          full_name: "Carla Second",
          completed: true,
          emergency_contact_name: "Dana Kin",
          emergency_contact_phone: "0919 222 2222",
          medical_notes: null,
        }),
      ],
    });

    expect(rows[1][COL["Full name"]]).toBe("Carla Second");
    expect(rows[1][COL["Emergency contact name"]]).toBe("Dana Kin");
    expect(rows[1][COL["Medical notes"]]).toBe("");
  });

  it("never exports the booker's data for a transferred booking with an unsigned replacement", () => {
    const booking = { ...baseBooking, status: "transferred" };
    const rows = buildCsvRows([booking], {
      // Transfer prep repurposed slot 0: cleared PII, completed false.
      "42": [participant({ slot_number: 0 })],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0][COL["Full name"]]).toBe("Awaiting replacement details");
    expect(rows[0][COL["Email"]]).toBe("");
    // The booker's phone is not the attendee's either: same leak class as email.
    expect(rows[0][COL["Phone"]]).toBe("");
    expect(rows[0][COL["Emergency contact name"]]).toBe("Awaiting replacement details");
    expect(rows[0][COL["Emergency contact phone"]]).toBe("Awaiting replacement details");
    // The booker's medical notes must not leak onto the replacement's row.
    expect(rows[0][COL["Medical notes"]]).toBe("");
    // No cell contains the original booker's identity or contacts.
    expect(rows[0]).not.toContain("Ana Booker");
    expect(rows[0]).not.toContain("Ben Kin");
    expect(rows[0]).not.toContain("Asthma");
  });

  it("exports the completed replacement's own data for a transferred booking", () => {
    const booking = { ...baseBooking, status: "transferred" };
    const rows = buildCsvRows([booking], {
      "42": [
        participant({
          slot_number: 0,
          full_name: "Rita Replacement",
          completed: true,
          emergency_contact_name: "Sam Kin",
          emergency_contact_phone: "0921 444 4444",
          medical_notes: "Vegetarian",
          meeting_point: "Trinoma, 4:30 AM",
        }),
      ],
    });

    expect(rows[0][COL["Full name"]]).toBe("Rita Replacement");
    expect(rows[0][COL["Emergency contact name"]]).toBe("Sam Kin");
    expect(rows[0][COL["Medical notes"]]).toBe("Vegetarian");
    expect(rows[0][COL["Pickup point"]]).toBe('"Trinoma, 4:30 AM"');
    expect(rows[0][COL["Email"]]).toBe("");
    expect(rows[0][COL["Phone"]]).toBe("");
  });

  it("falls back to one booking-level row when a booking has no participant rows", () => {
    const rows = buildCsvRows([baseBooking], {});

    expect(rows).toHaveLength(1);
    expect(rows[0][COL["Full name"]]).toBe("Ana Booker");
    expect(rows[0][COL["Email"]]).toBe("ana@example.com");
    expect(rows[0][COL["Phone"]]).toBe("0917 000 0000");
    expect(rows[0][COL["Emergency contact name"]]).toBe("Ben Kin");
    expect(rows[0][COL["Medical notes"]]).toBe("Asthma");
  });

  it("exports blanks (and does not throw) for a purged booking with all-null sensitive fields", () => {
    const purgedBooking: CsvBooking = {
      ...baseBooking,
      slots: 2,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      medical_notes: null,
      meeting_point: null,
    };
    const rows = buildCsvRows([purgedBooking], {
      "42": [
        participant({ slot_number: 0, full_name: "Ana Booker", completed: true }),
        participant({ slot_number: 1, full_name: "Carla Second", completed: true }),
      ],
    });

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row[COL["Emergency contact name"]]).toBe("");
      expect(row[COL["Emergency contact phone"]]).toBe("");
      expect(row[COL["Medical notes"]]).toBe("");
      expect(row[COL["Pickup point"]]).toBe("");
    }
    // Names survive the purge (only the six sensitive columns are nulled).
    expect(rows[0][COL["Full name"]]).toBe("Ana Booker");
    expect(rows[1][COL["Full name"]]).toBe("Carla Second");
  });

  it("escapes commas, quotes, and newlines in medical notes", () => {
    const booking = { ...baseBooking, medical_notes: 'Allergic to "shellfish", peanuts' };
    const rows = buildCsvRows([booking], {});
    expect(rows[0][COL["Medical notes"]]).toBe('"Allergic to ""shellfish"", peanuts"');
  });
});

describe("escapeCsv", () => {
  it("maps null and undefined to an empty cell", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });
});
