// Real data access behind /plan: the recruiting roadmap (derived, not
// stored), UTR history, daily check-ins, the "Recruiting timeline"
// checklist's persisted state, and the static training-plan-by-UTR
// catalog /training's legacy view reads. Consolidates what used to be the
// former lib/data/index.ts's roadmap/training-plan exports, lib/supabase/
// utr.ts, lib/supabase/recruiting-checklist.ts, and daily_checkins' slice
// of lib/supabase/features.ts — same bodies, moved, not rewritten.
import type { Player, RoadmapYear, School, TrainingPlan } from "@/lib/types";
import { MILESTONES_BEFORE_GRADE, REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import { getCurrentGrade, getSummerBeforeGradeYear, localDateKey, ordinalGrade } from "@/lib/time";
import type { RecruitingChecklistState } from "@/lib/recruiting-checklist";
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import { getSchoolsBySlugs } from "./schools";
import { trainingPlans as trainingPlansData } from "./plan-data-training-plans";
import type { Tables } from "./database.types";

/* ---------------------------------------------------------------- roadmap */

// Pure derivation. Given a player and their resolved target schools, produce a
// checkpoint-by-checkpoint UTR roadmap. Each checkpoint is the SUMMER BEFORE a
// grade (the recruiting-relevant window), and the goal UTR is the highest
// minimum-competitive bar among the targets — already gender-correct because the
// targets come from the matching men's/women's program data.
export function buildRoadmap(
  player: Player,
  targets: Pick<School, "minCompetitiveUTR">[]
): RoadmapYear[] {
  // Fallback goal when no targets are chosen: aim ~2.5 above today, capped at
  // a realistic top-of-college-tennis level for each gender (real UTR scale).
  const genderCap = REALISTIC_UTR_CEILING[player.gender];
  const goalUTR =
    targets.length > 0
      ? Math.max(...targets.map((s) => s.minCompetitiveUTR))
      : Math.min(player.currentUTR + 2.5, genderCap);

  const startGrade = Math.min(getCurrentGrade(player.graduationYear), 12);

  // Upcoming summers: before each remaining grade. The final target is always
  // due by the summer before senior year, not during senior year or college.
  const grades: number[] = [];
  for (let g = startGrade + 1; g <= 12; g++) grades.push(g);
  if (grades.length === 0) grades.push(12);

  // The goal UTR must be reached by the SUMMER BEFORE SENIOR YEAR (the summer
  // before 12th grade) — the key recruiting window — then held through to
  // college. So we ramp to the goal at the grade-12 checkpoint, not at college.
  const goalIndex = grades.indexOf(12);
  return grades.map((g, i) => {
    const progress = goalIndex < 0 ? 1 : Math.min(1, (i + 1) / (goalIndex + 1));
    const utrTarget =
      Math.round((player.currentUTR + (goalUTR - player.currentUTR) * progress) * 10) /
      10;
    const calendarYear = getSummerBeforeGradeYear(player.graduationYear, g);
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

export async function getRoadmap(
  player: Player,
  overrideSlugs?: string[]
): Promise<RoadmapYear[]> {
  const slugs = overrideSlugs ?? player.targetSchoolSlugs;
  const targets = await getSchoolsBySlugs(slugs);
  return Promise.resolve(buildRoadmap(player, targets));
}

/* ------------------------------------------------------ training catalog */
// Static "which plan fits your current UTR" recommendation catalog behind
// /training's legacy view — distinct from the real per-user training
// PLANNER (training_plans/workout_sessions tables, lib/db/events.ts), which
// is the player's own editable weekly calendar, not a recommendation.

export async function getTrainingPlans(): Promise<TrainingPlan[]> {
  return Promise.resolve(trainingPlansData);
}

export async function getTrainingPlanForUTR(utr: number): Promise<TrainingPlan> {
  const nearest = trainingPlansData.reduce((best, plan) =>
    Math.abs(plan.utrLevel - utr) < Math.abs(best.utrLevel - utr) ? plan : best
  );
  return Promise.resolve(nearest);
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

// Plain read — utr_entries' RLS policy is exactly "auth.uid() = user_id",
// identical to what this query wants, so there's nothing to gain from
// resolving the user id first and filtering by it client-side: skipping
// straight to the query (RLS does the scoping) saves one whole network
// round-trip per load, and an unauthenticated/signed-out call just comes
// back empty instead of needing a separate check.
export async function loadUtrEntries(signal?: AbortSignal): Promise<UtrEntry[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  let query = supabase
    .from("utr_entries")
    .select("id, utr, recorded_at, note")
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

export async function createUtrEntry(input: {
  utr: number;
  recordedAt: string;
  note?: string;
}): Promise<UtrEntry | null> {
  const supabase = getSupabase();
  const userId = await getUserId();
  if (!supabase || !userId) return null;

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

export async function loadDailyCheckins(signal?: AbortSignal): Promise<DailyCheckin[]> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return [];
  let query = supabase
    .from("daily_checkins")
    .select("*")
    .gte("checkin_date", localDateKey(new Date(Date.now() - 31 * 86400000)))
    .order("checkin_date", { ascending: true });
  query =
    p?.role === "parent" && p?.family_code
      ? query.eq("family_code", p.family_code)
      : query.eq("user_id", id);
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
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return null;
  const { data, error } = await supabase
    .from("daily_checkins")
    .upsert(
      {
        user_id: id,
        family_code: p?.family_code ?? null,
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
  const cursor = new Date(`${localDateKey()}T00:00:00`);
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
