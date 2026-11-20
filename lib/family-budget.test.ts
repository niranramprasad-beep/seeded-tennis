import { describe, expect, it } from "vitest";
import { buildSeasonBudgetSummary, canEditBudget, pendingSkipDecisions, shortBadFitReason } from "./family-budget";
import type { TournamentEntry } from "./db/events";
import type { BudgetExpense } from "./db/family";
import { evaluateTournamentFit } from "./tournament-fit";

const entry = (overrides: Partial<TournamentEntry> & { id: string }): TournamentEntry => ({
  userId: "player-1",
  name: "Test tournament",
  level: "L3",
  eventDate: "2026-10-30",
  city: "Richmond",
  state: "VA",
  travelHours: 1,
  distanceMiles: null,
  drawUtr: null,
  goalUtr: null,
  entryCost: 100,
  travelCost: 50,
  status: "entered",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const expense = (overrides: Partial<BudgetExpense> & { id: string }): BudgetExpense => ({
  category: "camps",
  label: "Duke Tennis Camp",
  amount: 380,
  expenseDate: "2026-09-26",
  createdAt: "2026-09-26T00:00:00Z",
  ...overrides,
});

describe("buildSeasonBudgetSummary", () => {
  it("sums entered tournament entries into entries/travel spend and skips non-entered ones", () => {
    const entries = [
      entry({ id: "1", status: "entered", entryCost: 300, travelCost: 120 }),
      entry({ id: "2", status: "saved", entryCost: 999, travelCost: 999 }),
    ];
    const summary = buildSeasonBudgetSummary({ totalBudget: 1000, playerUtr: 9, entries, expenses: [] });
    expect(summary.entriesSpent).toBe(300);
    expect(summary.travelSpent).toBe(120);
    expect(summary.spent).toBe(420);
    expect(summary.lineItems).toHaveLength(1);
    expect(summary.lineItems[0].id).toBe("1");
  });

  it("counts a Played tournament as spend, like an Entered one (047)", () => {
    const entries = [
      entry({ id: "p", status: "played", entryCost: 80, travelCost: 20 }),
      entry({ id: "e", status: "entered", entryCost: 100, travelCost: 0 }),
      entry({ id: "s", status: "saved", entryCost: 500, travelCost: 500 }),
    ];
    const summary = buildSeasonBudgetSummary({ totalBudget: 1000, playerUtr: 9, entries, expenses: [] });
    expect(summary.spent).toBe(200);
    expect(summary.lineItems.map((l) => l.id).sort()).toEqual(["e", "p"]);
  });

  it("never offers a Played or Entered tournament as a skip decision, and needs the draw's average", () => {
    const bad = { status: "saved" as const, drawUtr: 3 };
    expect(pendingSkipDecisions([entry({ id: "played", ...bad, status: "played" })], 9)).toEqual([]);
    expect(pendingSkipDecisions([entry({ id: "no-draw", status: "saved", drawUtr: null })], 9)).toEqual([]);
    expect(pendingSkipDecisions([entry({ id: "s", ...bad })], 9).map((d) => d.entry.id)).toEqual(["s"]);
  });

  it("categorizes budget_expenses into the matching spend bucket", () => {
    const expenses = [
      expense({ id: "e1", category: "camps", amount: 380 }),
      expense({ id: "e2", category: "entries", amount: 50 }),
      expense({ id: "e3", category: "travel", amount: 75 }),
    ];
    const summary = buildSeasonBudgetSummary({ totalBudget: 1000, playerUtr: 9, entries: [], expenses });
    expect(summary.campsSpent).toBe(380);
    expect(summary.entriesSpent).toBe(50);
    expect(summary.travelSpent).toBe(75);
    expect(summary.spent).toBe(505);
    expect(summary.lineItems.map((l) => l.chip)).toEqual(
      expect.arrayContaining(["camps", "entries", "travel"])
    );
  });

  it("computes remaining as totalBudget minus real spend, allowing negative (over budget)", () => {
    const summary = buildSeasonBudgetSummary({
      totalBudget: 100,
      playerUtr: 9,
      entries: [entry({ id: "1", entryCost: 200, travelCost: 0 })],
      expenses: [],
    });
    expect(summary.remaining).toBe(-100);
  });

  it("sorts line items newest date first", () => {
    const entries = [
      entry({ id: "old", eventDate: "2026-09-26" }),
      entry({ id: "new", eventDate: "2026-10-30" }),
    ];
    const summary = buildSeasonBudgetSummary({ totalBudget: 1000, playerUtr: 9, entries, expenses: [] });
    expect(summary.lineItems.map((l) => l.id)).toEqual(["new", "old"]);
  });

  it("aggregates skipped bad-fit (saved, not entered) tournaments as a real 'would have cost' total", () => {
    // Far below player UTR (bad competition fit) AND never entered.
    const entries = [
      entry({ id: "bad1", status: "saved", drawUtr: 3, entryCost: 100, travelCost: 80 }),
      entry({ id: "bad2", status: "saved", drawUtr: 3.2, entryCost: 50, travelCost: 50 }),
      // A good fit that's merely saved shouldn't count as "skipped".
      entry({ id: "good", status: "saved", drawUtr: 9.2, entryCost: 40, travelCost: 10 }),
    ];
    const summary = buildSeasonBudgetSummary({ totalBudget: 1000, playerUtr: 9, entries, expenses: [] });
    expect(summary.skippedBadFitCount).toBe(2);
    expect(summary.skippedBadFitSaved).toBe(280);
    // None of the skipped/saved entries show up as spend line items.
    expect(summary.lineItems).toHaveLength(0);
  });

  it("handles a completely empty budget", () => {
    const summary = buildSeasonBudgetSummary({ totalBudget: 0, playerUtr: 9, entries: [], expenses: [] });
    expect(summary).toMatchObject({
      spent: 0,
      remaining: 0,
      entriesSpent: 0,
      travelSpent: 0,
      campsSpent: 0,
      skippedBadFitCount: 0,
      skippedBadFitSaved: 0,
    });
    expect(summary.lineItems).toEqual([]);
  });
});

describe("canEditBudget", () => {
  it("allows a parent to edit the season budget", () => {
    expect(canEditBudget("parent")).toBe(true);
  });

  it("blocks a player from editing the season budget", () => {
    expect(canEditBudget("player")).toBe(false);
  });
});

describe("pendingSkipDecisions", () => {
  it("only returns saved (not entered) tournaments that score as a bad fit", () => {
    const entries = [
      entry({ id: "bad", status: "saved", drawUtr: 3, eventDate: "2026-11-22" }),
      entry({ id: "entered-bad", status: "entered", drawUtr: 3 }),
      entry({ id: "good", status: "saved", drawUtr: 9.2 }),
    ];
    const decisions = pendingSkipDecisions(entries, 9);
    expect(decisions.map((d) => d.entry.id)).toEqual(["bad"]);
    expect(decisions[0].wouldSave).toBeGreaterThan(0);
  });

  it("sorts soonest event first", () => {
    const entries = [
      entry({ id: "later", status: "saved", drawUtr: 3, eventDate: "2027-01-10" }),
      entry({ id: "sooner", status: "saved", drawUtr: 3, eventDate: "2026-11-22" }),
    ];
    const decisions = pendingSkipDecisions(entries, 9);
    expect(decisions.map((d) => d.entry.id)).toEqual(["sooner", "later"]);
  });
});

describe("shortBadFitReason", () => {
  it("flags cost when cost is the clearest drag on the score", () => {
    const fit = evaluateTournamentFit({
      name: "Pricey event",
      level: "L3",
      playerUtr: 9,
      goalUtr: null,
      drawUtr: 9,
      travelHours: 1,
      distanceMiles: null,
      entryCost: 2000,
      travelCost: 1500,
    });
    expect(shortBadFitReason(fit)).toMatch(/costly/i);
  });

  it("flags a too-weak field when competition is the clearest drag", () => {
    const fit = evaluateTournamentFit({
      name: "Weak field",
      level: "L3",
      playerUtr: 9,
      goalUtr: null,
      drawUtr: 3,
      travelHours: 1,
      distanceMiles: null,
      entryCost: 20,
      travelCost: 10,
    });
    expect(shortBadFitReason(fit)).toMatch(/field too weak/i);
  });
});

describe("a sibling's tournament is never judged against this player's rating", () => {
  it("counts the sibling's spend but gives it no fit verdict", () => {
    const mine = entry({ id: "m", status: "entered", userId: "avery", entryCost: 100, travelCost: 0, drawUtr: 9.2 });
    const theirs = entry({ id: "s", status: "entered", userId: "riley", entryCost: 50, travelCost: 0, drawUtr: 9.2 });
    const summary = buildSeasonBudgetSummary({
      totalBudget: 1000,
      playerUtr: 9,
      entries: [mine, theirs],
      expenses: [],
      judgedUserId: "avery",
    });
    expect(summary.spent).toBe(150);
    const sib = summary.lineItems.find((l) => l.id === "s")!;
    expect(sib.chip).toBe("entries");
    const own = summary.lineItems.find((l) => l.id === "m")!;
    expect(["good", "decent", "bad"]).toContain(own.chip);
  });

  it("only offers skip decisions for the judged player's saved entries", () => {
    const sib = entry({ id: "s", status: "saved", userId: "riley", entryCost: 900, travelCost: 900 });
    expect(pendingSkipDecisions([sib], 9, "avery")).toEqual([]);
  });
});
