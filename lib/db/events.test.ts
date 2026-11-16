import { describe, expect, it } from "vitest";
import { createUuid, generatePrepPlan, validateTournamentEntryInput, type NewTournamentEntryInput } from "./events";

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

describe("generatePrepPlan", () => {
  it("falls back to serve/mental when no weaknesses are logged", () => {
    const plan = generatePrepPlan({ weaknesses: [], surface: "hard", currentUtr: 8 });
    expect(plan.warmup.some((line) => line.includes("serve"))).toBe(true);
  });

  it("builds a surface-specific warmup note for each surface", () => {
    const clay = generatePrepPlan({ weaknesses: ["serve"], surface: "clay", currentUtr: 8 });
    const grass = generatePrepPlan({ weaknesses: ["serve"], surface: "grass", currentUtr: 8 });
    const indoor = generatePrepPlan({ weaknesses: ["serve"], surface: "indoor", currentUtr: 8 });
    expect(clay.warmup.join(" ")).toMatch(/net clearance/i);
    expect(grass.warmup.join(" ")).toMatch(/stay low/i);
    expect(indoor.warmup.join(" ")).toMatch(/faster timing/i);
  });

  it("tactics acknowledge a higher-rated opponent", () => {
    const plan = generatePrepPlan({ weaknesses: ["serve"], surface: "hard", currentUtr: 8, opponentUtr: 10 });
    expect(plan.tactics[0]).toMatch(/higher rated/i);
  });

  it("tactics acknowledge a lower-rated opponent", () => {
    const plan = generatePrepPlan({ weaknesses: ["serve"], surface: "hard", currentUtr: 10, opponentUtr: 8 });
    expect(plan.tactics[0]).toMatch(/you are higher rated/i);
  });

  it("always returns a non-empty mental and matchDay checklist", () => {
    const plan = generatePrepPlan({ weaknesses: [], surface: "hard", currentUtr: 8 });
    expect(plan.mental.length).toBeGreaterThan(0);
    expect(plan.matchDay.length).toBeGreaterThan(0);
  });

  it("stamps a real generatedAt timestamp", () => {
    const before = Date.now();
    const plan = generatePrepPlan({ weaknesses: [], surface: "hard", currentUtr: 8 });
    expect(new Date(plan.generatedAt).getTime()).toBeGreaterThanOrEqual(before);
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
