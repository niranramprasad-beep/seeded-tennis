// Real data access behind /plan: the recruiting roadmap (derived, not
// stored), UTR history, daily check-ins, the "Recruiting timeline"
// checklist's persisted state, and the static training-plan-by-UTR
// catalog /training's legacy view reads. Consolidates what used to be the
// former lib/data/index.ts's roadmap/training-plan exports, lib/supabase/
// utr.ts, lib/supabase/recruiting-checklist.ts, and daily_checkins' slice
// of lib/supabase/features.ts — same bodies, moved, not rewritten.
import type { Player, RoadmapYear } from "@/lib/types";
import { MILESTONES_BEFORE_GRADE } from "@/lib/config/recruiting";
import { getCurrentGrade, getSummerBeforeGradeYear, isCalendarDateKey, localDateKey, ordinalGrade, startOfLocalDay } from "@/lib/time";
import type { RecruitingChecklistState } from "@/lib/recruiting-checklist";
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import { resolveMyFamilyCode, subjectUserIds, type DataSubject } from "./family-scope";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { UTR_MAX, UTR_MIN } from "@/lib/tournament-fit";
import type { Tables } from "./database.types";

/* ---------------------------------------------------------------- roadmap */

// Pure derivation. Given a player and their plan goal, produce a
// checkpoint-by-checkpoint UTR roadmap. Each checkpoint is the SUMMER BEFORE a
// grade (the recruiting-relevant window), on the straight line from today's
// rating to the goal at the summer before senior year.
//
// The goal comes from lib/fit.ts `resolvePlanGoal` — the one the player set;
// with no goal there is no roadmap (PR D, D1). It used to be
// the floor of the HARDEST target school, so every checkpoint (and /today's
// "Next checkpoint") moved whenever a target was added: 8.90 → 9.0 → 9.50,
// and a default plan needing 3.9 UTR a year (C11, 2026-11-18).
export function buildRoadmap(
  player: Pick<Player, "currentUTR" | "graduationYear">,
  goalUTR: number,
  now: Date = new Date()
): RoadmapYear[] {
  const startGrade = Math.min(getCurrentGrade(player.graduationYear, now), 12);

  // Upcoming summers: before each remaining grade. The final target is always
  // due by the summer before senior year, not during senior year or college.
  const grades: number[] = [];
  for (let g = startGrade + 1; g <= 12; g++) grades.push(g);
  if (grades.length === 0) grades.push(12);

  // The goal UTR must be reached by the SUMMER BEFORE SENIOR YEAR (the summer
  // before 12th grade) — the key recruiting window — then held through to
  // college. So we ramp to the goal at the grade-12 checkpoint, not at college.
  // Progress is by TIME, so every checkpoint sits on one straight line from
  // today to the goal — the line the chart draws. Rounded to the hundredth,
  // the precision a UTR has.
  const goalTime = new Date(getSummerBeforeGradeYear(player.graduationYear, 12), 5, 1).getTime();
  const nowTime = now.getTime();
  return grades.map((g, i) => {
    const calendarYear = getSummerBeforeGradeYear(player.graduationYear, g);
    const at = new Date(calendarYear, 5, 1).getTime();
    const progress = goalTime <= nowTime ? 1 : Math.min(1, Math.max(0, (at - nowTime) / (goalTime - nowTime)));
    const utrTarget =
      Math.round((player.currentUTR + (goalUTR - player.currentUTR) * progress) * 100) / 100;
    const tournamentsNeeded = 10 + i * 2;

    return {
      calendarYear,
      gradeLabel: `By summer before ${ordinalGrade(g)} grade`,
      shortLabel: `${ordinalGrade(g)}`,
      utrTarget,
      tournamentsNeeded,
      milestones: MILESTONES_BEFORE_GRADE[g] ?? [
        "Keep building your UTR steadily",
        "Stay active on the tournament circuit",
        "Refine your school shortlist",
      ],
    };
  });
}


