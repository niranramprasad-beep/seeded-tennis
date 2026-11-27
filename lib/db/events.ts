// Real data access behind /events: logged match results and tracked/entered
// tournaments. The training calendar is lib/db/training.ts.
// Moved verbatim from the former lib/supabase/features.ts's matches
// section, lib/supabase/tournaments.ts, and lib/supabase/training.ts —
// /events is the one real page that renders all three (recent results,
// upcoming tournaments, training calendar), which is why they're
// consolidated here rather than split further.
import { isCalendarDateKey } from "@/lib/time";
import { TOURNAMENT_STATUS_VALUES, type TournamentEntryStatus } from "@/lib/tournament-status";
import { LEVELS, UTR_MAX, UTR_MIN, type FitLevel } from "@/lib/tournament-fit";
import { MAX_BUDGET_EXPENSE_USD } from "@/lib/budget-limits";
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import { resolveMyFamilyCode, subjectUserIds, type DataSubject } from "./family-scope";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { narrowLiteral, narrowNullableLiteral } from "./narrow";
import type { Json, Tables } from "./database.types";
import { DatabaseWriteError } from "./write-error";

/** Used ONLY by app/api/matches' route handler, which passes its own
 * request-scoped, RLS-respecting client + already-authenticated user id +
 * family code (matches can belong to a family, not just the signed-in
 * user). saveMatch/deleteMatch below use this to do the real Supabase
 * write server-side; there's no browser-direct write path left for either
 * (see each function's own doc comment). */
export interface EventsWriteContext {
  supabase: TypedSupabaseClient;
  userId: string;
  familyCode: string | null;
}

// text columns backed only by a Postgres CHECK constraint — see
// lib/db/narrow.ts's header for why these need narrowing back down from
// the generated `string` type rather than widening the app-level type.
const SURFACES: MatchRecord["surface"][] = ["hard", "clay", "grass", "indoor"];
const MATCH_RESULTS: NonNullable<MatchRecord["result"]>[] = ["win", "loss"];
const FIT_LEVELS: FitLevel[] = LEVELS.map((l) => l.value);

async function userId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

async function userIdAndProfile(): Promise<{ id: string | null; profile: Tables<"profiles"> | null }> {
  const supabase = getSupabase();
  if (!supabase) return { id: null, profile: null };
  const { data: userData } = await getAuthedUser(supabase);
  const id = userData.user?.id ?? null;
  if (!id) return { id: null, profile: null };
  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return { id, profile: profileData };
}

/* --------------------------------------------------------------- matches */

export interface MatchRecord {
  id: string;
  matchDate: string;
  opponent: string;
  opponentUtr: number | null;
  tournamentName: string;
  surface: "hard" | "clay" | "grass" | "indoor";
  prepPlan: PrepPlan;
  notificationRequested: boolean;
  result: "win" | "loss" | null;
  score: string;
  worked: string;
  needsWork: string;
  notes: string;
  videoUrl: string;
  aiAnalysis: MatchAnalysis | null;
}

export interface PrepPlan {
  warmup: string[];
  tactics: string[];
  mental: string[];
  matchDay: string[];
  generatedAt: string;
}

export interface MatchAnalysis {
  summary: string;
  takeaways: string[];
  drills: string[];
  nextWeekFocus: string;
  source: "ai" | "fallback";
}

/** What a match row's NOT NULL `prep_plan` column holds now. It used to be
 * filled by `generatePrepPlan()` — a warm-up, tactics and a packing list
 * Seeded wrote from a template for every match logged, shown on /match-mode
 * as the player's "prep plan". Match mode is gone and so is the generator
 * (docs/DECISIONS.md, 2026-11-18); nothing renders this field. */
export function emptyPrepPlan(): PrepPlan {
  return { warmup: [], tactics: [], mental: [], matchDay: [], generatedAt: new Date().toISOString() };
}

// "All time" is a real filter option in the match history view, so this
// can't be date-range limited the way daily_checkins is — but it had NO
// ceiling at all before, meaning a multi-year player's history would load
// in full on every visit to /matches, /coaches, and /badges. 500 is far
// beyond any realistic high-school career's match count (ordered newest
// first, so if it's ever hit, only the oldest, least-relevant matches are
// the ones left out).
const MATCHES_LIMIT = 500;

