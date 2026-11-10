import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { saveTrainingPlannerState } from "@/lib/db/events";
import { TrainingPlannerBodySchema } from "@/lib/api-schemas/training-planner";

// Real write path behind /training's autosave and the Events calendar
// card's add/edit/delete/move/resize/repeat (lib/hooks/
// use-events-calendar.ts always persists the FULL next
// TrainingPlannerState, never a per-field patch, so one endpoint taking
// the whole state is the right shape here — matching what
// saveTrainingPlannerState itself has always accepted). zod only checks
// shape (right types); saveTrainingPlannerState performs the actual
// multi-table upsert/delete sequence, same single-source-of-truth split
// as every other route in this app.
export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = TrainingPlannerBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    await saveTrainingPlannerState(parsed.data, { supabase: ctx.supabase, userId: ctx.user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your training plan. Try again." },
      { status: 500 }
    );
  }
}
