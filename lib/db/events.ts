// Real data access behind /events: logged match results, tracked/entered
// tournaments, and the player's own recurring training-session calendar.
// Moved verbatim from the former lib/supabase/features.ts's matches
// section, lib/supabase/tournaments.ts, and lib/supabase/training.ts —
// /events is the one real page that renders all three (recent results,
// upcoming tournaments, training calendar), which is why they're
// consolidated here rather than split further.
import type { Weakness, Intensity, WeekdayShort } from "@/lib/types";
import { LEVELS, UTR_MAX, UTR_MIN, type FitLevel } from "@/lib/tournament-fit";
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import { resolveMyFamilyCode, subjectUserIds, type DataSubject } from "./family-scope";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { narrowLiteral, narrowNullableLiteral } from "./narrow";
import type { Json, Tables } from "./database.types";

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

/** Same idea as EventsWriteContext, for app/api/training/planner and
 * app/api/training/templates — the training-planner tables
 * (training_plans/workout_sessions/saved_templates/exercises/
 * session_exercises) are strictly user-owned with no family-sharing
 * column, so this context never needs a family code. */
export interface TrainingWriteContext {
  supabase: TypedSupabaseClient;
  userId: string;
}

// text columns backed only by a Postgres CHECK constraint — see
// lib/db/narrow.ts's header for why these need narrowing back down from
// the generated `string` type rather than widening the app-level type.
const SURFACES: MatchRecord["surface"][] = ["hard", "clay", "grass", "indoor"];
const MATCH_RESULTS: NonNullable<MatchRecord["result"]>[] = ["win", "loss"];
const FIT_LEVELS: FitLevel[] = LEVELS.map((l) => l.value);
const INTENSITIES: Intensity[] = ["low", "moderate", "high"];
const TEMPLATE_TYPES: SavedTrainingTemplate["templateType"][] = ["session", "plan"];

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

export function generatePrepPlan(args: {
  weaknesses: Weakness[];
  surface: MatchRecord["surface"];
  currentUtr: number;
  opponentUtr?: number | null;
}): PrepPlan {
  const weak = args.weaknesses.length ? args.weaknesses : ["serve", "mental"];
  const surfaceNote =
    args.surface === "clay"
      ? "Use higher net clearance and build points before changing direction."
      : args.surface === "grass"
        ? "Stay low, shorten backswings, and prioritize first-strike returns."
        : args.surface === "indoor"
          ? "Expect faster timing. Warm up compact returns and first-ball patterns."
          : "Own cross-court depth and be ready for longer neutral rallies.";
  const gap = args.opponentUtr ? args.opponentUtr - args.currentUtr : 0;
  return {
    warmup: [
      "8 minutes dynamic movement: skips, lunges, open hips, shoulder bands.",
      `12 minutes focused reps on ${weak[0]} with low-error targets.`,
      `8 minutes ${weak[1] ?? "serve"} pressure pattern: 3-ball sequences with score calls.`,
      surfaceNote,
    ],
    tactics: [
      gap >= 1
        ? "Opponent is higher rated: make them play one extra ball, target long rallies, and avoid low-percentage line changes early."
        : gap <= -1
          ? "You are higher rated: start assertive, protect service games, and do not give away short neutral balls."
          : "Ratings are close: win the first four shots and track which pattern earns short balls.",
      "Open with high-percentage cross-court patterns until the opponent proves they can hurt you.",
      "Between points, name the next serve/return target before stepping up.",
    ],
    mental: [
      "Sleep target: 8+ hours, phone away 45 minutes before bed.",
      "Visualize three pressure points and your exact between-point reset.",
      "Write one controllable goal: feet active, target margin, or first-serve routine.",
    ],
    matchDay: [
      "Pack: two racquets, grips, towel, hat, sunscreen, bands, extra shirt.",
      "Hydration: bottle plus electrolytes; start sipping before warm-up.",
      "Arrive 45 minutes early and check court surface, wind, and shade.",
      "Start warm-up with margin. Do not judge your game in the first five minutes.",
    ],
    generatedAt: new Date().toISOString(),
  };
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
  prepPlan: PrepPlan;
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
    prep_plan: match.prepPlan as unknown as Json,
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
 * Saves (adds, or updates when `.id` is passed) a logged match or planned
 * match — the real action behind /matches' log form and /events' Match
 * mode (prep plan, result, notification flag). The browser never calls the
 * Supabase upsert directly: without `ctx` (every real UI call site), this
 * instead posts to app/api/matches, the zod-validated route handler that
 * supplies `ctx` and performs the actual write — same contract (resolves
 * with the saved match, null when there's no signed-in session to save
 * against, throws with a specific message on a real write failure) every
 * existing caller (components/matches/match-history-view.tsx,
 * components/matches/match-mode-view.tsx) already expects.
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
  if (error) throw new Error(error.message);
  return mapMatch(data);
}

