import type { Weakness } from "@/lib/types";
import { localDateKey, resolveGraduationYear } from "@/lib/time";
import { getAuthedUser, getSupabase } from "./client";

export { localDateKey };

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

export interface CostCalculation {
  id: string;
  name: string;
  inputs: CostInputs;
  results: CostResults;
  createdAt: string;
}

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

export interface ParentReport {
  id: string;
  month: string;
  title: string;
  summary: Record<string, unknown>;
  publicUrl: string;
  storagePath: string;
  createdAt: string;
}

export interface EncouragementNote {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  authorRole: "player" | "parent";
}

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

async function userId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await getAuthedUser(supabase);
  return data.user?.id ?? null;
}

// profile() used to call userId() again internally, duplicating the
// getAuthedUser() network round-trip on every call site that needed both
// (every family/role-aware loader below). userIdAndProfile() resolves the
// user once and reuses it for the profile lookup — same two queries
// (auth, then profile), just never asking "who am I" twice in a row.
async function userIdAndProfile(): Promise<{ id: string | null; profile: any | null }> {
  const supabase = getSupabase();
  if (!supabase) return { id: null, profile: null };
  const { data: userData } = await getAuthedUser(supabase);
  const id = userData.user?.id ?? null;
  if (!id) return { id: null, profile: null };
  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return { id, profile: profileData };
}

async function profile() {
  const { profile: p } = await userIdAndProfile();
  return p;
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
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
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

export async function loadMatches(signal?: AbortSignal): Promise<MatchRecord[]> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return [];
  let query = supabase
    .from("matches")
    .select("*")
    .order("match_date", { ascending: false })
    .limit(MATCHES_LIMIT);
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map(mapMatch);
}

export async function saveMatch(match: Partial<MatchRecord> & {
  matchDate: string;
  surface: MatchRecord["surface"];
  prepPlan: PrepPlan;
}): Promise<MatchRecord | null> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return null;
  const row = {
    id: match.id,
    user_id: id,
    family_code: p?.family_code ?? null,
    match_date: match.matchDate,
    opponent: match.opponent || null,
    opponent_utr: match.opponentUtr ?? null,
    tournament_name: match.tournamentName || null,
    surface: match.surface,
    prep_plan: match.prepPlan,
    notification_requested: Boolean(match.notificationRequested),
    result: match.result,
    score: match.score || null,
    worked: match.worked || null,
    needs_work: match.needsWork || null,
    notes: match.notes || null,
    video_url: match.videoUrl || null,
    ai_analysis: match.aiAnalysis,
  };
  const { data, error } = await supabase.from("matches").upsert(row).select("*").single();
  if (error) throw new Error(error.message);
  return mapMatch(data);
}

export async function deleteMatch(id: string): Promise<void> {
  const supabase = getSupabase();
  const { id: userId } = await userIdAndProfile();
  if (!supabase || !userId) return;
  const { error } = await supabase.from("matches").delete().eq("id", id).eq("user_id", userId);
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

// 6-stage pipeline (migration 011_outreach_stages.sql — not yet applied to
// the live database, see that file's header). "contacted" was the old
// 2-stage model's name for "an email was sent" — the same meaning "emailed"
// has now, kept here only as a reference for code still migrating off it.
export type OutreachStatus =
  | "researching"
  | "emailed"
  | "replied"
  | "call_visit"
  | "offer"
  | "committed";
export type OutreachStatusMap = Record<string, OutreachStatus>;

export async function loadCoachOutreach(signal?: AbortSignal): Promise<OutreachStatusMap> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return {};
  let query = supabase.from("coach_outreach").select("school_slug, status");
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) return {};
  const map: OutreachStatusMap = {};
  for (const row of data ?? []) {
    map[row.school_slug as string] = row.status as OutreachStatus;
  }
  return map;
}

// Same rows as loadCoachOutreach, plus `updated_at` — the real "when did
// this status last change" signal /today's follow-up-due logic needs — and
// `remindAt`, the player-set "remind me in 14 days" check-in date (migration
// 011_outreach_stages.sql; nullable, null until a reminder is ever set).
// Additive: loadCoachOutreach/OutreachStatusMap are untouched so the
// existing Outreach page keeps working unchanged.
export type OutreachStatusMapDated = Record<
  string,
  { status: OutreachStatus; updatedAt: string; remindAt?: string | null }
>;

