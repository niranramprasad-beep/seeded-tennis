import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import {
  EXPENSE_AMOUNT_TOO_HIGH,
  MAX_BUDGET_EXPENSE_USD,
  MAX_SEASON_BUDGET_USD,
  SEASON_BUDGET_TOO_HIGH,
  expenseAmountLimitError,
  seasonBudgetLimitError,
} from "./budget-limits";
import { UserFacingError } from "./db/write-error";
import { saveSeasonBudget, validateBudgetExpenseInput } from "./db/family";

// final-check A5 (2026-11-21): a huge budget amount passed every check, then
// overflowed the database column and the form said "Try again" for ever.

const ROOT = join(__dirname, "..");

// What staging's columns hold (information_schema, read 2026-11-21):
// season_budgets.total_budget numeric(9,2), budget_expenses.amount numeric(8,2).
const DB_MAX_SEASON_BUDGET = 9_999_999.99;
const DB_MAX_EXPENSE = 999_999.99;

describe("budget limits", () => {
  it("sit under what the database columns can hold", () => {
    expect(MAX_SEASON_BUDGET_USD).toBe(250_000);
    expect(MAX_BUDGET_EXPENSE_USD).toBe(50_000);
    expect(MAX_SEASON_BUDGET_USD).toBeLessThan(DB_MAX_SEASON_BUDGET);
    expect(MAX_BUDGET_EXPENSE_USD).toBeLessThan(DB_MAX_EXPENSE);
  });

  it("name the limit in the message", () => {
    expect(SEASON_BUDGET_TOO_HIGH).toBe("A season budget can be at most $250,000.");
    expect(EXPENSE_AMOUNT_TOO_HIGH).toBe("A single expense can be at most $50,000.");
  });

  it("allow the limit itself and refuse anything above it", () => {
    expect(seasonBudgetLimitError(250_000)).toBeNull();
    expect(seasonBudgetLimitError(250_000.01)).toBe(SEASON_BUDGET_TOO_HIGH);
    expect(seasonBudgetLimitError(1e12)).toBe(SEASON_BUDGET_TOO_HIGH);
    expect(seasonBudgetLimitError(0)).toBeNull();
    expect(expenseAmountLimitError(50_000)).toBeNull();
    expect(expenseAmountLimitError(50_000.01)).toBe(EXPENSE_AMOUNT_TOO_HIGH);
    expect(expenseAmountLimitError(99_999_999)).toBe(EXPENSE_AMOUNT_TOO_HIGH);
  });

  it("the write paths refuse an over-limit amount as our own sentence, before any database call", async () => {
    const ctx = { supabase: null as never, userId: "u", familyCode: "F" };
    const p = saveSeasonBudget({ seasonLabel: "Fall", totalBudget: 1e9 }, ctx);
    await expect(p).rejects.toBeInstanceOf(UserFacingError);
    await expect(saveSeasonBudget({ seasonLabel: "Fall", totalBudget: 1e9 }, ctx)).rejects.toThrow(SEASON_BUDGET_TOO_HIGH);
    expect(
      validateBudgetExpenseInput({ category: "travel", label: "Flights", amount: 60_000, expenseDate: "2026-11-01" })
    ).toBe(EXPENSE_AMOUNT_TOO_HIGH);
    expect(
      validateBudgetExpenseInput({ category: "travel", label: "Flights", amount: 50_000, expenseDate: "2026-11-01" })
    ).toBeNull();
  });

  it("the API routes enforce the same limits in zod, and the forms check them before posting", () => {
    const budget = codeOnly(join(ROOT, "app/api/family/budget/route.ts"));
    const expenses = codeOnly(join(ROOT, "app/api/family/budget/expenses/route.ts"));
    expect(budget).toMatch(/totalBudget:\s*z\.number\(\)\.max\(MAX_SEASON_BUDGET_USD, SEASON_BUDGET_TOO_HIGH\)/);
    expect(expenses).toMatch(/amount:\s*z\.number\(\)\.max\(MAX_BUDGET_EXPENSE_USD, EXPENSE_AMOUNT_TOO_HIGH\)/);
    const forms = codeOnly(join(ROOT, "components/seeded/family/budget-modals.tsx"));
    expect(forms).toMatch(/seasonBudgetLimitError\(totalBudget\)/);
    expect(forms).toMatch(/expenseAmountLimitError\(amt\)/);
  });
});
