// The player's own training calendar: sessions they typed in themselves,
// one row each, on a real date. Nothing here makes a session up.
//
// WHY A SEPARATE "MANUAL" PLAN. `workout_sessions.training_plan_id` is NOT
// NULL (migration 001), so every session belongs to some `training_plans`
// row. Before 2026-11-18 those rows were written by /training's generator
// ("6h personalized recruiting week", "UTR build week", …) and by a
// whole-state save that re-upserted every plan and deleted every session it
// did not know about. Production holds 28 such sessions in 5 plans, every
// one of them in a generator-named plan (checked read-only, 2026-11-18).
//
// A session the player adds now goes into ONE plan per player whose
// `metadata` is `{"kind":"manual"}`, created on first use. The calendar
// shows a session when isPlayerAddedSession() says the PLAYER put it there:
//   - its plan is the manual plan (metadata.kind = "manual"); or
//   - its plan is named exactly "My sessions" — the plan the pre-2026-11-18
//     calendar's withGuaranteedPlan() created (metadata {}) for a player with
//     no plan, so everything in it was typed in by hand; or
//   - the session was created more than a minute after its plan. Before
//     2026-11-18 a hand-added session went into the player's ACTIVE plan,
//     which was usually a generated one; a generator writes its sessions in
//     the same instant as their plan, so anything later is the player's.
// Generator rows (created with their plan) stay hidden. So:
//   - the generated rows are hidden, not deleted — whether to delete them in
//     production is the owner's call (docs/DECISIONS.md, 2026-11-18);
//   - every update/delete below first reads the visible rows by the same
//     rule and touches only those ids (and the owner's), so no edit or
//     delete here can ever touch a generated row;
//   - Week and Month read the same list, so they cannot disagree again (the
//     live bug: Month repeated generated rows on every weekday, Week showed
//     none because their dates were weeks old).
//
// Per-row writes, never a whole-state save. The old save deleted any row not
// in the state it was handed; with generated rows filtered out of the UI,
// one ordinary save would have deleted them all.
import { getAuthedUser, getSupabase, type TypedSupabaseClient } from "@/lib/supabase/client";
import type { Tables } from "./database.types";
import { sessionType } from "@/lib/training/session-types";
import type { WeekdayShort } from "@/lib/types";

export interface TrainingSession {
  id: string;
  /** "YYYY-MM-DD" — a LOCAL calendar date. Never parse it with
   * `new Date(date)`: that is UTC midnight, the previous day in the US. */
  date: string;
  /** "HH:MM", 24-hour. */
  startTime: string;
  /** Minutes. */
  duration: number;
  typeId: string;
  notes: string;
  /** Shared by the occurrences of one "repeat weekly" add, so the whole
   * series can be removed together. Null for a one-off. */
  seriesId: string | null;
}

/** Server-side write context (the request-scoped, RLS-respecting client). */
export interface TrainingWriteContext {
  supabase: TypedSupabaseClient;
  userId: string;
}

/** A failed training write, carrying the Postgres error code so the route
 * can turn it into plain words (trainingSaveErrorMessage). Its `message` is
 * the database's own text and must never reach the person. */
export class TrainingWriteError extends Error {
  constructor(
    message: string,
    readonly code: string | null
  ) {
    super(message);
    this.name = "TrainingWriteError";
  }
}
const dbError = (error: { code?: string | null; message: string }) => new TrainingWriteError(error.message, error.code ?? null);

/**
 * What the person is told when a session write fails — never the database's
 * text ("new row violates row-level security policy for table …" reached an
 * under-13 awaiting consent before this). `consentPending` is the caller's
 * own profiles.consent_status === "pending", when the route could read it.
 */