/* ------------------------------------------------------------ utr history */

export interface UtrEntry {
  id: string;
  utr: number;
  recordedAt: string;
  note: string;
}

async function getUserId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

/**
 * One player's UTR history. **Always scoped to a user id, explicitly.**
 *
 * This used to be a bare `select` with no filter, on the reasoning — stated
 * in a comment here — that "utr_entries' RLS policy is exactly
 * `auth.uid() = user_id`, so there's nothing to gain from filtering
 * client-side". That was true when it was written and **migration 036 made
 * it false**: `utr_entries_select_family` lets approved family members read
 * each other's entries, so the query silently started returning the whole
 * family's ratings pooled into one list.
 *
 * What that cost: `/family/weekly-reports` told a parent their child's UTR
 * had fallen **4.40 points this week**. The tile's value was the child's
 * (9.40) and its delta was the newest row in the pooled list (the parent's
 * own 5.00) minus the oldest in range (the child's 9.40). Two different
 * people, subtracted. The same pooled list fed `useFitReport`'s projection
 * input, so the Reach/Out-of-range split on every row of a family member's
 * /schools was regressed over a mix of the family's ratings.
 *
 * RLS is a ceiling on what you MAY read, never a statement of what you
 * MEANT to read. Scope the query.
 */
export async function loadUtrEntries(signal?: AbortSignal): Promise<UtrEntry[]> {
  const userId = await getUserId();
  if (!userId) return [];
  return loadUtrEntriesFor(userId, signal);
}

/**
 * Another family member's UTR history — the parent-facing screens.
 * Deliberately a separate, named function: reading someone else's rating is
 * a decision a caller should have to make on purpose, not something it
 * inherits by forgetting a filter.
 */
export async function loadUtrEntriesFor(
  userId: string,
  signal?: AbortSignal
): Promise<UtrEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from("utr_entries")
    .select("id, utr, recorded_at, note")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: true })
    .order("created_at", { ascending: true });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;

  if (error) {
    // Keep the dashboard usable if the migration has not been applied yet.
    if (error.code === "42P01") return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    utr: Number(entry.utr),
    recordedAt: entry.recorded_at,
    note: entry.note ?? "",
  }));
}

export interface NewUtrEntryInput {
  utr: number;
  recordedAt: string;
  note?: string;
}

/** Pure validation, same "check before it ever reaches Supabase" shape as
 * lib/db/events.ts's validateTournamentEntryInput / lib/db/family.ts's
 * validateBudgetExpenseInput — unit-testable without a live database, and
 * called unconditionally from createUtrEntry below so the same rule is
 * enforced whether the call is about to postJson to the real route or
 * (inside that route) do the actual Supabase write. */
export function validateUtrEntryInput(input: NewUtrEntryInput): string | null {
  if (!Number.isFinite(input.utr) || input.utr < UTR_MIN || input.utr > UTR_MAX) {
    return `UTR must be between ${UTR_MIN} and ${UTR_MAX}.`;
  }
  if (!isCalendarDateKey(input.recordedAt)) {
    return "Enter a valid date.";
  }
  return null;
}

/** Used ONLY by app/api/utr-entries' route handler, which passes its own
 * request-scoped, RLS-respecting client + already-authenticated user id —
 * createUtrEntry below uses this to do the real Supabase write
 * server-side. There's no browser-direct write path left (see
 * createUtrEntry's own doc comment). */
export interface UtrWriteContext {
  supabase: TypedSupabaseClient;
  userId: string;
}

/**
 * Logs a new UTR reading and updates the profile's current_utr to track
 * whichever entry is most recently DATED (never just the one that was
 * logged last) — the real action behind /plan's "Log a new UTR" and
 * /today's Sunday check-in drawer. The browser never calls the Supabase
 * insert directly: without `ctx` (every real UI call site), this instead
 * posts to app/api/utr-entries, the zod-validated route handler that
 * supplies `ctx` and performs the actual write — same contract (resolves
 * with the saved entry, null when there's no signed-in session to save
 * against, throws with a specific message on a real write failure) every
 * existing caller (components/dashboard/dashboard-view.tsx,
 * lib/context/player-context.tsx's completeOnboarding) already expects.
 */
