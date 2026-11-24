import { describe, expect, it } from "vitest";
import {
  emptyPrepPlan,
  MAX_TOURNAMENT_DISTANCE_MILES,
  MAX_TOURNAMENT_TRAVEL_HOURS,
  validateTournamentEntryInput,
  type NewTournamentEntryInput,
} from "./events";
import { MAX_BUDGET_EXPENSE_USD } from "@/lib/budget-limits";
import { createUuid } from "./training";

const base: NewTournamentEntryInput = {
  name: "L3 Richmond Winter",
  level: "L3",
  eventDate: "2026-11-21",
  city: "Richmond",
  state: "VA",
};

describe("validateTournamentEntryInput", () => {
  it("accepts a minimal valid entry", () => {
    expect(validateTournamentEntryInput(base)).toBeNull();
  });

  it("accepts a fully populated valid entry", () => {
    expect(
      validateTournamentEntryInput({
        ...base,
        travelHours: 2,
        distanceMiles: null,
        drawUtr: 9.4,
        goalUtr: 10,
        entryCost: 95,
        travelCost: 120,
      })
    ).toBeNull();
  });

  it("rejects a blank or whitespace-only name", () => {
    expect(validateTournamentEntryInput({ ...base, name: "" })).toMatch(/name/i);
    expect(validateTournamentEntryInput({ ...base, name: "   " })).toMatch(/name/i);
  });

  it("rejects an unknown level", () => {
    expect(
      validateTournamentEntryInput({ ...base, level: "L9" as NewTournamentEntryInput["level"] })
    ).toMatch(/level/i);
  });

  it("accepts the 'utr' level", () => {
    expect(validateTournamentEntryInput({ ...base, level: "utr" })).toBeNull();
  });

  it("rejects a missing or unparseable date", () => {
    expect(validateTournamentEntryInput({ ...base, eventDate: "" })).toMatch(/date/i);
    expect(validateTournamentEntryInput({ ...base, eventDate: "not-a-date" })).toMatch(/date/i);
  });

  it("accepts a blank city or state — both are optional (PR D, D4)", () => {
    expect(validateTournamentEntryInput({ ...base, city: "" })).toBeNull();
    expect(validateTournamentEntryInput({ ...base, state: "" })).toBeNull();
    expect(validateTournamentEntryInput({ ...base, city: null, state: undefined })).toBeNull();
  });

  it("rejects draw/goal UTR outside 1-16.5", () => {
    expect(validateTournamentEntryInput({ ...base, drawUtr: 0.5 })).toMatch(/utr/i);
    expect(validateTournamentEntryInput({ ...base, drawUtr: 17 })).toMatch(/utr/i);
    expect(validateTournamentEntryInput({ ...base, goalUtr: -1 })).toMatch(/utr/i);
  });

  it("rejects negative travel/cost fields", () => {
    expect(validateTournamentEntryInput({ ...base, travelHours: -1 })).toMatch(/travel hours/i);
    expect(validateTournamentEntryInput({ ...base, distanceMiles: -5 })).toMatch(/distance/i);
    expect(validateTournamentEntryInput({ ...base, entryCost: -10 })).toMatch(/entry cost/i);
    expect(validateTournamentEntryInput({ ...base, travelCost: -10 })).toMatch(/travel cost/i);
  });

  // Each column's capacity, from production (2026-11-24). A limit at or over
  // it would let the database be the first to refuse (22003, "Try again").
  const COLUMN_MAX = { travelHours: 999.99, distanceMiles: 99_999.9, entryCost: 999_999.99, travelCost: 999_999.99 };

  it("keeps every upper limit under the column it is saved to", () => {
    expect(MAX_TOURNAMENT_TRAVEL_HOURS).toBeLessThan(COLUMN_MAX.travelHours);
    expect(MAX_TOURNAMENT_DISTANCE_MILES).toBeLessThan(COLUMN_MAX.distanceMiles);
    expect(MAX_BUDGET_EXPENSE_USD).toBeLessThan(COLUMN_MAX.entryCost);
  });

  it("refuses a number over the limit with a sentence naming it, and accepts the limit itself", () => {
    expect(validateTournamentEntryInput({ ...base, travelHours: 1000 })).toBe("Travel hours can be at most 200.");
    expect(validateTournamentEntryInput({ ...base, distanceMiles: 100_000 })).toBe("Distance can be at most 25,000 miles.");
    expect(validateTournamentEntryInput({ ...base, entryCost: 1_000_000 })).toBe("Entry cost can be at most $50,000.");
    expect(validateTournamentEntryInput({ ...base, travelCost: 50_000.01 })).toBe("Travel cost can be at most $50,000.");
    expect(
      validateTournamentEntryInput({
        ...base,
        travelHours: MAX_TOURNAMENT_TRAVEL_HOURS,
        distanceMiles: MAX_TOURNAMENT_DISTANCE_MILES,
        entryCost: MAX_BUDGET_EXPENSE_USD,
        travelCost: MAX_BUDGET_EXPENSE_USD,
      })
    ).toBeNull();
  });

  it("allows null/undefined optional fields", () => {
    expect(
      validateTournamentEntryInput({
        ...base,
        travelHours: null,
        distanceMiles: undefined,
        drawUtr: null,
        goalUtr: undefined,
        entryCost: null,
        travelCost: undefined,
      })
    ).toBeNull();
  });
});

// generatePrepPlan() — a template-written warm-up, tactics and packing list
// stored on every logged match — is deleted with Match mode (docs/
// DECISIONS.md, 2026-11-18). The column is NOT NULL, so a match now carries
// an empty plan.
describe("emptyPrepPlan", () => {
  it("says nothing", () => {
    const plan = emptyPrepPlan();
    expect([...plan.warmup, ...plan.tactics, ...plan.mental, ...plan.matchDay]).toEqual([]);
  });
});

describe("createUuid", () => {
  it("returns a well-formed v4-shaped uuid", () => {
    const id = createUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("never returns the same id twice in a row", () => {
    expect(createUuid()).not.toBe(createUuid());
  });
});
