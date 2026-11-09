import { describe, expect, it } from "vitest";
import { calculateCost, validateBudgetExpenseInput, type CostInputs, type NewBudgetExpenseInput } from "./family";

const base: NewBudgetExpenseInput = {
  category: "camps",
  label: "Duke Tennis Camp",
  amount: 380,
  expenseDate: "2026-09-26",
};

describe("validateBudgetExpenseInput", () => {
  it("accepts a valid expense", () => {
    expect(validateBudgetExpenseInput(base)).toBeNull();
  });

  it("rejects a blank or whitespace-only label", () => {
    expect(validateBudgetExpenseInput({ ...base, label: "" })).toMatch(/description/i);
    expect(validateBudgetExpenseInput({ ...base, label: "   " })).toMatch(/description/i);
  });

  it("rejects an unknown category", () => {
    expect(
      validateBudgetExpenseInput({ ...base, category: "other" as NewBudgetExpenseInput["category"] })
    ).toMatch(/category/i);
  });

  it("accepts each real category", () => {
    expect(validateBudgetExpenseInput({ ...base, category: "entries" })).toBeNull();
    expect(validateBudgetExpenseInput({ ...base, category: "travel" })).toBeNull();
    expect(validateBudgetExpenseInput({ ...base, category: "camps" })).toBeNull();
  });

  it("rejects a negative amount", () => {
    expect(validateBudgetExpenseInput({ ...base, amount: -5 })).toMatch(/negative/i);
  });

  it("accepts a zero amount", () => {
    expect(validateBudgetExpenseInput({ ...base, amount: 0 })).toBeNull();
  });

  it("rejects a missing or unparseable date", () => {
    expect(validateBudgetExpenseInput({ ...base, expenseDate: "" })).toMatch(/date/i);
    expect(validateBudgetExpenseInput({ ...base, expenseDate: "not-a-date" })).toMatch(/date/i);
  });
});

const costInputs: CostInputs = {
  yearsRemaining: 2,
  tournamentsPerYear: 10,
  coachingHoursPerWeek: 3,
  lessonRate: 50,
  equipmentBudgetPerYear: 500,
  travelCostPerTournament: 200,
  targetSchools: [{ name: "Duke", division: "D1", annualCost: 80000, scholarshipPercent: 50 }],
};

describe("calculateCost", () => {
  it("computes coaching cost as hours * rate * 52 weeks * years", () => {
    const result = calculateCost(costInputs);
    expect(result.coaching).toBe(3 * 50 * 52 * 2);
  });

  it("computes tournament travel cost as tournaments * cost per * years", () => {
    const result = calculateCost(costInputs);
    expect(result.tournaments).toBe(10 * 200 * 2);
  });

  it("computes equipment cost as the per-year budget * years", () => {
    const result = calculateCost(costInputs);
    expect(result.equipment).toBe(500 * 2);
  });

  it("total is the sum of the three buckets", () => {
    const result = calculateCost(costInputs);
    expect(result.total).toBe(result.coaching + result.tournaments + result.equipment);
  });

  it("computes each target school's scholarship value and net cost", () => {
    const result = calculateCost(costInputs);
    const duke = result.scholarships[0];
    expect(duke.scholarshipValue).toBe(80000 * 2 * 0.5);
    expect(duke.netCost).toBe(Math.max(0, result.total - duke.scholarshipValue));
  });

  it("never lets a net cost go negative, even with a scholarship bigger than the total", () => {
    const result = calculateCost({
      ...costInputs,
      targetSchools: [{ name: "Full ride U", division: "D1", annualCost: 1_000_000, scholarshipPercent: 100 }],
    });
    expect(result.scholarships[0].netCost).toBe(0);
  });
});