function mapMatch(row: Tables<"matches">): MatchRecord {
  return {
    id: row.id,
    matchDate: row.match_date,
    opponent: row.opponent ?? "",
    opponentUtr: row.opponent_utr == null ? null : Number(row.opponent_utr),
    tournamentName: row.tournament_name ?? "",
    surface: narrowLiteral(row.surface, SURFACES, "hard"),
    prepPlan:
      (row.prep_plan as unknown as PrepPlan) ?? {
        warmup: [],
        tactics: [],
        mental: [],
        matchDay: [],
        generatedAt: row.created_at,
      },
    notificationRequested: row.notification_requested,
    result: narrowNullableLiteral(row.result, MATCH_RESULTS),
    score: row.score ?? "",
    worked: row.worked ?? "",
    needsWork: row.needs_work ?? "",
    notes: row.notes ?? "",
    videoUrl: row.video_url ?? "",
    aiAnalysis: (row.ai_analysis as unknown as MatchAnalysis | null) ?? null,
  };
}

export async function loadMatches(subject: DataSubject = "self", signal?: AbortSignal): Promise<MatchRecord[]> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return [];
  let query = supabase
    .from("matches")
    .select("*")
    .order("match_date", { ascending: false })
    .limit(MATCHES_LIMIT);
  // `my_family_code()`, not `p.family_code`: the latter is NULL for anyone
  // who joined with a code, so a joined parent saw only their own rows
  // (i.e. none) instead of the family's. See migration 036.
  // Scope by OWNER, not by the row's stamped family_code. A row a joiner
  // wrote while their request was still PENDING is stamped NULL for ever
  // (036's trigger freezes the column on UPDATE), so a family_code filter
  // hides it from their family permanently. The read policy keys off the
  // owner for the same reason — this makes the query match the policy.
  const subjectIds = await subjectUserIds(supabase, id, subject, signal);
  if (subjectIds.length === 0) return [];
  query = query.in("user_id", subjectIds);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map(mapMatch);
}

export type SaveMatchInput = Partial<MatchRecord> & {
  matchDate: string;
  surface: MatchRecord["surface"];
};

function matchRowFromInput(match: SaveMatchInput, ctx: EventsWriteContext) {
  return {
    id: match.id,
    user_id: ctx.userId,
    family_code: ctx.familyCode,
    match_date: match.matchDate,
    opponent: match.opponent || null,
    opponent_utr: match.opponentUtr ?? null,
    tournament_name: match.tournamentName || null,
    surface: match.surface,
    prep_plan: (match.prepPlan ?? emptyPrepPlan()) as unknown as Json,
    notification_requested: Boolean(match.notificationRequested),
    result: match.result ?? null,
    score: match.score || null,
    worked: match.worked || null,
    needs_work: match.needsWork || null,
    notes: match.notes || null,
    video_url: match.videoUrl || null,
    ai_analysis: (match.aiAnalysis as unknown as Json) ?? null,
  };
}

/**
 * Saves (adds, or updates when `.id` is passed) a logged match — the real
 * action behind the result form (components/matches/match-result-form.tsx,
 * on /matches and /events) and Today's Sunday check-in. The browser never calls the
 * Supabase upsert directly: without `ctx` (every real UI call site), this
 * instead posts to app/api/matches, the zod-validated route handler that
 * supplies `ctx` and performs the actual write — same contract (resolves
 * with the saved match, null when there's no signed-in session to save
 * against, throws with a specific message on a real write failure) every
 * existing caller already expects.
 */
export async function saveMatch(
  match: SaveMatchInput,
  ctx?: EventsWriteContext
): Promise<MatchRecord | null> {
  if (!ctx) {
    const ownerId = await userId();
    if (!ownerId) return null;
    const { postJson } = await import("@/lib/api-client");
    const { match: saved } = await postJson<{ match: MatchRecord | null }>("/api/matches", {
      kind: "save",
      ...match,
    });
    return saved;
  }

  const { data, error } = await ctx.supabase
    .from("matches")
    .upsert(matchRowFromInput(match, ctx))
    .select("*")
    .single();
  if (error) throw new DatabaseWriteError(error);
  return mapMatch(data);
}