export async function loadCoachOutreachDated(signal?: AbortSignal): Promise<OutreachStatusMapDated> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return {};
  const scoped = (q: any) =>
    p?.role === "parent" && p?.family_code ? q.eq("family_code", p.family_code) : q.eq("user_id", id);

  let query = scoped(supabase.from("coach_outreach").select("school_slug, status, updated_at, remind_at"));
  if (signal) query = query.abortSignal(signal);
  let { data, error } = await query;

  // remind_at (migration 011_outreach_stages.sql) isn't applied to the live
  // database yet — selecting a column that doesn't exist there fails the
  // whole query, which would otherwise wipe out every status this page
  // already shows. Fall back to the columns that do exist so outreach
  // tracking keeps working; remindAt just stays absent until the migration
  // lands.
  if (error) {
    let fallback = scoped(supabase.from("coach_outreach").select("school_slug, status, updated_at"));
    if (signal) fallback = fallback.abortSignal(signal);
    const retry = await fallback;
    data = retry.data;
    error = retry.error;
  }
  if (error) return {};

  const map: OutreachStatusMapDated = {};
  for (const row of data ?? []) {
    map[row.school_slug as string] = {
      status: row.status as OutreachStatus,
      updatedAt: row.updated_at as string,
      remindAt: ((row as { remind_at?: string | null }).remind_at ?? null),
    };
  }
  return map;
}

export async function saveCoachOutreachStatus(
  schoolSlug: string,
  status: OutreachStatus | null
): Promise<void> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return;

  if (status === null) {
    await supabase.from("coach_outreach").delete().eq("user_id", id).eq("school_slug", schoolSlug);
    return;
  }

  const { error } = await supabase
    .from("coach_outreach")
    .upsert(
      { user_id: id, family_code: p?.family_code ?? null, school_slug: schoolSlug, status },
      { onConflict: "user_id,school_slug" }
    );
  if (error) throw new Error(error.message);
}

// How far out "Remind me in 14 days" sets remind_at. A player can re-click
// this on any row they're already tracking to push the date out again —
// it always overwrites with a fresh 14-day window from the moment clicked.
export const REMIND_ME_AFTER_DAYS = 14;

// Only ever an UPDATE, never an upsert: a reminder is meaningless without an
// outreach row (status) already existing for that school, and the Outreach
// board only ever renders this action on rows that already have one.
export async function saveCoachOutreachReminder(schoolSlug: string): Promise<string | null> {
  const supabase = getSupabase();
  const { id } = await userIdAndProfile();
  if (!supabase || !id) return null;
  const remindAt = new Date(Date.now() + REMIND_ME_AFTER_DAYS * 86_400_000).toISOString();
  const { error } = await supabase
    .from("coach_outreach")
    .update({ remind_at: remindAt })
    .eq("user_id", id)
    .eq("school_slug", schoolSlug);
  if (error) throw new Error(error.message);
  return remindAt;
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
    .insert({ user_id: id, family_code: p?.family_code ?? null, name, inputs: input, results })
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
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name ?? "Family member",
    email: row.email ?? "",
    role: row.role ?? "player",
    currentUtr: Number(row.current_utr ?? 0),
    graduationYear: resolveGraduationYear(row),
    onboarded: Boolean(row.onboarded),
    targetSchoolSlugs: (row.target_school_slugs as string[] | null) ?? [],
    gender: (row.gender as "male" | "female" | null) ?? undefined,
    createdAt: row.created_at ?? undefined,
  }));
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
  const authorIds = [...new Set((data ?? []).map((row: any) => row.parent_id).filter(Boolean))];
  let authors = new Map<string, { name: string; role: "player" | "parent" }>();
  if (authorIds.length) {
    let authorQuery = supabase
      .from("profiles")
      .select("id,name,role")
      .in("id", authorIds);
    if (signal) authorQuery = authorQuery.abortSignal(signal);
    const { data: profileRows } = await authorQuery;
    authors = new Map(
      (profileRows ?? []).map((row: any) => [
        row.id,
        { name: row.name ?? "Family member", role: row.role ?? "parent" },
      ])
    );
  }
  return (data ?? []).map((row: any) => ({
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

function mapCheckin(row: any): DailyCheckin {
  return { id: row.id, date: row.checkin_date, mood: row.mood, focusAreas: row.focus_areas ?? [], notes: row.notes ?? "" };
}

function mapMatch(row: any): MatchRecord {
  return {
    id: row.id,
    matchDate: row.match_date,
    opponent: row.opponent ?? "",
    opponentUtr: row.opponent_utr == null ? null : Number(row.opponent_utr),
    tournamentName: row.tournament_name ?? "",
    surface: row.surface,
    prepPlan: row.prep_plan ?? { warmup: [], tactics: [], mental: [], matchDay: [], generatedAt: row.created_at },
    notificationRequested: row.notification_requested,
    result: row.result,
    score: row.score ?? "",
    worked: row.worked ?? "",
    needsWork: row.needs_work ?? "",
    notes: row.notes ?? "",
    videoUrl: row.video_url ?? "",
    aiAnalysis: row.ai_analysis ?? null,
  };
}

function mapCost(row: any): CostCalculation {
  return { id: row.id, name: row.name, inputs: row.inputs, results: row.results, createdAt: row.created_at };
}

function mapReport(row: any): ParentReport {
  return { id: row.id, month: row.month, title: row.title, summary: row.summary ?? {}, publicUrl: row.public_url ?? "", storagePath: row.storage_path ?? "", createdAt: row.created_at };
}