export async function createUtrEntry(
  input: NewUtrEntryInput,
  ctx?: UtrWriteContext
): Promise<UtrEntry | null> {
  const validationError = validateUtrEntryInput(input);
  if (validationError) throw new Error(validationError);

  if (!ctx) {
    const userId = await getUserId();
    if (!userId) return null;
    const { postJson } = await import("@/lib/api-client");
    const { entry } = await postJson<{ entry: UtrEntry | null }>("/api/utr-entries", input);
    return entry;
  }

  const { supabase, userId } = ctx;
  const { data, error } = await supabase
    .from("utr_entries")
    .insert({
      user_id: userId,
      utr: input.utr,
      recorded_at: input.recordedAt,
      note: input.note?.trim() || null,
    })
    .select("id, utr, recorded_at, note")
    .single();

  if (error) throw new Error(error.message);

  // The profile's current_utr must always reflect whichever entry is most
  // recently DATED, not whichever one was just logged — backfilling an
  // older result (e.g. adding a missed April reading after already being
  // ahead of it) must never override a newer value already on record.
  const { data: latest, error: latestError } = await supabase
    .from("utr_entries")
    .select("utr")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestError) throw new Error(latestError.message);

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ current_utr: latest.utr })
    .eq("id", userId);

  if (profileError) throw new Error(profileError.message);

  return {
    id: data.id,
    utr: Number(data.utr),
    recordedAt: data.recorded_at,
    note: data.note ?? "",
  };
}

/* -------------------------------------------------------- daily check-ins */

export type FocusArea =
  | "forehand"
  | "backhand"
  | "serve"
  | "fitness"
  | "mental"
  | "match play"
  | "recovery";

