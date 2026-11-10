import { describe, expect, it } from "vitest";
import { buildSeasonBudgetSummary, canEditBudget, pendingSkipDecisions, shortBadFitReason } from "./family-budget";
import type { TournamentEntry } from "./db/events";
import type { BudgetExpense } from "./db/family";
import { evaluateTournamentFit } from "./tournament-fit";

const entry = (overrides: Partial<TournamentEntry> & { id: string }): TournamentEntry => ({
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