/** Deletes a logged match — real action behind /matches' delete button
 * (whose Undo re-saves the same record). Same "no browser-direct
 * write" shape as saveMatch above: without `ctx`, this posts to the
 * zod-validated app/api/matches route instead of writing to Supabase
 * itself. */
export async function deleteMatch(id: string, ctx?: EventsWriteContext): Promise<void> {
  if (!ctx) {
    const ownerId = await userId();
    if (!ownerId) return;
    const { postJson } = await import("@/lib/api-client");
    await postJson("/api/matches", { kind: "delete", id });
    return;
  }

  const { error } = await ctx.supabase.from("matches").delete().eq("id", id).eq("user_id", ctx.userId);
  if (error) throw new DatabaseWriteError(error);
}

/* --------------------------------------------------------- tournament entries */
// Real storage for tournaments a family is tracking, has entered or has
// played — the "Upcoming tournaments" list on /events. Backed by
// `tournament_entries` (migration 013; 'played' added by 047).

// Status values and labels live in lib/tournament-status.ts (pure).
export {
  TOURNAMENT_STATUSES,
  tournamentStatusLabel,
  type TournamentEntryStatus,
} from "@/lib/tournament-status";

export interface TournamentEntry {
  id: string;
  /** Whose entry this is. The family budget pools every player's entries,
   *  so a fit verdict must know whose rating to judge it against. */
  userId: string;
  name: string;
  level: FitLevel;
  eventDate: string; // ISO date (yyyy-mm-dd)
  city: string;
  state: string;
  travelHours: number | null;
  distanceMiles: number | null;
  drawUtr: number | null;
  goalUtr: number | null;
  entryCost: number | null;
  travelCost: number | null;
  status: TournamentEntryStatus;
  createdAt: string;
}

export interface NewTournamentEntryInput {
  name: string;
  level: FitLevel;
  eventDate: string;
  /** Optional — blank is stored as NULL. Nothing computes from the place;
   *  travel time is its own field. */
  city?: string | null;
  state?: string | null;
  travelHours?: number | null;
  distanceMiles?: number | null;
  drawUtr?: number | null;
  goalUtr?: number | null;
  entryCost?: number | null;
  travelCost?: number | null;
}

/** A real calendar date written as YYYY-MM-DD — what `<input type="date">`
 *  produces and what the `event_date date` column stores. Checked from its
 *  parts, never `new Date("YYYY-MM-DD")` (that reads it as UTC midnight). */
export { isCalendarDateKey } from "@/lib/time";

/**
 * The exact `tournament_entries` row a save sends. Pure, so the columns are
 * pinned by a test (lib/db/events.test.ts) rather than discovered at runtime.
 * `id` is only present for an update — an insert lets the column default
 * (gen_random_uuid()) choose it. `family_code` is whatever my_family_code()
 * answered; 036's stamp_family_code trigger sets it authoritatively anyway.
 */
export function buildTournamentEntryRow(
  input: NewTournamentEntryInput & { id?: string; status?: TournamentEntryStatus },
  ownerId: string,
  familyCode: string | null
) {
  return {
    ...(input.id ? { id: input.id } : {}),
    user_id: ownerId,
    family_code: familyCode,
    name: input.name.trim(),
    level: input.level,
    event_date: input.eventDate,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    travel_hours: input.travelHours ?? null,
    distance_miles: input.distanceMiles ?? null,
    draw_utr: input.drawUtr ?? null,
    goal_utr: input.goalUtr ?? null,
    entry_cost: input.entryCost ?? null,
    travel_cost: input.travelCost ?? null,
    // An edit (id, no status) leaves the stored status alone — the edit form
    // must never quietly move an Entered tournament back to Planning.
    ...(input.status || !input.id ? { status: input.status ?? ("saved" as TournamentEntryStatus) } : {}),
  };
}

/**
 * A save that did not happen, in words a family can act on. The raw
 * PostgREST message ("new row violates row-level security policy for table
 * \"tournament_entries\"") is kept on `detail` for logs, never shown.
 */
export class TournamentSaveError extends Error {
  readonly code: string | null;
  readonly detail: string | null;
  constructor(message: string, code: string | null = null, detail: string | null = null) {
    super(message);
    this.name = "TournamentSaveError";
    this.code = code;
    this.detail = detail;
  }
}

