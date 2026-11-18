import { NextResponse } from "next/server";
import { getRequestScopedSupabase, refuseParentPlayerDataWrite } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { createTrainingSessions, deleteTrainingSessions, updateTrainingSession } from "@/lib/db/training";
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your session. Try again." },
      { status: 500 }
    );
  }
}
