import type { Weakness } from "@/lib/types";
import { getSupabase } from "./client";

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

export interface EarnedBadge {
  id: string;
  key: string;
  type: string;
  title: string;
  description: string;
  earnedAt: string;
}

export interface FriendProfile {
  id: string;
  email: string;
  name: string;
  username: string;
  currentUtr: number;
  privacyLevel: "public" | "friends" | "private";
}

export interface Friendship {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted" | "declined";
  profile: FriendProfile;
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
  grade: number;
  onboarded: boolean;
}

async function userId(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function profile() {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return data;
}

export function localDateKey(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export async function loadDailyCheckins(): Promise<DailyCheckin[]> {
  const supabase = getSupabase();
  const id = await userId();
  const p = await profile();
  if (!supabase || !id) return [];
  let query = supabase
    .from("daily_checkins")
    .select("*")
    .gte("checkin_date", localDateKey(new Date(Date.now() - 31 * 86400000)))
    .order("checkin_date", { ascending: true });
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
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
  const id = await userId();
  const p = await profile();
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

export async function loadMatches(): Promise<MatchRecord[]> {
  const supabase = getSupabase();
  const id = await userId();
  const p = await profile();
  if (!supabase || !id) return [];
  let query = supabase
    .from("matches")
    .select("*")
    .order("match_date", { ascending: false });
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
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
  const id = await userId();
  const p = await profile();
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

export async function loadBadges(): Promise<EarnedBadge[]> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return [];
  const { data } = await supabase.from("badges").select("*").eq("user_id", id).order("earned_at", { ascending: false });
  return (data ?? []).map(mapBadge);
}

export async function awardBadges(badges: Omit<EarnedBadge, "id" | "earnedAt">[]): Promise<EarnedBadge[]> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id || badges.length === 0) return [];
  const rows = badges.map((b) => ({
    user_id: id,
    badge_key: b.key,
    badge_type: b.type,
    title: b.title,
    description: b.description,
  }));
  const { data, error } = await supabase.from("badges").upsert(rows, { onConflict: "user_id,badge_key" }).select("*");
  if (error) return [];
  return (data ?? []).map(mapBadge);
}

export function evaluateBadges(args: {
  currentUtr: number;
  tournamentsPlayed: number;
  streak: number;
  matches: MatchRecord[];
  trainingHours: number;
  contactedCoaches: number;
  repliedCoaches: number;
}): Omit<EarnedBadge, "id" | "earnedAt">[] {
  const result: Omit<EarnedBadge, "id" | "earnedAt">[] = [];
  [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].forEach((level) => {
    if (args.currentUtr >= level) result.push({ key: `utr-${level}`, type: "UTR", title: `${level}.0 UTR`, description: `Reached ${level}.0 UTR.` });
  });
  [5, 10, 25, 50].forEach((count) => {
    if (args.tournamentsPlayed >= count) result.push({ key: `tournaments-${count}`, type: "Tournament", title: `${count} tournaments`, description: `Played ${count}+ tournaments.` });
  });
  [7, 30, 100].forEach((count) => {
    if (args.streak >= count) result.push({ key: `streak-${count}`, type: "Training", title: `${count} day streak`, description: `Checked in ${count} days in a row.` });
  });
  [50, 100, 500].forEach((hours) => {
    if (args.trainingHours >= hours) result.push({ key: `hours-${hours}`, type: "Training", title: `${hours} hours trained`, description: `Logged ${hours}+ planned training hours.` });
  });
  if (args.matches.some((m) => m.result === "win" && m.opponentUtr && m.opponentUtr >= args.currentUtr + 1)) {
    result.push({ key: "upset-1-utr", type: "Match", title: "Rated upset", description: "Beat someone 1.0+ UTR higher." });
  }
  if (longestWinStreak(args.matches) >= 5) result.push({ key: "win-streak-5", type: "Match", title: "Five match streak", description: "Won five matches in a row." });
  if (args.contactedCoaches >= 5) result.push({ key: "coach-email-5", type: "Recruiting", title: "Five coaches emailed", description: "Sent outreach to five programs." });
  if (args.repliedCoaches >= 1) result.push({ key: "first-coach-reply", type: "Recruiting", title: "First coach reply", description: "Logged a coach reply." });
  return result;
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
  const id = await userId();
  const p = await profile();
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

export async function loadCostCalculations(): Promise<CostCalculation[]> {
  const supabase = getSupabase();
  const id = await userId();
  const p = await profile();
  if (!supabase || !id) return [];
  let query = supabase.from("cost_calculations").select("*").order("created_at", { ascending: false });
  query = p?.role === "parent" && p?.family_code ? query.eq("family_code", p.family_code) : query.eq("user_id", id);
  const { data } = await query;
  return (data ?? []).map(mapCost);
}

export async function searchProfiles(query: string): Promise<FriendProfile[]> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id || query.trim().length < 2) return [];
  const q = `%${query.trim()}%`;
  const { data } = await supabase
    .from("profiles")
    .select("id,email,name,username,current_utr,privacy_level")
    .or(`email.ilike.${q},name.ilike.${q}`)
    .neq("id", id)
    .limit(12);
  return (data ?? []).map(mapFriendProfile);
}

