// Real data access behind /family: the family roster, parent weekly
// reports, encouragement notes, the season budget + logged expenses, and
// the lifetime cost-of-recruiting calculator. Moved verbatim from the
// former lib/supabase/features.ts's family-facing sections and the whole
// of the former lib/supabase/budget.ts.
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { resolveGraduationYear } from "@/lib/time";
import type { Json, Tables } from "./database.types";

async function userIdAndProfile(): Promise<{ id: string | null; profile: Tables<"profiles"> | null }> {
  const supabase = getSupabase();
  if (!supabase) return { id: null, profile: null };
  const { data: userData } = await getAuthedUser(supabase);
  const id = userData.user?.id ?? null;
  if (!id) return { id: null, profile: null };
  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return { id, profile: profileData };
}

async function profile(): Promise<Tables<"profiles"> | null> {
  const { profile: p } = await userIdAndProfile();
  return p;
}

/* ---------------------------------------------------------- family roster */

export interface FamilyMember {
  id: string;
  name: string;
  email: string;
  role: "player" | "parent";
  currentUtr: number;
  graduationYear: number | null;
  onboarded: boolean;
  // Additive (/family's Seeded rebuild needs these). A parent's OWN
  // `profiles` row has no meaningful target_school_slugs/gender of its
  // own — those live on the PLAYER's row, which a parent can only reach
  // through this family roster (mapProfileToPlayer() in lib/auth.ts always
  // maps the SIGNED-IN user's own row, so usePlayer()'s player object is
  // never the right source for these fields on a parent session).
  // `profiles` is already family-readable (family_members_read policy,
  // migration 004) so no RLS change was needed for either column.
  targetSchoolSlugs?: string[];
  gender?: "male" | "female";
  createdAt?: string;
}

export async function loadFamilyMembers(signal?: AbortSignal): Promise<FamilyMember[]> {
  const supabase = getSupabase();
  const p = await profile();
  if (!supabase || !p?.family_code) return [];
  let query = supabase
    .from("profiles")
    .select(
      "id,email,name,role,current_utr,grade,graduation_year,created_at,onboarded,target_school_slugs,gender"
    )
    .eq("family_code", p.family_code)
    .order("role", { ascending: false });
  if (signal) query = query.abortSignal(signal);
  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? "Family member",
    email: row.email ?? "",
    role: (row.role ?? "player") as "player" | "parent",
    currentUtr: Number(row.current_utr ?? 0),
    graduationYear: resolveGraduationYear(row),
    onboarded: Boolean(row.onboarded),
    targetSchoolSlugs: row.target_school_slugs ?? [],
    gender: row.gender ?? undefined,
    createdAt: row.created_at ?? undefined,
  }));
}

/* ----------------------------------------------------------- parent reports */

export interface ParentReport {
  id: string;
  month: string;
  title: string;
  summary: Record<string, unknown>;
  publicUrl: string;
  storagePath: string;
  createdAt: string;
}

function mapReport(row: Tables<"parent_reports">): ParentReport {
  return {
    id: row.id,
    month: row.month,
    title: row.title,
    summary: (row.summary as Record<string, unknown>) ?? {},
    publicUrl: row.public_url ?? "",
    storagePath: row.storage_path ?? "",
    createdAt: row.created_at,
  };
}

export async function loadParentReports(signal?: AbortSignal): Promise<ParentReport[]> {
  const supabase = getSupabase();
  const p = await profile();
  if (!supabase || !p?.family_code) return [];
  let query = supabase.from("parent_reports").select("*").eq("family_code", p.family_code).order("month", { ascending: false });
  if (signal) query = query.abortSignal(signal);
  const { data } = await query;
  return (data ?? []).map(mapReport);
}

/* ------------------------------------------------------ encouragement notes */

export interface EncouragementNote {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorRole: "player" | "parent";
}