export function tournamentSaveErrorMessage(error: { code?: string | null; message?: string | null }): string {
  switch (error.code) {
    case "53400":
      // 034's rate limit. Its own message is already plain words.
      return "Too many changes at once. Wait a few minutes, then try again.";
    case "42501":
      // RLS refused the row: an inactive account (under-13 awaiting a
      // parent's consent) or a session that no longer matches the owner.
      return "Seeded couldn't save this to your account. Sign out and back in, then try again. If it keeps happening, email support.";
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
      return "One of the details isn't valid. Check the date, the costs and the level, then try again.";
    default:
      return "Couldn't save this tournament. Check your connection and try again.";
  }
}

// Upper limits under each column's capacity (tournament_entries.travel_hours
// numeric(5,2), distance_miles numeric(6,1), entry_cost/travel_cost
// numeric(8,2) — read from production 2026-11-24). Without them a huge number
// passed every check here and the database refused it with 22003, the same
// "Try again" for ever that lib/budget-limits.ts fixed for the budget.
// A cost uses the single-expense limit so a tournament can always be logged
// as one budget expense.
export const MAX_TOURNAMENT_TRAVEL_HOURS = 200;
export const MAX_TOURNAMENT_DISTANCE_MILES = 25_000;

/** The input a tournament-entry problem is about, so a form can mark that
 *  field, put the message beside it and move focus to it (bug hunt BUG-010:
 *  the message used to land in a box above the buttons with focus left on
 *  Save, and nothing said which of three number fields it meant). */
export type TournamentEntryField =
  | "name"
  | "level"
  | "eventDate"
  | "drawUtr"
  | "goalUtr"
  | "travelHours"
  | "distanceMiles"
  | "entryCost"
  | "travelCost";

export interface TournamentEntryProblem {
  field: TournamentEntryField;
  message: string;
}

/**
 * Validates a tournament-entry save before it ever reaches Supabase. Pure —
 * no network, no auth — so both /events and the (separately rebuilt)
 * Tournament Fit screen's "Add to my events" button can check an entry
 * client-side before calling saveTournamentEntry, and so this logic is
 * unit-testable without a live database. Returns the first problem, with the
 * field it is about and a user-facing sentence, or null when the input is valid.
 */
export function tournamentEntryProblem(input: NewTournamentEntryInput): TournamentEntryProblem | null {
  if (!input.name || !input.name.trim()) return { field: "name", message: "Tournament name is required." };
  if (!LEVELS.some((l) => l.value === input.level)) return { field: "level", message: "Choose a valid tournament level." };
  if (!isCalendarDateKey(input.eventDate)) return { field: "eventDate", message: "Enter a valid tournament date." };
  // City and state are optional (PR D, D4): nothing in Seeded computes from
  // the place, and asking for them blocked "Add to my events" for no reason.

  const utrFields: [TournamentEntryField, string, number | null | undefined][] = [
    ["drawUtr", "Draw UTR", input.drawUtr],
    ["goalUtr", "Goal UTR", input.goalUtr],
  ];
  for (const [field, label, value] of utrFields) {
    if (value != null && (!Number.isFinite(value) || value < UTR_MIN || value > UTR_MAX)) {
      return { field, message: `${label} must be between ${UTR_MIN} and ${UTR_MAX}.` };
    }
  }

  const nonNegativeFields: [TournamentEntryField, string, number | null | undefined][] = [
    ["travelHours", "Travel hours", input.travelHours],
    ["distanceMiles", "Distance", input.distanceMiles],
    ["entryCost", "Entry cost", input.entryCost],
    ["travelCost", "Travel cost", input.travelCost],
  ];
  for (const [field, label, value] of nonNegativeFields) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      return { field, message: `${label} can't be negative.` };
    }
  }

  const upperLimits: [TournamentEntryField, number | null | undefined, number, string][] = [
    ["travelHours", input.travelHours, MAX_TOURNAMENT_TRAVEL_HOURS, `Travel hours can be at most ${MAX_TOURNAMENT_TRAVEL_HOURS}.`],
    ["distanceMiles", input.distanceMiles, MAX_TOURNAMENT_DISTANCE_MILES, `Distance can be at most ${MAX_TOURNAMENT_DISTANCE_MILES.toLocaleString("en-US")} miles.`],
    ["entryCost", input.entryCost, MAX_BUDGET_EXPENSE_USD, `Entry cost can be at most $${MAX_BUDGET_EXPENSE_USD.toLocaleString("en-US")}.`],
    ["travelCost", input.travelCost, MAX_BUDGET_EXPENSE_USD, `Travel cost can be at most $${MAX_BUDGET_EXPENSE_USD.toLocaleString("en-US")}.`],
  ];
  for (const [field, value, max, message] of upperLimits) {
    if (value != null && value > max) return { field, message };
  }

  return null;
}

