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
// reads only that plan's sessions, so:
//   - the generated rows are hidden, not deleted — whether to delete them in
//     production is the owner's call (docs/DECISIONS.md, 2026-11-18);
//   - every write below is filtered by the manual plan as well as by the
//     owner, so no edit or delete here can ever touch a generated row;
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

async function manualPlanIds(supabase: TypedSupabaseClient, userId: string, signal?: AbortSignal): Promise<string[]> {
  let q = supabase
    .from("training_plans")
    .select("id")
    .eq("user_id", userId)
    .contains("metadata", MANUAL_PLAN_METADATA)
    .order("created_at", { ascending: true });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => p.id);
}

/** The player's own sessions, oldest first. Only sessions in their manual
 * plan — see the header. Filtered to the signed-in user explicitly: RLS is
 * the ceiling, the query says what it means to read. */
export async function loadTrainingSessions(signal?: AbortSignal): Promise<TrainingSession[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data: userData } = await getAuthedUser(supabase);
  const ownerId = userData.user?.id;
  if (!ownerId) return [];

  const planIds = await manualPlanIds(supabase, ownerId, signal);
  if (planIds.length === 0) return [];

  let q = supabase
    .from("workout_sessions")
    .select("*")
    .eq("user_id", ownerId)
    .in("training_plan_id", planIds)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapSessionRow).filter((s): s is TrainingSession => s !== null);
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
  if (error) throw new Error(error.message);
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
  if (error) throw new Error(error.message);
}

/** Changes one of the player's own manual sessions (date, time, length,
 * type, note). A session outside the manual plan is never matched. */
export async function updateTrainingSession(session: TrainingSession, ctx?: TrainingWriteContext): Promise<void> {
  if (!ctx) return post({ kind: "update", session });
  const planIds = await manualPlanIds(ctx.supabase, ctx.userId);
  if (planIds.length === 0) throw new Error("That session no longer exists.");
  const { id, user_id, training_plan_id, ...changes } = sessionRow(session, ctx.userId, planIds[0]);
  void user_id;
  void training_plan_id;
  const { data, error } = await ctx.supabase
    .from("workout_sessions")
    .update(changes)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .in("training_plan_id", planIds)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("That session no longer exists.");
}

/** Removes the player's own manual sessions by id. Generated rows are
 * outside the manual plan, so they can never be deleted from here. */
export async function deleteTrainingSessions(ids: string[], ctx?: TrainingWriteContext): Promise<void> {
  if (!ctx) return post({ kind: "delete", ids });
  const planIds = await manualPlanIds(ctx.supabase, ctx.userId);
  if (planIds.length === 0) return;
  const { error } = await ctx.supabase
    .from("workout_sessions")
    .delete()
    .eq("user_id", ctx.userId)
    .in("training_plan_id", planIds)
    .in("id", ids);
  if (error) throw new Error(error.message);
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