// Two sequential queries here are unavoidable, not a fixable waterfall —
// the second (who wrote each note) depends on parent_ids only known after
// the first resolves.
export async function loadEncouragementNotes(signal?: AbortSignal): Promise<EncouragementNote[]> {
  const supabase = getSupabase();
  const p = await profile();
  if (!supabase || !p?.family_code) return [];
  let notesQuery = supabase
    .from("encouragement_notes")
    .select("*")
    .eq("family_code", p.family_code)
    .order("created_at", { ascending: false });
  if (signal) notesQuery = notesQuery.abortSignal(signal);
  const { data } = await notesQuery;
  const authorIds = [...new Set((data ?? []).map((row) => row.parent_id).filter(Boolean))];
  let authors = new Map<string, { name: string; role: "player" | "parent" }>();
  if (authorIds.length) {
    let authorQuery = supabase.from("profiles").select("id,name,role").in("id", authorIds);
    if (signal) authorQuery = authorQuery.abortSignal(signal);
    const { data: profileRows } = await authorQuery;
    authors = new Map(
      (profileRows ?? []).map((row) => [
        row.id,
        { name: row.name ?? "Family member", role: (row.role ?? "parent") as "player" | "parent" },
      ])
    );
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorName: authors.get(row.parent_id)?.name ?? "Family member",
    authorRole: authors.get(row.parent_id)?.role ?? "parent",
  }));
}

export async function saveEncouragementNote(body: string) {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id || !p?.family_code) return;
  await supabase.from("encouragement_notes").insert({
    family_code: p.family_code,
    parent_id: id,
    player_id: p.role === "player" ? id : null,
    body,
  });
}

/* --------------------------------------------------------- cost calculator */

export interface CostInputs {
  yearsRemaining: number;
  tournamentsPerYear: number;
  coachingHoursPerWeek: number;
  lessonRate: number;
  equipmentBudgetPerYear: number;
  travelCostPerTournament: number;
  targetSchools: { name: string; division: string; annualCost: number; scholarshipPercent: number }[];
}

export interface CostResults {
  coaching: number;
  tournaments: number;
  equipment: number;
  total: number;
  scholarships: { name: string; scholarshipValue: number; netCost: number }[];
}

export interface CostCalculation {
  id: string;
  name: string;
  inputs: CostInputs;
  results: CostResults;
  createdAt: string;
}

function mapCost(row: Tables<"cost_calculations">): CostCalculation {
  return {
    id: row.id,
    name: row.name,
    inputs: row.inputs as unknown as CostInputs,
    results: row.results as unknown as CostResults,
    createdAt: row.created_at,
  };
}

export function calculateCost(input: CostInputs): CostResults {
  const coaching = input.coachingHoursPerWeek * input.lessonRate * 52 * input.yearsRemaining;
  const tournaments = input.tournamentsPerYear * input.travelCostPerTournament * input.yearsRemaining;
  const equipment = input.equipmentBudgetPerYear * input.yearsRemaining;
  const total = coaching + tournaments + equipment;
  const scholarships = input.targetSchools.map((s) => {
    const scholarshipValue = s.annualCost * input.yearsRemaining * (s.scholarshipPercent / 100);
    return { name: s.name, scholarshipValue, netCost: Math.max(0, total - scholarshipValue) };
  });
  return { coaching, tournaments, equipment, total, scholarships };
}

export async function saveCostCalculation(input: CostInputs, name = "College tennis pursuit"): Promise<CostCalculation | null> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return null;
  const results = calculateCost(input);
  const { data, error } = await supabase
    .from("cost_calculations")
    .insert({
      user_id: id,
      family_code: p?.family_code ?? null,
      name,
      inputs: input as unknown as Json,
      results: results as unknown as Json,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapCost(data);
}

// The cost calculator view only ever renders the 4 most recent saved
// projections (saved.slice(0, 4)) — there's no "view all" screen, so fetch
// no more than the UI can show instead of pulling every projection a user
// has ever saved.
export async function loadCostCalculations(signal?: AbortSignal): Promise<CostCalculation[]> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return [];
  let query = supabase.from("cost_calculations").select("*").order("created_at", { ascending: false }).limit(4);
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
  if (signal) query = query.abortSignal(signal);
  const { data } = await query;
  return (data ?? []).map(mapCost);
}