/** Deletes a logged/planned match — real action behind /matches' delete
 * button and /events' Match mode "Cancel match". Same "no browser-direct
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
  if (error) throw new Error(error.message);
}

export async function uploadMatchVideo(file: File): Promise<string | null> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return null;
  const path = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, "-")}`;
  const { error } = await supabase.storage.from("match-videos").upload(path, file, {
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = await supabase.storage.from("match-videos").createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? path;
}

/* --------------------------------------------------------- tournament entries */
// Real storage for tournaments a family is tracking or has entered — the
// "Upcoming tournaments" list on /events. Backed by `tournament_entries`
// (migration 013_tournament_entries.sql — not yet applied to the live
// database, see that file's header, same discipline as
// 011_outreach_stages.sql). Until the migration is run, loadTournamentEntries
// degrades to [] the same way every other not-yet-existing table does
// elsewhere in this file's siblings (loadMatches, loadDailyCheckins).

export type TournamentEntryStatus = "saved" | "entered";

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
  city: string;
  state: string;
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
export function isCalendarDateKey(value: string | null | undefined): boolean {
  if (!value) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const local = new Date(y, mo - 1, d);
  return local.getFullYear() === y && local.getMonth() === mo - 1 && local.getDate() === d;
}

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
    city: input.city.trim(),
    state: input.state.trim(),
    travel_hours: input.travelHours ?? null,
    distance_miles: input.distanceMiles ?? null,
    draw_utr: input.drawUtr ?? null,
    goal_utr: input.goalUtr ?? null,
    entry_cost: input.entryCost ?? null,
    travel_cost: input.travelCost ?? null,
    status: input.status ?? ("saved" as TournamentEntryStatus),
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

/**
 * Validates a tournament-entry save before it ever reaches Supabase. Pure —
 * no network, no auth — so both /events and the (separately rebuilt)
 * Tournament Fit screen's "Add to my events" button can check an entry
 * client-side before calling saveTournamentEntry, and so this logic is
 * unit-testable without a live database. Returns a user-facing error
 * string, or null when the input is valid.
 */
export function validateTournamentEntryInput(input: NewTournamentEntryInput): string | null {
  if (!input.name || !input.name.trim()) return "Tournament name is required.";
  if (!LEVELS.some((l) => l.value === input.level)) return "Choose a valid tournament level.";
  if (!isCalendarDateKey(input.eventDate)) return "Enter a valid tournament date.";
  if (!input.city || !input.city.trim()) return "City is required.";
  if (!input.state || !input.state.trim()) return "State is required.";

  const utrFields: [string, number | null | undefined][] = [
    ["Draw UTR", input.drawUtr],
    ["Goal UTR", input.goalUtr],
  ];
  for (const [label, value] of utrFields) {
    if (value != null && (!Number.isFinite(value) || value < UTR_MIN || value > UTR_MAX)) {
      return `${label} must be between ${UTR_MIN} and ${UTR_MAX}.`;
    }
  }

  const nonNegativeFields: [string, number | null | undefined][] = [
    ["Travel hours", input.travelHours],
    ["Distance", input.distanceMiles],
    ["Entry cost", input.entryCost],
    ["Travel cost", input.travelCost],
  ];
  for (const [label, value] of nonNegativeFields) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      return `${label} can't be negative.`;
    }
  }

  return null;
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
    status: row.status === "entered" ? "entered" : "saved",
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
 * Flips a saved tournament to "entered" (or back to "saved") — the real
 * action behind /events' Enter/Save buttons. A thin update rather than a
 * full saveTournamentEntry() call so toggling status never risks
 * clobbering the rest of a row with stale client state.
 */
