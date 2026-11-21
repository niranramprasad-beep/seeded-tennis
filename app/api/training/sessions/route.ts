import { NextResponse } from "next/server";
import { getRequestScopedSupabase, refuseParentPlayerDataWrite } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { logServerError } from "@/lib/server-log";
import {
  TrainingWriteError,
  createTrainingSessions,
  deleteTrainingSessions,
  trainingSaveErrorMessage,
  updateTrainingSession,
} from "@/lib/db/training";
import { TrainingSessionsBodySchema } from "@/lib/api-schemas/training-sessions";

// The one write path for the player's own training calendar (/events).
// Per-row create/update/delete, each scoped in lib/db/training.ts to the
// caller's manual plan — never a whole-state save, which is what the old
// /api/training/planner was and why it is gone.
export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const parentRefusal = await refuseParentPlayerDataWrite(ctx);
  if (parentRefusal) return parentRefusal;

  // S-6: one shared, Postgres-backed limiter for every write route. Fails
  // closed — see lib/rate-limit.ts.
  const limited = await rateLimited(ctx.supabase, "training_write");
  if (limited) return limited;

  const json = await req.json().catch(() => null);
  const parsed = TrainingSessionsBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const writeCtx = { supabase: ctx.supabase, userId: ctx.user.id };
  try {
    if (parsed.data.kind === "create") await createTrainingSessions(parsed.data.sessions, writeCtx);
    else if (parsed.data.kind === "update") await updateTrainingSession(parsed.data.session, writeCtx);
    else await deleteTrainingSessions(parsed.data.ids, writeCtx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Plain words only — never the database's text. An RLS refusal (42501)
    // is usually an under-13 account still waiting for a parent's consent;
    // say so when the caller's own profile shows it.
    let consentPending = false;
    if (err instanceof TrainingWriteError && err.code === "42501") {
      const { data } = await ctx.supabase.from("profiles").select("consent_status").eq("id", ctx.user.id).maybeSingle();
      consentPending = data?.consent_status === "pending";
    }
    const status = err instanceof TrainingWriteError && err.code === "42501" ? 403 : err instanceof TrainingWriteError && err.code === "not_found" ? 404 : 500;
    if (status === 500) logServerError("api.training_sessions.write_failed", err, { route: "/api/training/sessions" });
    return NextResponse.json({ error: trainingSaveErrorMessage(err, consentPending) }, { status });
  }
}
