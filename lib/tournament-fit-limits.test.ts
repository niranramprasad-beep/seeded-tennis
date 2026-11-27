import { describe, expect, it } from "vitest";
import { MAX_BUDGET_EXPENSE_USD } from "./budget-limits";
import {
  COST_LIMIT_SENTENCE,
  evaluateTournamentFit,
  formatDollars,
  verdictBlockers,
  verdictBlockerSentence,
  withCostLimitBlocker,
} from "./tournament-fit";
import { costPerMatchNote } from "./tournament-fit-share";

// Bug hunt 2026-11-26 (BUG-006, BUG-008, BUG-009), the tournament checker's
// cost limits and money formatting.
//
// BUG-006: a travel cost over the limit was dropped without a word — the
//   verdict stayed "Worth it", "Add to my events" stayed on, and the row was
//   saved with no travel cost. Now an over-limit cost, in either field, blocks
//   the verdict exactly as a missing entry fee does.
// BUG-008: an over-limit entry fee said "add the entry fee" although one was
//   typed. It now says the limit, in the sentence the field already used.
// BUG-009: "$16667 / match", "$50000 entered so far" — no thousands separator.

const OVER = MAX_BUDGET_EXPENSE_USD + 1;

describe("the cost limit sentence", () => {
  it("is the sentence the checker already showed under the cost fields, built from the one limit", () => {
    expect(COST_LIMIT_SENTENCE).toBe("Each cost can be at most $50,000.");
    expect(COST_LIMIT_SENTENCE).toContain(MAX_BUDGET_EXPENSE_USD.toLocaleString("en-US"));
  });
});

describe("withCostLimitBlocker (BUG-006, BUG-008)", () => {
  it("adds nothing while every cost is within the limit, the limit itself included", () => {
    expect(withCostLimitBlocker([], { entryCost: 60, travelCost: null })).toEqual([]);
    expect(withCostLimitBlocker([], { entryCost: null, travelCost: null })).toEqual([]);
    expect(withCostLimitBlocker([], { entryCost: MAX_BUDGET_EXPENSE_USD, travelCost: MAX_BUDGET_EXPENSE_USD })).toEqual([]);
    expect(withCostLimitBlocker(["level"], { entryCost: 0, travelCost: 0 })).toEqual(["level"]);
  });

  it("BUG-006: a travel cost over the limit blocks the verdict, though the entry fee is fine", () => {
    // What the view computes for entry fee 60 + travel cost 60000: the fee is
    // usable, so verdictBlockers() alone says nothing is missing.
    const missing = verdictBlockers({ level: "L3", playerUtr: 9.42, entryCost: 60, drawUtr: 9.6 });
    expect(missing).toEqual([]);
    expect(withCostLimitBlocker(missing, { entryCost: 60, travelCost: 60_000 })).toEqual(["cost limit"]);
  });

  it("BUG-008: an entry fee that was typed but is over the limit is not 'missing'", () => {
    // entryCostNum is null for an over-limit fee, so verdictBlockers() asks for the fee.
    const missing = verdictBlockers({ level: "L3", playerUtr: 9.42, entryCost: null, drawUtr: 9.6 });
    expect(missing).toEqual(["entry fee"]);
    expect(withCostLimitBlocker(missing, { entryCost: OVER, travelCost: null })).toEqual(["cost limit"]);
  });

  it("keeps a really missing fee asking for it when only the travel cost is over the limit", () => {
    expect(withCostLimitBlocker(["entry fee"], { entryCost: null, travelCost: OVER })).toEqual(["entry fee", "cost limit"]);
  });

  it("names the limit once, however many costs are over it, after the other blockers", () => {
    expect(withCostLimitBlocker(["level"], { entryCost: OVER, travelCost: OVER })).toEqual(["level", "cost limit"]);
    expect(withCostLimitBlocker(["cost limit"], { entryCost: OVER, travelCost: null })).toEqual(["cost limit"]);
  });
});

describe("verdictBlockerSentence with the cost limit (BUG-008)", () => {
  it("says the limit, not 'add the entry fee', when that is the only problem", () => {
    expect(verdictBlockerSentence(["cost limit"])).toBe(COST_LIMIT_SENTENCE);
  });

  it("asks for what is missing first, then says the limit", () => {
    expect(verdictBlockerSentence(["level", "cost limit"])).toBe(
      "To see a verdict, choose the level. Each cost can be at most $50,000."
    );
    expect(verdictBlockerSentence(["draw", "cost limit"])).toBe(
      "To see a verdict, add the draw's average UTR. Each cost can be at most $50,000."
    );
  });

  it("leaves every sentence without the limit as it was", () => {
    expect(verdictBlockerSentence(["entry fee"])).toBe("To see a verdict, add the entry fee.");
    expect(verdictBlockerSentence(["draw"])).toBe("Not enough info. Add the draw's average UTR for a real verdict.");
    expect(verdictBlockerSentence([])).toBe("");
  });
});

describe("formatDollars (BUG-009)", () => {
  it("writes whole dollars with thousands separators", () => {
    expect(formatDollars(0)).toBe("$0");
    expect(formatDollars(95)).toBe("$95");
    expect(formatDollars(1840)).toBe("$1,840");
    expect(formatDollars(16_666.67)).toBe("$16,667");
    expect(formatDollars(50_000)).toBe("$50,000");
    expect(formatDollars(999.6)).toBe("$1,000");
  });
});

describe("big amounts read with separators (BUG-009)", () => {
  it("the 'Cost per match' note", () => {
    expect(costPerMatchNote(3, 50_000, { known: true, partial: true })).toBe(
      "Assumes ~3 matches at this level · $50,000 entered so far"
    );
    expect(costPerMatchNote(3, 1840)).toBe("Assumes ~3 matches at this level · $1,840 total");
    expect(costPerMatchNote(3, 95)).toBe("Assumes ~3 matches at this level · $95 total");
  });

  const input = {
    name: "x",
    level: "L4" as const,
    playerUtr: 9.4,
    goalUtr: null,
    drawUtr: 9.6,
    travelHours: 0.5,
    distanceMiles: null,
    travelCost: null,
  };
  const costReason = (entryCost: number) =>
    evaluateTournamentFit({ ...input, entryCost }).reasons.find((r) => /per expected match/.test(r.text))?.text ?? "";

  it("the cost reason shown on /events, above and below $1,000", () => {
    expect(costReason(600)).toContain("About $200 per expected match ($600 total)");
    expect(costReason(1500)).toContain("Around $500 per expected match ($1,500 total)");
    expect(costReason(50_000)).toContain("Around $16,667 per expected match ($50,000 total)");
  });
});