export interface DailyCheckin {
  id: string;
  date: string;
  mood: number;
  focusAreas: FocusArea[];
  notes: string;
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

function mapCheckin(row: Tables<"daily_checkins">): DailyCheckin {
  return {
    id: row.id,
    date: row.checkin_date,
    mood: row.mood,
    focusAreas: (row.focus_areas ?? []) as FocusArea[],
    notes: row.notes ?? "",
  };
}

/** The player's check-ins for the last `days` days (31 by default — what
 * Today's heatmap needs; the check-in history page asks for more). */
export async function loadDailyCheckins(
  subject: DataSubject = "self",
  signal?: AbortSignal,
  days = 31
): Promise<DailyCheckin[]> {
  const supabase = getSupabase();
  const id = await getUserId();
  if (!supabase || !id) return [];
  let query = supabase
    .from("daily_checkins")
    .select("*")
    .gte("checkin_date", localDateKey(new Date(Date.now() - days * 86400000)))
    .order("checkin_date", { ascending: true });
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
  return (data ?? []).map(mapCheckin);
}

export async function saveDailyCheckin(input: {
  mood: number;
  focusAreas: FocusArea[];
  notes: string;
}): Promise<DailyCheckin | null> {
  const supabase = getSupabase();
  const { id } = await userIdAndProfile();
  if (!supabase || !id) return null;
  // 036 stamps family_code in the database; this keeps the sent value in step.
  const familyCode = await resolveMyFamilyCode(supabase);
  const { data, error } = await supabase
    .from("daily_checkins")
    .upsert(
      {
        user_id: id,
        family_code: familyCode,
        checkin_date: localDateKey(),
        mood: input.mood,
        focus_areas: input.focusAreas,
        notes: input.notes || null,
      },
      { onConflict: "user_id,checkin_date" }
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapCheckin(data);
}

export function calculateStreak(checkins: DailyCheckin[]): number {
  const dates = new Set(checkins.map((c) => c.date));
  let streak = 0;
  const cursor = startOfLocalDay(new Date());
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/* ---------------------------------------------------- recruiting checklist */
// Real persisted storage for /plan's recruiting-timeline checklist
// (migration 016_recruiting_checklist.sql). Pure data access — the actual
// default-item list and date math live in lib/recruiting-checklist.ts;
// this module only ever reads/writes the player's own completed/hidden/
// custom-item state.

interface ChecklistRow {
  item_key: string;
  is_custom: boolean;
  label: string | null;
  completed: boolean;
  hidden: boolean;
}

const EMPTY_CHECKLIST_STATE: RecruitingChecklistState = { completedIds: [], hiddenIds: [], customItems: [] };

/** Every row the player has ever touched (checked, hidden, or added as
 * custom) — rows that never diverged from the default (not completed, not
 * hidden) simply don't exist, so an empty table reads as "nothing checked
 * off yet," never an error. */
export async function loadRecruitingChecklistState(
  signal?: AbortSignal
): Promise<RecruitingChecklistState> {
  const supabase = getSupabase();
  const id = await getUserId();
  if (!supabase || !id) return EMPTY_CHECKLIST_STATE;

  let query = supabase
    .from("recruiting_checklist_items")
    .select("item_key, is_custom, label, completed, hidden")
    .eq("user_id", id);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return EMPTY_CHECKLIST_STATE;

  const rows = (data ?? []) as ChecklistRow[];
  const completedIds = rows.filter((r) => r.completed).map((r) => r.item_key);
  const hiddenIds = rows.filter((r) => r.hidden).map((r) => r.item_key);
  const customItems = rows
    .filter((r) => r.is_custom)
    .map((r) => ({ id: r.item_key, label: r.label ?? "" }));

  return { completedIds, hiddenIds, customItems };
}

/** Upserts the full completed/hidden pair for one item — callers always
 * pass both (the caller already holds the merged item from
 * mergeRecruitingChecklist and is only flipping one of the two), so this
 * never has to read-then-merge against a stale row. */
export async function setRecruitingChecklistItemState(
  itemKey: string,
  patch: { completed: boolean; hidden: boolean }
): Promise<boolean> {
  const supabase = getSupabase();
  const id = await getUserId();
  if (!supabase || !id) return false;

  const { error } = await supabase.from("recruiting_checklist_items").upsert(
    {
      user_id: id,
      item_key: itemKey,
      is_custom: false,
      completed: patch.completed,
      hidden: patch.hidden,
    },
    { onConflict: "user_id,item_key" }
  );
  return !error;
}

/** Adds a player-authored checklist item. Returns the real row's item_key
 * (a fresh uuid, not the custom label) so the caller can address it in
 * later toggle/remove calls — null on a real write failure. */
export async function addCustomRecruitingChecklistItem(label: string): Promise<string | null> {
  const supabase = getSupabase();
  const id = await getUserId();
  if (!supabase || !id) return null;

  const itemKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const { error } = await supabase.from("recruiting_checklist_items").insert({
    user_id: id,
    item_key: itemKey,
    is_custom: true,
    label,
    completed: false,
    hidden: false,
  });
  return error ? null : itemKey;
}

/** Permanently deletes a custom item (not just hides it — hiding is for
 * default items the player wants out of view but could reasonably
 * un-hide; a custom item the player removes was their own addition, so a
 * real delete is the honest action). */
export async function removeCustomRecruitingChecklistItem(itemKey: string): Promise<boolean> {
  const supabase = getSupabase();
  const id = await getUserId();
  if (!supabase || !id) return false;

  const { error } = await supabase
    .from("recruiting_checklist_items")
    .delete()
    .eq("user_id", id)
    .eq("item_key", itemKey)
    .eq("is_custom", true);
  return !error;
}
