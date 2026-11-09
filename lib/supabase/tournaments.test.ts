import { describe, expect, it } from "vitest";
import { validateTournamentEntryInput, type NewTournamentEntryInput } from "./tournaments";

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

  it("rejects a blank city or state", () => {
    expect(validateTournamentEntryInput({ ...base, city: "" })).toMatch(/city/i);
    expect(validateTournamentEntryInput({ ...base, state: "" })).toMatch(/state/i);
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
