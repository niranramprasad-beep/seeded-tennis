import { describe, expect, it } from "vitest";
import { validateBudgetExpenseInput, type NewBudgetExpenseInput } from "./budget";

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