/* ------------------------------------------------------------ season budget */
// Real storage for /family's "Season budget" card (migration
// 015_family_overview_and_budget.sql — not yet applied to the live
// database; both loaders below degrade to an honest empty value until it
// is, same discipline as loadTournamentEntries/loadCoachOutreachDated's
// siblings). `season_budgets` holds the one editable total per family;
// `budget_expenses` holds freeform costs (camps, gear, anything that isn't
// a scored tournament_entries row) a parent logs via "Add expense".

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
 * lib/db/events.ts's validateTournamentEntryInput — usable from tests
 * without a live database. */
export function validateBudgetExpenseInput(input: NewBudgetExpenseInput): string | null {
  if (!input.label || !input.label.trim()) return "A short description is required.";
  if (!BUDGET_EXPENSE_CATEGORIES.includes(input.category)) return "Choose a valid category.";
  if (!Number.isFinite(input.amount) || input.amount < 0) return "Cost can't be negative.";
  if (!input.expenseDate || Number.isNaN(Date.parse(input.expenseDate))) {
    return "Enter a valid date.";
  }
  return null;
}

function mapSeasonBudget(row: Tables<"season_budgets">): SeasonBudget {
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

/** Used ONLY by app/api/family/budget*'s route handlers, which pass their
 * own request-scoped, RLS-respecting client + already-authenticated user
 * id/family code — `saveSeasonBudget`/`saveBudgetExpense` below use this to
 * do the real Supabase write server-side. There's no browser-direct write
 * path left for either function (see each one's doc comment) — passing
 * `ctx` is how the route handler reaches the same upsert/insert logic
 * without duplicating it. */
export interface FamilyWriteContext {
  supabase: TypedSupabaseClient;
  userId: string;
  familyCode: string;
}

/** Upserts the family's one season-budget row (by family_code) — real
 * action behind /family's "Edit budget" — parent/family-owned data, never
 * a player-owned field. The browser never calls the Supabase upsert
 * directly: without `ctx` (every real UI call site), this instead posts to
 * app/api/family/budget, the zod-validated route handler that supplies
 * `ctx` and performs the actual write — same contract (resolves with the
 * saved budget, throws with a specific message on failure) the UI's
 * existing `catch (err) { setError(err.message) }` already expects. */
export async function saveSeasonBudget(
  input: { seasonLabel: string; totalBudget: number },
  ctx?: FamilyWriteContext
): Promise<SeasonBudget | null> {
  if (!Number.isFinite(input.totalBudget) || input.totalBudget < 0) {
    throw new Error("Budget total can't be negative.");
  }
  if (!input.seasonLabel.trim()) throw new Error("Season label is required.");

  if (!ctx) {
    const { postJson } = await import("@/lib/api-client");
    const { budget } = await postJson<{ budget: SeasonBudget | null }>("/api/family/budget", input);
    return budget;
  }

  const { data, error } = await ctx.supabase
    .from("season_budgets")
    .upsert(
      {
        family_code: ctx.familyCode,
        season_label: input.seasonLabel.trim(),
        total_budget: input.totalBudget,
        updated_by: ctx.userId,
      },
      { onConflict: "family_code" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapSeasonBudget(data);
}

function mapBudgetExpense(row: Tables<"budget_expenses">): BudgetExpense {
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

/** The real action behind /family's "Add expense" — parent/family-owned
 * data (season spend), never a player-owned field. Same "no browser-direct
 * write" shape as saveSeasonBudget above: without `ctx`, this posts to the
 * zod-validated app/api/family/budget/expenses route instead of writing to
 * Supabase itself. */
export async function saveBudgetExpense(
  input: NewBudgetExpenseInput,
  ctx?: FamilyWriteContext
): Promise<BudgetExpense | null> {
  const validationError = validateBudgetExpenseInput(input);
  if (validationError) throw new Error(validationError);

  if (!ctx) {
    const { postJson } = await import("@/lib/api-client");
    const { expense } = await postJson<{ expense: BudgetExpense | null }>(
      "/api/family/budget/expenses",
      input
    );
    return expense;
  }

  const { data, error } = await ctx.supabase
    .from("budget_expenses")
    .insert({
      family_code: ctx.familyCode,
      created_by: ctx.userId,
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