export async function setTournamentEntryStatus(id: string, status: TournamentEntryStatus): Promise<void> {
  const supabase = getSupabase();
  const { id: ownerId } = await userIdAndProfile();
  if (!supabase || !ownerId) return;
  const { error } = await supabase
    .from("tournament_entries")
    .update({ status })
    .eq("id", id)
    .eq("user_id", ownerId);
  if (error) throw new Error(error.message);
}

/** Removes a tracked tournament entirely (not surfaced in /events yet — kept for symmetry with the rest of this module's CRUD). */
export async function deleteTournamentEntry(id: string): Promise<void> {
  const supabase = getSupabase();
  const { id: ownerId } = await userIdAndProfile();
  if (!supabase || !ownerId) return;
  const { error } = await supabase.from("tournament_entries").delete().eq("id", id).eq("user_id", ownerId);
  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------- training planner */
// The player's own editable weekly training calendar (training_plans +
// workout_sessions + exercises/session_exercises) — distinct from the
// static "which plan fits your UTR" catalog in lib/db/plan.ts.

export interface TrainingSessionType {
  id: string;
  label: string;
  color: string;
  bg: string;
  text: string;
}

export interface TrainingPlannerSession {
  id: string;
  title: string;
  typeId: string;
  day: WeekdayShort;
  date: string;
  startTime: string;
  duration: number;
  intensity: Intensity;
  notes: string;
  goals: string;
  drills: string[];
  completed: boolean;
  /** Groups the occurrences generated by the Events calendar card's
   * "repeat weekly" option (lib/training/calendar-interactions.ts's
   * generateWeeklySeriesDates) so the whole series can be removed together.
   * Null/undefined for a one-off session. Stored inside the existing
   * `metadata` jsonb column below rather than a new table column — same
   * "reuse the bag that's already there" call migration
   * 014_profile_fields_and_deletion.sql's header comment made for
   * `notification_preferences`, since `metadata` already holds other
   * session-shaped extras (`drills`) and a plain grouping id needs no
   * indexing or FK integrity to be useful here. */
  seriesId?: string | null;
}

export interface TrainingFolder {
  id: string;
  name: string;
  goal: string;
  sessionIds: string[];
}

export interface TrainingPreferences {
  fullTime: boolean;
  weeklyHours: number;
  primaryGoal: string;
  constraints: string;
}

export interface SavedTrainingTemplate {
  id: string;
  name: string;
  templateType: "session" | "plan";
  description: string;
  payload: Record<string, unknown>;
}

export interface TrainingPlannerState {
  sessions: TrainingPlannerSession[];
  sessionTypes: TrainingSessionType[];
  plans: TrainingFolder[];
  activePlanId: string;
  templates: SavedTrainingTemplate[];
  preferences?: TrainingPreferences;
}

// Reads across 4 tables, each filtered to the signed-in user EXPLICITLY.
//
// This comment used to argue the opposite: the tables are all
// "auth.uid() = user_id" RLS, "so there's nothing gained by resolving the
// user id first and filtering by it ourselves". That is the exact reasoning
// loadUtrEntries() used before migration 036 widened utr_entries' policy and
// it began returning a whole family's ratings (the previous pass's
// CRITICAL). RLS is a ceiling on what may be read; the query must say what
// it means to read, so a future family policy on these tables cannot
// silently put a sibling's sessions on this calendar. (workout_sessions/training_plans don't
// get date-range-limited here: this planner is a recurring weekly
// template, not a dated log — a user's current sessions stay bounded to
// roughly "however many are in their active plan(s)," not an ever-growing
// history, so there's no "visible range" to narrow to the way there is for
// matches/check-ins.)
export async function loadTrainingPlannerState(
  fallback: TrainingPlannerState,
  signal?: AbortSignal
): Promise<TrainingPlannerState | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const withSignal = <T extends { abortSignal: (s: AbortSignal) => T }>(q: T): T =>
    signal ? q.abortSignal(signal) : q;

  // user_settings is queried separately from the other three: `.maybeSingle()`
  // resolves the filter builder into a different (non-chainable) response
  // type that no longer exposes `.abortSignal()`, so the signal has to be
  // attached to the query BEFORE `.maybeSingle()` runs, not after.
  const ownerId = await userId();
  if (!ownerId) return null;
  let settingsQuery = supabase.from("user_settings").select("*").eq("user_id", ownerId);
  if (signal) settingsQuery = settingsQuery.abortSignal(signal);

  const [{ data: plans, error: plansError }, { data: sessions, error: sessionsError }, { data: settings }, { data: templates }] =
    await Promise.all([
      withSignal(supabase.from("training_plans").select("*").eq("user_id", ownerId).order("created_at", { ascending: true })),
      withSignal(supabase.from("workout_sessions").select("*").eq("user_id", ownerId).order("order_index", { ascending: true })),
      settingsQuery.maybeSingle(),
      withSignal(supabase.from("saved_templates").select("*").eq("user_id", ownerId).order("created_at", { ascending: false })),
    ]);

  if (plansError || sessionsError) {
    throw new Error(plansError?.message ?? sessionsError?.message ?? "Could not load training data.");
  }

  if (!plans || plans.length === 0) {
    return fallback;
  }

  const mappedSessions: TrainingPlannerSession[] = (sessions ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    typeId: row.session_type,
    day: (row.weekday ?? "Mon") as WeekdayShort,
    date: row.scheduled_date ?? "",
    startTime: String(row.start_time ?? "16:00").slice(0, 5),
    duration: row.duration_minutes,
    intensity: narrowLiteral(row.intensity, INTENSITIES, "moderate"),
    notes: row.notes ?? "",
    goals: row.goals ?? "",
    drills: ((row.metadata as { drills?: string[] } | null)?.drills ?? []) as string[],
    completed: row.completed,
    seriesId: (row.metadata as { seriesId?: string | null } | null)?.seriesId ?? null,
  }));

  const mappedPlans: TrainingFolder[] = (plans ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    goal: plan.goal ?? "",
    sessionIds: mappedSessions
      .filter((session) =>
        (sessions ?? []).some((row) => row.id === session.id && row.training_plan_id === plan.id)
      )
      .map((session) => session.id),
  }));

  const mappedTemplates: SavedTrainingTemplate[] = (templates ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    templateType: narrowLiteral(t.template_type, TEMPLATE_TYPES, "session"),
    description: t.description ?? "",
    payload: (t.payload as Record<string, unknown> | null) ?? {},
  }));

  const notificationPrefs = settings?.notification_preferences as
    | { session_types?: TrainingSessionType[]; training_preferences?: TrainingPreferences }
    | undefined;
  const sessionTypes = notificationPrefs?.session_types ?? fallback.sessionTypes;
  const preferences = notificationPrefs?.training_preferences ?? fallback.preferences;

  return {
    sessions: mappedSessions,
    sessionTypes,
    plans: mappedPlans,
    activePlanId: (plans ?? []).find((plan) => plan.active)?.id ?? mappedPlans[0]?.id ?? fallback.activePlanId,
    templates: mappedTemplates,
    preferences,
  };
}

