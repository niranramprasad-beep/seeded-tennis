// Upper limits for the family season budget and a single expense (final-check
// A5, 2026-11-21). Without them a huge number passed every check here, then
// overflowed the database's numeric column (season_budgets.total_budget is
// numeric(9,2), max 9,999,999.99; budget_expenses.amount is numeric(8,2),
// max 999,999.99 — read from staging) and the form said "Try again" for
// ever. Both limits sit well under what the columns hold, so the database is
// never the first thing to refuse an amount.
//
// ONE source: the API routes' zod schemas, lib/db/family.ts's validators and
// the two budget forms all read these. lib/budget-limits.test.ts pins them.

export const MAX_SEASON_BUDGET_USD = 250_000;
export const MAX_BUDGET_EXPENSE_USD = 50_000;

export const SEASON_BUDGET_TOO_HIGH = "A season budget can be at most $250,000.";
export const EXPENSE_AMOUNT_TOO_HIGH = "A single expense can be at most $50,000.";

/** B4: an empty amount field is not $0. `Number("")` is 0, so the budget
 * dialog saved a blank total as $0 and closed with no message. */
export const BUDGET_AMOUNT_REQUIRED = "Enter a budget amount.";
export const EXPENSE_AMOUNT_REQUIRED = "Enter a cost.";

/** True when an amount field holds nothing a person typed. */
export function amountIsBlank(text: string): boolean {
  return text.trim() === "";
}

/** Null when the season total is within the limit (the negative / not-a-
 * number check stays with the caller's own sentence). */
export function seasonBudgetLimitError(totalBudget: number): string | null {
  return Number.isFinite(totalBudget) && totalBudget > MAX_SEASON_BUDGET_USD ? SEASON_BUDGET_TOO_HIGH : null;
}

/** Null when one expense is within the limit. */
export function expenseAmountLimitError(amount: number): string | null {
  return Number.isFinite(amount) && amount > MAX_BUDGET_EXPENSE_USD ? EXPENSE_AMOUNT_TOO_HIGH : null;
}
