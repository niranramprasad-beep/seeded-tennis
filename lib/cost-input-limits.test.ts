import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COST_INPUT_LIMITS, MAX_BUDGET_EXPENSE_USD, clampCostInput } from "./budget-limits";
import { calculateCost, type CostInputs } from "./db/family";

// Bug hunt 2026-11-26, BUG-007: the parent's "Longer-range projection" took
// any number. Nine digits in each field made totals like
// "$51,999,999,844,000,000,000,00…" that ran off the cards and the pill and
// pushed the page 624 px wide at 390 (1,536 px at 1440), and "Years remaining"
// took 999,999,999. Every field now has a ceiling, the money ones the same
// $50,000 a single budget expense has, and the value elements wrap instead of
// overflowing if a number is ever longer than its card.

const ROOT = join(__dirname, "..");
const KEYS = Object.keys(COST_INPUT_LIMITS) as (keyof CostInputs)[];

describe("the cost projection's input limits", () => {
  it("cover exactly the six fields of the projection", () => {
    const inputs: CostInputs = {
      yearsRemaining: 0,
      tournamentsPerYear: 0,
      coachingHoursPerWeek: 0,
      lessonRate: 0,
      equipmentBudgetPerYear: 0,
      travelCostPerTournament: 0,
    };
    expect(KEYS.sort()).toEqual(Object.keys(inputs).sort());
  });

  it("are the limits a person can mean: school years, weeks in a year, hours in a week, one expense", () => {
    expect(COST_INPUT_LIMITS.yearsRemaining).toBe(12);
    expect(COST_INPUT_LIMITS.tournamentsPerYear).toBe(52);
    expect(COST_INPUT_LIMITS.coachingHoursPerWeek).toBe(168);
    expect(COST_INPUT_LIMITS.lessonRate).toBe(MAX_BUDGET_EXPENSE_USD);
    expect(COST_INPUT_LIMITS.equipmentBudgetPerYear).toBe(MAX_BUDGET_EXPENSE_USD);
    expect(COST_INPUT_LIMITS.travelCostPerTournament).toBe(MAX_BUDGET_EXPENSE_USD);
  });
});

describe("clampCostInput", () => {
  it("keeps a value inside 0 and the field's limit", () => {
    expect(clampCostInput("lessonRate", 115)).toBe(115);
    expect(clampCostInput("lessonRate", 0)).toBe(0);
    expect(clampCostInput("lessonRate", MAX_BUDGET_EXPENSE_USD)).toBe(MAX_BUDGET_EXPENSE_USD);
    expect(clampCostInput("yearsRemaining", 6)).toBe(6);
  });

  it("BUG-007: nine digits become the limit, in every field", () => {
    for (const key of KEYS) {
      expect(clampCostInput(key, 999_999_999), key).toBe(COST_INPUT_LIMITS[key]);
    }
    expect(clampCostInput("yearsRemaining", 999_999_999)).toBe(12);
  });

  it("still turns a negative, NaN or missing number into 0", () => {
    expect(clampCostInput("lessonRate", -5)).toBe(0);
    expect(clampCostInput("tournamentsPerYear", Number.NaN)).toBe(0);
    expect(clampCostInput("coachingHoursPerWeek", Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("treats an infinite number as over the limit", () => {
    expect(clampCostInput("equipmentBudgetPerYear", Number.POSITIVE_INFINITY)).toBe(MAX_BUDGET_EXPENSE_USD);
  });

  it("BUG-007: even every field at its limit gives a total that fits a card (16 characters or fewer)", () => {
    const worst = Object.fromEntries(KEYS.map((k) => [k, COST_INPUT_LIMITS[k]])) as unknown as CostInputs;
    const r = calculateCost(worst);
    for (const value of [r.total, r.coaching, r.tournaments, r.equipment]) {
      expect(`$${Math.round(value).toLocaleString("en-US")}`.length).toBeLessThanOrEqual(16);
    }
  });
});

describe("the cost calculator view", () => {
  const src = readFileSync(join(ROOT, "components", "cost", "cost-calculator-view.tsx"), "utf8");

  it("sends every typed number through clampCostInput, and the prefilled years too", () => {
    expect(src).toMatch(/clampCostInput\(key,/);
    expect(src).toMatch(/clampCostInput\("yearsRemaining",/);
  });

  it("lets a long value wrap instead of overflowing its card, the pill and a saved row", () => {
    const wraps = src.match(/\[overflow-wrap:anywhere\]/g) ?? [];
    expect(wraps.length).toBeGreaterThanOrEqual(3);
  });
});