/** tournamentEntryProblem()'s sentence alone — a user-facing error string, or
 *  null when the input is valid. */
export function validateTournamentEntryInput(input: NewTournamentEntryInput): string | null {
  return tournamentEntryProblem(input)?.message ?? null;
}

function mapTournamentEntry(row: Tables<"tournament_entries">): TournamentEntry {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    // "utr" is the one FitLevel value that doesn't assert a specific USTA
    // tier, making it the honest fallback for a row whose stored level
    // somehow isn't one of LEVELS' real values.
    level: narrowLiteral(row.level, FIT_LEVELS, "utr"),
    eventDate: row.event_date,
    city: row.city ?? "",
    state: row.state ?? "",
    travelHours: row.travel_hours == null ? null : Number(row.travel_hours),
    distanceMiles: row.distance_miles == null ? null : Number(row.distance_miles),
    drawUtr: row.draw_utr == null ? null : Number(row.draw_utr),
    goalUtr: row.goal_utr == null ? null : Number(row.goal_utr),
    entryCost: row.entry_cost == null ? null : Number(row.entry_cost),
    travelCost: row.travel_cost == null ? null : Number(row.travel_cost),
    status: narrowLiteral(row.status, TOURNAMENT_STATUS_VALUES, "saved"),
    createdAt: row.created_at,
  };
}

/**
 * Loads the signed-in player's (or their family's) saved/entered
 * tournaments, soonest first, for /events' "Upcoming tournaments" list.
 */
export async function loadTournamentEntries(
  subject: DataSubject = "self",
  signal?: AbortSignal
): Promise<TournamentEntry[]> {
  return readTournamentEntries(subject, signal);
}

async function readTournamentEntries(
  subject: DataSubject,
  signal: AbortSignal | undefined
): Promise<TournamentEntry[]> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return [];
  let query = supabase
    .from("tournament_entries")
    .select("*")
    .order("event_date", { ascending: true });
  // `my_family_code()`, not `p.family_code`: the latter is NULL for anyone
  // who joined with a code, so a joined parent saw only their own rows
  // (i.e. none) instead of the family's. See migration 036.
  // Scope by OWNER, not by the row's stamped family_code. A row a joiner
  // wrote while their request was still PENDING is stamped NULL for ever
  // (036's trigger freezes the column on UPDATE), so a family_code filter
  // hides it from their family permanently. The read policy keys off the
  // owner for the same reason — this makes the query match the policy.
  const subjectIds = await subjectUserIds(supabase, id, subject, signal);
  if (subjectIds.length === 0) return [];
  query = query.in("user_id", subjectIds);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map(mapTournamentEntry);
}

/**
 * Saves (adds, or updates when `id` is passed) a tournament the player is
 * tracking or has entered. This is the single real write path behind
 * /events' own "Upcoming tournaments" list — and it's the function the
 * (separately rebuilt) Tournament Fit screen's "Add to my events" button
 * should call, passing the same tournament it just scored with
 * evaluateTournamentFit, so the two screens never disagree about what
 * "saved" means.
 *
 * Every outcome is either the saved row or a thrown error with a message a
 * family can read — never a silent no-op. It used to return null when no
 * signed-in user was found and throw the raw PostgREST message otherwise;
 * the Tournament Fit drawer could show neither well (production sweep C3).
 * Validation failures throw a TournamentSaveError with code "invalid".
 */
