// Real storage for /family's "Season budget" card (migration
// 015_family_overview_and_budget.sql — not yet applied to the live
// database; both loaders below degrade to an honest empty value until it
// is, same discipline as loadTournamentEntries/loadCoachOutreachDated's
// siblings). `season_budgets` holds the one editable total per family;
// `budget_expenses` holds freeform costs (camps, gear, anything that isn't
// a scored tournament_entries row) a parent logs via "Add expense".
import { getAuthedUser, getSupabase } from "./client";

export interface SeasonBudget {
  seasonLabel: string;
  totalBudget: number;
  updatedAt: string | null;
}

export type BudgetExpenseCategory = "entries" | "travel" | "camps";

export interface BudgetExpense {
  id: string;
  category: BudgetExpenseCategory;
  label: string;
  amount: number;
  expenseDate: string; // ISO yyyy-mm-dd
  createdAt: string;
}

export interface NewBudgetExpenseInput {
  category: BudgetExpenseCategory;
  label: string;
  amount: number;
  expenseDate: string;
}

const BUDGET_EXPENSE_CATEGORIES: BudgetExpenseCategory[] = ["entries", "travel", "camps"];

/** Pure validation, same "check before it ever reaches Supabase" shape as
 * lib/supabase/tournaments.ts's validateTournamentEntryInput — usable from
 * tests without a live database. */
export function validateBudgetExpenseInput(input: NewBudgetExpenseInput): string | null {
  if (!input.label || !input.label.trim()) return "A short description is required.";
  if (!BUDGET_EXPENSE_CATEGORIES.includes(input.category)) return "Choose a valid category.";
  if (!Number.isFinite(input.amount) || input.amount < 0) return "Cost can't be negative.";
  if (!input.expenseDate || Number.isNaN(Date.parse(input.expenseDate))) {
    return "Enter a valid date.";
  }
  return null;
}

async function userIdAndProfile(): Promise<{ id: string | null; profile: any | null }> {
  const supabase = getSupabase();
  if (!supabase) return { id: null, profile: null };
  const { data: userData } = await getAuthedUser(supabase);
  const id = userData.user?.id ?? null;
  if (!id) return { id: null, profile: null };
  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return { id, profile: profileData };
}

function mapSeasonBudget(row: any): SeasonBudget {
  return {
    seasonLabel: row.season_label ?? "This season",
    totalBudget: Number(row.total_budget ?? 0),
    updatedAt: row.updated_at ?? null,
  };
}

/** Null means no budget has ever been set for this family (not an error) —
 * callers should fall back to a computed default label and a $0 total. */
export async function loadSeasonBudget(signal?: AbortSignal): Promise<SeasonBudget | null> {
  const supabase = getSupabase();
  const { profile: p } = await userIdAndProfile();
  if (!supabase || !p?.family_code) return null;
  let query = supabase.from("season_budgets").select("*").eq("family_code", p.family_code);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return mapSeasonBudget(data);
}

/** Upserts the family's one season-budget row (by family_code). This is the
 * real action behind /family's "Edit budget" — parent-owned data, never a
 * player-owned field. */
export async function saveSeasonBudget(input: {
  seasonLabel: string;
  totalBudget: number;
}): Promise<SeasonBudget | null> {
  if (!Number.isFinite(input.totalBudget) || input.totalBudget < 0) {
    throw new Error("Budget total can't be negative.");
  }
  if (!input.seasonLabel.trim()) throw new Error("Season label is required.");

  const supabase = getSupabase();
  const { id: userId, profile: p } = await userIdAndProfile();
  if (!supabase || !userId || !p?.family_code) return null;

  const { data, error } = await supabase
    .from("season_budgets")
    .upsert(
      {
        family_code: p.family_code,
        season_label: input.seasonLabel.trim(),
        total_budget: input.totalBudget,
        updated_by: userId,
      },
      { onConflict: "family_code" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapSeasonBudget(data);
}

function mapBudgetExpense(row: any): BudgetExpense {
  return {
    id: row.id,
    category: row.category,
    label: row.label,
    amount: Number(row.amount ?? 0),
    expenseDate: row.expense_date,
    createdAt: row.created_at,
  };
}

export async function loadBudgetExpenses(signal?: AbortSignal): Promise<BudgetExpense[]> {
  const supabase = getSupabase();
  const { profile: p } = await userIdAndProfile();
  if (!supabase || !p?.family_code) return [];
  let query = supabase
    .from("budget_expenses")
    .select("*")
    .eq("family_code", p.family_code)
    .order("expense_date", { ascending: false });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map(mapBudgetExpense);
}

/** The real action behind /family's "Add expense" — parent-owned data
 * (season spend), never a player-owned field. */
export async function saveBudgetExpense(input: NewBudgetExpenseInput): Promise<BudgetExpense | null> {
  const validationError = validateBudgetExpenseInput(input);
  if (validationError) throw new Error(validationError);

  const supabase = getSupabase();
  const { id: userId, profile: p } = await userIdAndProfile();
  if (!supabase || !userId || !p?.family_code) return null;

  const { data, error } = await supabase
    .from("budget_expenses")
    .insert({
      family_code: p.family_code,
      created_by: userId,
      category: input.category,
      label: input.label.trim(),
      amount: input.amount,
      expense_date: input.expenseDate,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapBudgetExpense(data);
}
