// Real data access for coach outreach tracking (`coach_outreach`,
// migration 009, widened by 011/017) — the board behind /outreach and the
// source /today reads for follow-up-due nudges. Moved verbatim from the
// former lib/supabase/features.ts's coach_outreach section.
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { getAuthedUser, getSupabase } from "@/lib/supabase/client";
import type { Tables } from "./database.types";

async function userIdAndProfile(): Promise<{ id: string | null; profile: Tables<"profiles"> | null }> {
  const supabase = getSupabase();
  if (!supabase) return { id: null, profile: null };
  const { data: userData } = await getAuthedUser(supabase);
  const id = userData.user?.id ?? null;
  if (!id) return { id: null, profile: null };
  const { data: profileData } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return { id, profile: profileData };
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
    map[row.school_slug] = row.status as OutreachStatus;
  }
  return map;
}

// Same rows as loadCoachOutreach, plus `updated_at` — the real "when did
// this status last change" signal /today's follow-up-due logic needs —
// `remindAt`, the player-set "remind me in 14 days" check-in date (migration
// 011_outreach_stages.sql; nullable, null until a reminder is ever set), and
// `replyNote`, the optional free-text note a player can attach when marking
// a school "replied" (migration 017_coach_outreach_reply_note.sql; nullable,
// null until a note is ever saved). Additive: loadCoachOutreach/
// OutreachStatusMap are untouched so the existing Outreach page keeps
// working unchanged.
export type OutreachStatusMapDated = Record<
  string,
  { status: OutreachStatus; updatedAt: string; remindAt?: string | null; replyNote?: string | null }
>;

interface OutreachDatedRow {
  school_slug: string;
  status: string;
  updated_at: string;
  remind_at?: string | null;
  reply_note?: string | null;
}

export async function loadCoachOutreachDated(signal?: AbortSignal): Promise<OutreachStatusMapDated> {
  const supabase = getSupabase();
  const { id, profile: p } = await userIdAndProfile();
  if (!supabase || !id) return {};
  const isParentFamily = Boolean(p?.role === "parent" && p?.family_code);

  // Selects widen in three steps, from "everything this task adds" down to
  // the original 009 columns, because remind_at (011) and reply_note (017)
  // are each tracked-but-not-yet-applied migrations — selecting a column
  // that doesn't exist on the live table fails the WHOLE query, which would
  // otherwise wipe out every status this page shows. Falling back keeps
  // outreach tracking working regardless of which of the two migrations (if
  // either) has actually landed; the newer field(s) just stay absent.
  async function runSelect(columns: string): Promise<{ data: OutreachDatedRow[] | null; error: { message: string } | null }> {
    let q = supabase!.from("coach_outreach").select(columns);
    q = isParentFamily ? q.eq("family_code", p!.family_code as string) : q.eq("user_id", id as string);
    if (signal) q = q.abortSignal(signal);
    const result = await q;
    return { data: (result.data as unknown as OutreachDatedRow[] | null), error: result.error };
  }

  let { data, error } = await runSelect("school_slug, status, updated_at, remind_at, reply_note");
  if (error) ({ data, error } = await runSelect("school_slug, status, updated_at, remind_at"));
  if (error) ({ data, error } = await runSelect("school_slug, status, updated_at"));
  if (error) return {};

  const map: OutreachStatusMapDated = {};
  for (const row of data ?? []) {
    map[row.school_slug] = {
      status: row.status as OutreachStatus,
      updatedAt: row.updated_at,
      remindAt: row.remind_at ?? null,
      replyNote: row.reply_note ?? null,
    };
  }
  return map;
}

/** Used ONLY by app/api/outreach/route.ts, which passes its own
 * request-scoped, RLS-respecting client + already-authenticated user id/
 * family code. There's no browser-direct write path left for any of the
 * three functions below (see each one's doc comment) — `ctx` is how the
 * route handler reaches the real upsert/update logic without duplicating
 * it. */
export interface OutreachWriteContext {
  supabase: TypedSupabaseClient;
  userId: string;
  familyCode?: string | null;
}

/** Real action behind /outreach's and /coaches' stage buttons. Without
 * `ctx` (every real UI call site), this posts to the zod-validated
 * app/api/outreach route instead of writing to Supabase directly — same
 * contract (resolves on success, throws with a specific message on
 * failure) components/coaches/coaches-view.tsx's existing
 * `catch (err) { setOutreachError(err.message) }` already expects. */
export async function saveCoachOutreachStatus(
  schoolSlug: string,
  status: OutreachStatus | null,
  ctx?: OutreachWriteContext
): Promise<void> {
  if (!ctx) {
    const { postJson } = await import("@/lib/api-client");
    await postJson("/api/outreach", { kind: "status", schoolSlug, status });
    return;
  }

  if (status === null) {
    await ctx.supabase.from("coach_outreach").delete().eq("user_id", ctx.userId).eq("school_slug", schoolSlug);
    return;
  }

  const { error } = await ctx.supabase
    .from("coach_outreach")
    .upsert(
      { user_id: ctx.userId, family_code: ctx.familyCode ?? null, school_slug: schoolSlug, status },
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
export async function saveCoachOutreachReminder(
  schoolSlug: string,
  ctx?: OutreachWriteContext
): Promise<string | null> {
  if (!ctx) {
    const { postJson } = await import("@/lib/api-client");
    const { remindAt } = await postJson<{ remindAt: string | null }>("/api/outreach", {
      kind: "reminder",
      schoolSlug,
    });
    return remindAt;
  }

  const remindAt = new Date(Date.now() + REMIND_ME_AFTER_DAYS * 86_400_000).toISOString();
  const { error } = await ctx.supabase
    .from("coach_outreach")
    .update({ remind_at: remindAt })
    .eq("user_id", ctx.userId)
    .eq("school_slug", schoolSlug);
  if (error) throw new Error(error.message);
  return remindAt;
}

// Same "update, never upsert" rule as saveCoachOutreachReminder above: a
// reply note is meaningless without an outreach row already existing, and
// the Outreach board only ever renders this on a row that's already marked
// "replied". Empty string is saved as null so an emptied-out note reads the
// same as one that was never written, not as an empty-but-present note.
export async function saveCoachOutreachReplyNote(
  schoolSlug: string,
  note: string,
  ctx?: OutreachWriteContext
): Promise<void> {
  if (!ctx) {
    const { postJson } = await import("@/lib/api-client");
    await postJson("/api/outreach", { kind: "reply-note", schoolSlug, note });
    return;
  }

  const { error } = await ctx.supabase
    .from("coach_outreach")
    .update({ reply_note: note.trim() || null })
    .eq("user_id", ctx.userId)
    .eq("school_slug", schoolSlug);
  if (error) throw new Error(error.message);
}