export function trainingSaveErrorMessage(err: unknown, consentPending = false): string {
  const code = err instanceof TrainingWriteError ? err.code : null;
  switch (code) {
    case "53400":
      return "Too many changes at once. Wait a few minutes, then try again.";
    case "42501":
      return consentPending
        ? "Your account can't add sessions until a parent in your family gives consent."
        : "Your account can't add sessions yet. Sign out and back in, then try again. If it keeps happening, email support.";
    case "not_found":
      return "That session no longer exists. Refresh the page to see your calendar.";
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
      return "One of the details isn't valid. Check the date, time and length, then try again.";
    default:
      return "Couldn't save your session. Check your connection and try again.";
  }
}

export const MANUAL_PLAN_METADATA = { kind: "manual" } as const;
const MANUAL_PLAN_NAME = "My sessions";

const WEEKDAYS: WeekdayShort[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The weekday of a "YYYY-MM-DD" date. Computed in UTC on purpose: the
 * string has no time zone, so neither should the arithmetic. */
export function weekdayOf(dateKey: string): WeekdayShort {
  const [y, m, d] = dateKey.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function mapSessionRow(row: Tables<"workout_sessions">): TrainingSession | null {
  if (!row.scheduled_date) return null;
  const meta = (row.metadata ?? {}) as { seriesId?: string | null };
  return {
    id: row.id,
    date: row.scheduled_date,
    startTime: String(row.start_time ?? "16:00").slice(0, 5),
    duration: row.duration_minutes,
    typeId: row.session_type,
    notes: row.notes ?? "",
    seriesId: meta.seriesId ?? null,
  };
}

function sessionRow(session: TrainingSession, userId: string, planId: string) {
  return {
    id: session.id,
    user_id: userId,
    training_plan_id: planId,
    // title is NOT NULL; the calendar labels a session by its type.
    title: sessionType(session.typeId).label,
    session_type: session.typeId,
    scheduled_date: session.date,
    weekday: weekdayOf(session.date),
    start_time: session.startTime,
    duration_minutes: session.duration,
    notes: session.notes || null,
    metadata: { origin: "manual", seriesId: session.seriesId },
  };
}

/** The name withGuaranteedPlan() gave the plan it created before
 * 2026-11-18 (lib/hooks/use-events-calendar.ts on main). Also the manual
 * plan's own name. */
export const LEGACY_HAND_PLAN_NAME = "My sessions";
/** A session created this long after its plan was added by hand later; a
 * generator writes a plan and its sessions in one go. */
export const HAND_ADDED_AFTER_MS = 60_000;

export interface PlanVisibilityRow {
  id: string;
  name: string;
  metadata: unknown;
  created_at: string;
}
export interface SessionVisibilityRow {
  training_plan_id: string;
  created_at: string;
}

/** True when the PLAYER put this session on their calendar (see the header):
 * a manual plan, the old "My sessions" plan, or added a minute or more after
 * its plan. False for generator rows and for a session with no known plan. */
export function isPlayerAddedSession(session: SessionVisibilityRow, plan: PlanVisibilityRow | undefined): boolean {
  if (!plan || plan.id !== session.training_plan_id) return false;
  const meta = plan.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta) && (meta as { kind?: unknown }).kind === MANUAL_PLAN_METADATA.kind) {
    return true;
  }
  if (plan.name === LEGACY_HAND_PLAN_NAME) return true;
  const planAt = Date.parse(plan.created_at);
  const sessionAt = Date.parse(session.created_at);
  if (!Number.isFinite(planAt) || !Number.isFinite(sessionAt)) return false;
  return sessionAt - planAt > HAND_ADDED_AFTER_MS;
}

/** Every one of the player's sessions the calendar shows, as raw rows. */
async function visibleSessionRows(
  supabase: TypedSupabaseClient,
  userId: string,
  signal?: AbortSignal
): Promise<Tables<"workout_sessions">[]> {
  let pq = supabase.from("training_plans").select("id, name, metadata, created_at").eq("user_id", userId);
  if (signal) pq = pq.abortSignal(signal);
  const { data: plans, error: planError } = await pq;
  if (planError) throw dbError(planError);
  if (!plans?.length) return [];
  const byId = new Map(plans.map((p) => [p.id, p as PlanVisibilityRow]));

  let q = supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("training_plan_id", [...byId.keys()])
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw dbError(error);
  return (data ?? []).filter((row) => isPlayerAddedSession(row, byId.get(row.training_plan_id)));
}

