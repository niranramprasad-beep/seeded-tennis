import { describe, expect, it } from "vitest";
import { emptyPrepPlan, validateTournamentEntryInput, type NewTournamentEntryInput } from "./events";
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