/**
 * Persists the player's whole weekly training planner (plans, sessions,
 * their drills/exercises, the session-type palette, and preferences) in
 * one go — the real action behind /training's autosave and the Events
 * calendar card's add/edit/delete/move/resize/repeat (lib/hooks/
 * use-events-calendar.ts's `persist`, which always writes the full next
 * state rather than a per-field patch). The browser never calls the
 * Supabase upsert/delete sequence directly: without `ctx` (every real UI
 * call site), this instead posts to app/api/training/planner, the
 * zod-validated route handler that supplies `ctx` and performs the actual
 * write — same contract (resolves on success, returns early with no
 * network write when there's no signed-in session, throws with a specific
 * message on a real write failure) every existing caller
 * (components/training/training-view.tsx, use-events-calendar.ts's
 * best-effort `.catch(() => undefined)`) already expects.
 */
export async function saveTrainingPlannerState(
  state: TrainingPlannerState,
  ctx?: TrainingWriteContext
): Promise<void> {
  if (!ctx) {
    const ownerId = await userId();
    if (!ownerId) return;
    const { postJson } = await import("@/lib/api-client");
    await postJson("/api/training/planner", state);
    return;
  }

  const { supabase, userId: ownerId } = ctx;

  const planRows = state.plans.map((plan) => ({
    id: plan.id,
    user_id: ownerId,
    name: plan.name,
    goal: plan.goal,
    active: plan.id === state.activePlanId,
    source: "custom" as const,
  }));

  if (planRows.length) {
    const { error } = await supabase.from("training_plans").upsert(planRows);
    if (error) throw new Error(error.message);
  }

  const planBySession = new Map<string, string>();
  state.plans.forEach((plan) =>
    plan.sessionIds.forEach((sessionId) => planBySession.set(sessionId, plan.id))
  );

  const sessionRows = state.sessions
    .filter((session) => planBySession.has(session.id))
    .map((session, index) => ({
      id: session.id,
      user_id: ownerId,
      training_plan_id: planBySession.get(session.id) as string,
      title: session.title,
      session_type: session.typeId,
      scheduled_date: session.date,
      weekday: session.day,
      start_time: session.startTime,
      duration_minutes: session.duration,
      intensity: session.intensity,
      notes: session.notes,
      goals: session.goals,
      completed: session.completed,
      order_index: index,
      metadata: { drills: session.drills, seriesId: session.seriesId ?? null },
    }));

  if (sessionRows.length) {
    const { error } = await supabase.from("workout_sessions").upsert(sessionRows);
    if (error) throw new Error(error.message);
  }

  const sessionIds = state.sessions.map((session) => session.id);
  const planIds = state.plans.map((plan) => plan.id);

  let sessionDelete = supabase.from("workout_sessions").delete().eq("user_id", ownerId);
  if (sessionIds.length) {
    sessionDelete = sessionDelete.not("id", "in", `(${sessionIds.join(",")})`);
  }
  await sessionDelete;

  let planDelete = supabase.from("training_plans").delete().eq("user_id", ownerId);
  if (planIds.length) {
    planDelete = planDelete.not("id", "in", `(${planIds.join(",")})`);
  }
  await planDelete;

  // Read-then-merge: notification_preferences is a shared JSONB bag (also
  // used by lib/db/settings.ts's design-preference section) — a blind
  // overwrite here would silently wipe whatever else is sitting in that
  // same blob on every training autosave.
  const { data: existingSettings } = await supabase
    .from("user_settings")
    .select("notification_preferences")
    .eq("user_id", ownerId)
    .maybeSingle();

  await supabase.from("user_settings").upsert({
    user_id: ownerId,
    default_training_view: "week",
    notification_preferences: {
      ...((existingSettings?.notification_preferences as Record<string, unknown> | undefined) ?? {}),
      session_types: state.sessionTypes,
      training_preferences: state.preferences ?? null,
    } as unknown as Json,
  });

  await syncExercises(state, ctx);
}