export async function saveTournamentEntry(
  input: NewTournamentEntryInput & { id?: string; status?: TournamentEntryStatus }
): Promise<TournamentEntry> {
  const validationError = validateTournamentEntryInput(input);
  if (validationError) throw new TournamentSaveError(validationError, "invalid");

  const supabase = getSupabase();
  const { id: ownerId } = await userIdAndProfile();
  if (!supabase || !ownerId) {
    throw new TournamentSaveError("You're signed out. Sign in again to save this tournament.", "signed-out");
  }

  // 036's stamp_family_code trigger sets this authoritatively on INSERT and
  // freezes it on UPDATE; sending the resolved value keeps the two in step.
  const familyCode = await resolveMyFamilyCode(supabase);
  const row = buildTournamentEntryRow(input, ownerId, familyCode);

  // A new entry is a plain INSERT. upsert() was used for both, which asks
  // PostgREST for ON CONFLICT DO UPDATE — an UPDATE path a new row never
  // needs, and one more policy (and the BEFORE UPDATE triggers) a brand-new
  // save had to satisfy (CLAUDE.md: an .upsert() fires BEFORE INSERT
  // triggers even when the row exists, and vice versa).
  const { data, error } = input.id
    ? await supabase
        .from("tournament_entries")
        .update(row)
        .eq("id", input.id)
        .eq("user_id", ownerId)
        .select("*")
        .single()
    : await supabase.from("tournament_entries").insert(row).select("*").single();
  if (error) {
    throw new TournamentSaveError(tournamentSaveErrorMessage(error), error.code ?? null, error.message ?? null);
  }
  if (!data) throw new TournamentSaveError(tournamentSaveErrorMessage({}), null, "no row returned");
  return mapTournamentEntry(data);
}

/**
 * Sets a tournament's status — the Planning / Entered / Played control on
 * /events. A thin update rather than a full saveTournamentEntry() call so
 * changing status never risks clobbering the rest of a row with stale
 * client state. Failures throw a TournamentSaveError in plain words.
 */
export async function setTournamentEntryStatus(id: string, status: TournamentEntryStatus): Promise<void> {
  const supabase = getSupabase();
  const { id: ownerId } = await userIdAndProfile();
  if (!supabase || !ownerId) {
    throw new TournamentSaveError("You're signed out. Sign in again to change this tournament.", "signed-out");
  }
  const { error } = await supabase
    .from("tournament_entries")
    .update({ status })
    .eq("id", id)
    .eq("user_id", ownerId);
  if (error) throw new TournamentSaveError(tournamentSaveErrorMessage(error), error.code ?? null, error.message ?? null);
}

/** Removes a tracked tournament — /events' Remove, whose Undo calls
 *  restoreTournamentEntry() with the same record. */
export async function deleteTournamentEntry(id: string): Promise<void> {
  const supabase = getSupabase();
  const { id: ownerId } = await userIdAndProfile();
  if (!supabase || !ownerId) {
    throw new TournamentSaveError("You're signed out. Sign in again to remove this tournament.", "signed-out");
  }
  const { error } = await supabase.from("tournament_entries").delete().eq("id", id).eq("user_id", ownerId);
  if (error) {
    throw new TournamentSaveError(
      error.code === "53400"
        ? tournamentSaveErrorMessage(error)
        : "Couldn't remove this tournament. Check your connection and try again.",
      error.code ?? null,
      error.message ?? null
    );
  }
}

/**
 * Undo for a removal: re-inserts the same record under the same id and
 * status. Same pattern as /matches' Undo, which re-saves the deleted match.
 */
export async function restoreTournamentEntry(entry: TournamentEntry): Promise<TournamentEntry> {
  const supabase = getSupabase();
  const { id: ownerId } = await userIdAndProfile();
  if (!supabase || !ownerId) {
    throw new TournamentSaveError("You're signed out. Sign in again to restore this tournament.", "signed-out");
  }
  const familyCode = await resolveMyFamilyCode(supabase);
  const row = buildTournamentEntryRow(entry, ownerId, familyCode);
  const { data, error } = await supabase.from("tournament_entries").insert(row).select("*").single();
  if (error) throw new TournamentSaveError(tournamentSaveErrorMessage(error), error.code ?? null, error.message ?? null);
  if (!data) throw new TournamentSaveError(tournamentSaveErrorMessage({}), null, "no row returned");
  return mapTournamentEntry(data);
}