export async function updateProfileDiscovery(input: {
  privacyLevel: FriendProfile["privacyLevel"];
}) {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      privacy_level: input.privacyLevel,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadFamilyMembers(): Promise<FamilyMember[]> {
  const supabase = getSupabase();
  const p = await profile();
  if (!supabase || !p?.family_code) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id,email,name,role,current_utr,grade,onboarded")
    .eq("family_code", p.family_code)
    .order("role", { ascending: false });
  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name ?? "Family member",
    email: row.email ?? "",
    role: row.role ?? "player",
    currentUtr: Number(row.current_utr ?? 0),
    grade: Number(row.grade ?? 0),
    onboarded: Boolean(row.onboarded),
  }));
}

export async function sendFriendRequest(addresseeId: string) {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return;
  await supabase.from("friendships").upsert({ requester_id: id, addressee_id: addresseeId, status: "pending" }, { onConflict: "requester_id,addressee_id" });
}

export async function updateFriendship(id: string, status: "accepted" | "declined") {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("friendships").update({ status }).eq("id", id);
}

export async function loadFriendships(): Promise<Friendship[]> {
  const supabase = getSupabase();
  const id = await userId();
  if (!supabase || !id) return [];
  const { data } = await supabase
    .from("friendships")
    .select("*, requester:profiles!friendships_requester_id_fkey(id,email,name,username,current_utr,privacy_level), addressee:profiles!friendships_addressee_id_fkey(id,email,name,username,current_utr,privacy_level)")
    .or(`requester_id.eq.${id},addressee_id.eq.${id}`)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row: any) => ({
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: row.status,
    profile: mapFriendProfile(row.requester_id === id ? row.addressee : row.requester),
  }));
}

export async function loadParentReports(): Promise<ParentReport[]> {
  const supabase = getSupabase();
  const p = await profile();
  if (!supabase || !p?.family_code) return [];
  const { data } = await supabase.from("parent_reports").select("*").eq("family_code", p.family_code).order("month", { ascending: false });
  return (data ?? []).map(mapReport);
}

export async function loadEncouragementNotes(): Promise<EncouragementNote[]> {
  const supabase = getSupabase();
  const p = await profile();
  if (!supabase || !p?.family_code) return [];
  const { data } = await supabase
    .from("encouragement_notes")
    .select("*")
    .eq("family_code", p.family_code)
    .order("created_at", { ascending: false });
  const authorIds = [...new Set((data ?? []).map((row: any) => row.parent_id).filter(Boolean))];
  let authors = new Map<string, { name: string; role: "player" | "parent" }>();
  if (authorIds.length) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id,name,role")
      .in("id", authorIds);
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
  const id = await userId();
  const p = await profile();
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

function mapBadge(row: any): EarnedBadge {
  return { id: row.id, key: row.badge_key, type: row.badge_type, title: row.title, description: row.description ?? "", earnedAt: row.earned_at };
}

function mapFriendProfile(row: any): FriendProfile {
  return {
    id: row.id,
    email: row.email ?? "",
    name: row.name ?? "Seeded player",
    username: row.username ?? "",
    currentUtr: Number(row.current_utr ?? 0),
    privacyLevel: row.privacy_level ?? "friends",
  };
}

function mapCost(row: any): CostCalculation {
  return { id: row.id, name: row.name, inputs: row.inputs, results: row.results, createdAt: row.created_at };
}

function mapReport(row: any): ParentReport {
  return { id: row.id, month: row.month, title: row.title, summary: row.summary ?? {}, publicUrl: row.public_url ?? "", storagePath: row.storage_path ?? "", createdAt: row.created_at };
}

function longestWinStreak(matches: MatchRecord[]): number {
  let current = 0;
  let best = 0;
  [...matches].sort((a, b) => a.matchDate.localeCompare(b.matchDate)).forEach((m) => {
    if (m.result === "win") current += 1;
    else if (m.result === "loss") current = 0;
    best = Math.max(best, current);
  });
  return best;
}