async function manualPlanIds(supabase: TypedSupabaseClient, userId: string, signal?: AbortSignal): Promise<string[]> {
  let q = supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .contains("metadata", MANUAL_PLAN_METADATA)
    .order("created_at", { ascending: true });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw dbError(error);
  return (data ?? []).map((p) => p.id);
}

/** The player's own sessions, oldest first: every session
 * isPlayerAddedSession() keeps — see the header. Filtered to the signed-in
 * user explicitly: RLS is the ceiling, the query says what it means to read. */
export async function loadTrainingSessions(signal?: AbortSignal): Promise<TrainingSession[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data: userData } = await getAuthedUser(supabase);
  const ownerId = userData.user?.id;
  if (!ownerId) return [];
  const rows = await visibleSessionRows(supabase, ownerId, signal);
  return rows.map(mapSessionRow).filter((s): s is TrainingSession => s !== null);
}

async function ensureManualPlan(ctx: TrainingWriteContext): Promise<string> {
  const existing = await manualPlanIds(ctx.supabase, ctx.userId);
  if (existing[0]) return existing[0];
  const { data, error } = await ctx.supabase
    .from("training_plans")
    .insert({
      user_id: ctx.userId,
      name: MANUAL_PLAN_NAME,
      source: "custom",
      active: false,
      metadata: MANUAL_PLAN_METADATA,
    })
    .select("id")
    .single();
  if (error) throw dbError(error);
  return data.id;
}

async function post(body: unknown): Promise<void> {
  const { postJson } = await import("@/lib/api-client");
  await postJson("/api/training/sessions", body);
}

/** Adds one session, or every occurrence of a weekly series. */
export async function createTrainingSessions(sessions: TrainingSession[], ctx?: TrainingWriteContext): Promise<void> {
  if (!ctx) return post({ kind: "create", sessions });
  const planId = await ensureManualPlan(ctx);
  const { error } = await ctx.supabase.from("workout_sessions").insert(sessions.map((s) => sessionRow(s, ctx.userId, planId)));
  if (error) throw dbError(error);
}

/** Changes one of the player's own sessions (date, time, length, type,
 * note). Only a session the calendar shows can be matched — a generated row
 * never is — and it stays in the plan it is in. */
export async function updateTrainingSession(session: TrainingSession, ctx?: TrainingWriteContext): Promise<void> {
  if (!ctx) return post({ kind: "update", session });
  const visible = await visibleSessionRows(ctx.supabase, ctx.userId);
  const current = visible.find((r) => r.id === session.id);
  if (!current) throw new TrainingWriteError("That session no longer exists.", "not_found");
  const { id, user_id, training_plan_id, ...changes } = sessionRow(session, ctx.userId, current.training_plan_id);
  void user_id;
  void training_plan_id;
  const { data, error } = await ctx.supabase
    .from("workout_sessions")
    .update(changes)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("training_plan_id", current.training_plan_id)
    .select("id");
  if (error) throw dbError(error);
  if (!data?.length) throw new TrainingWriteError("That session no longer exists.", "not_found");
}

/** Removes the player's own sessions by id. Only ids the calendar shows are
 * deleted, so a generated row can never be deleted from here. */
export async function deleteTrainingSessions(ids: string[], ctx?: TrainingWriteContext): Promise<void> {
  if (!ctx) return post({ kind: "delete", ids });
  const wanted = new Set(ids);
  const allowed = (await visibleSessionRows(ctx.supabase, ctx.userId)).filter((r) => wanted.has(r.id)).map((r) => r.id);
  if (allowed.length === 0) return;
  const { error } = await ctx.supabase.from("workout_sessions").delete().eq("user_id", ctx.userId).in("id", allowed);
  if (error) throw dbError(error);
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
