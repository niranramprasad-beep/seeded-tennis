import { describe, expect, it } from "vitest";
import {
  MAX_TOURNAMENT_DISTANCE_MILES,
  MAX_TOURNAMENT_TRAVEL_HOURS,
  tournamentEntryProblem,
  validateTournamentEntryInput,
  type NewTournamentEntryInput,
} from "./events";
import { MAX_BUDGET_EXPENSE_USD } from "@/lib/budget-limits";

// Bug hunt 2026-11-26, BUG-010: Events → Edit tournament showed a limit or
// range message in the box above the buttons, left focus on Save and marked
// no field invalid, so the person had to work out which of three number
// fields it was about. The validator now says WHICH field as well as what
// (tournamentEntryProblem); validateTournamentEntryInput still returns the
// same sentences it always did (lib/db/events.test.ts pins them).

const base: NewTournamentEntryInput = {
  name: "L3 Richmond Winter",
  level: "L3",
  eventDate: "2026-11-21",
  city: "Richmond",
  state: "VA",
};

describe("tournamentEntryProblem names the field a problem is about", () => {
  it("is null for a valid entry", () => {
    expect(tournamentEntryProblem(base)).toBeNull();
    expect(
      tournamentEntryProblem({
        ...base,
        travelHours: MAX_TOURNAMENT_TRAVEL_HOURS,
        distanceMiles: MAX_TOURNAMENT_DISTANCE_MILES,
        entryCost: MAX_BUDGET_EXPENSE_USD,
        travelCost: MAX_BUDGET_EXPENSE_USD,
        drawUtr: 9.4,
      })
    ).toBeNull();
  });

  it("an over-limit number points at its own field, with the sentence it always had", () => {
    expect(tournamentEntryProblem({ ...base, travelHours: 300 })).toEqual({
      field: "travelHours",
      message: "Travel hours can be at most 200.",
    });
    expect(tournamentEntryProblem({ ...base, entryCost: 60_000 })).toEqual({
      field: "entryCost",
      message: "Entry cost can be at most $50,000.",
    });
    expect(tournamentEntryProblem({ ...base, travelCost: 50_000.01 })).toEqual({
      field: "travelCost",
      message: "Travel cost can be at most $50,000.",
    });
    expect(tournamentEntryProblem({ ...base, distanceMiles: 100_000 })?.field).toBe("distanceMiles");
  });

  it("so does a negative number", () => {
    expect(tournamentEntryProblem({ ...base, travelHours: -1 })).toEqual({
      field: "travelHours",
      message: "Travel hours can't be negative.",
    });
    expect(tournamentEntryProblem({ ...base, entryCost: -10 })?.field).toBe("entryCost");
    expect(tournamentEntryProblem({ ...base, travelCost: -10 })?.field).toBe("travelCost");
  });

  it("and the other fields: name, level, date, draw UTR, goal UTR", () => {
    expect(tournamentEntryProblem({ ...base, name: "  " })).toEqual({ field: "name", message: "Tournament name is required." });
    expect(tournamentEntryProblem({ ...base, level: "L9" as NewTournamentEntryInput["level"] })?.field).toBe("level");
    expect(tournamentEntryProblem({ ...base, eventDate: "not-a-date" })?.field).toBe("eventDate");
    expect(tournamentEntryProblem({ ...base, drawUtr: 17 })).toEqual({
      field: "drawUtr",
      message: "Draw UTR must be between 1 and 16.5.",
    });
    expect(tournamentEntryProblem({ ...base, goalUtr: 0.5 })?.field).toBe("goalUtr");
  });

  it("reports the first problem in the order the validator always checked", () => {
    expect(tournamentEntryProblem({ ...base, name: "", travelHours: 300 })?.field).toBe("name");
    expect(tournamentEntryProblem({ ...base, travelHours: 300, entryCost: 60_000 })?.field).toBe("travelHours");
  });
});

describe("validateTournamentEntryInput is the same validator, message only", () => {
  it("returns the problem's sentence, or null", () => {
    expect(validateTournamentEntryInput(base)).toBeNull();
    for (const patch of [{ travelHours: 300 }, { entryCost: 60_000 }, { drawUtr: 17 }, { name: "" }, { travelCost: -1 }]) {
      const input = { ...base, ...patch };
      expect(validateTournamentEntryInput(input)).toBe(tournamentEntryProblem(input)?.message);
    }
  });
});