/** Saves (adds, or updates when `.id` is passed) one reusable
 * session/plan template — real action behind /training's "Save as
 * template". Same "no browser-direct write" shape as
 * saveTrainingPlannerState above: without `ctx`, this posts to the
 * zod-validated app/api/training/templates route instead of writing to
 * Supabase itself. */
export async function saveTrainingTemplate(
  template: Omit<SavedTrainingTemplate, "id"> & { id?: string },
  ctx?: TrainingWriteContext
): Promise<SavedTrainingTemplate | null> {
  if (!ctx) {
    const ownerId = await userId();
    if (!ownerId) return null;
    const { postJson } = await import("@/lib/api-client");
    const { template: saved } = await postJson<{ template: SavedTrainingTemplate | null }>(
      "/api/training/templates",
      template
    );
    return saved;
  }

  const id = template.id ?? createUuid();
  const { error } = await ctx.supabase.from("saved_templates").upsert({
    id,
    user_id: ctx.userId,
    name: template.name,
    template_type: template.templateType,
    description: template.description,
    payload: template.payload as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return { ...template, id };
}

async function syncExercises(state: TrainingPlannerState, ctx: TrainingWriteContext) {
  const { supabase, userId: ownerId } = ctx;

  for (const session of state.sessions) {
    for (const [index, drill] of session.drills.entries()) {
      const name = drill.trim();
      if (!name) continue;

      const { data: exercise, error } = await supabase
        .from("exercises")
        .upsert(
          {
            user_id: ownerId,
            name,
            exercise_type: session.typeId,
            description: session.goals,
          },
          { onConflict: "user_id,name" }
        )
        .select("id")
        .single();

      if (error || !exercise) continue;

      await supabase.from("session_exercises").upsert({
        user_id: ownerId,
        workout_session_id: session.id,
        exercise_id: exercise.id,
        order_index: index,
        duration_minutes: Math.max(5, Math.round(session.duration / Math.max(1, session.drills.length))),
        notes: session.notes,
      });
    }
  }
}

export function createUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
