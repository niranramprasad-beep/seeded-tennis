import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { saveTrainingTemplate } from "@/lib/db/events";
import { TrainingTemplateBodySchema } from "@/lib/api-schemas/training-templates";

// Real write path behind /training's "Save as template" — zod only checks
// shape (right types); saveTrainingTemplate performs the actual upsert.
export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = TrainingTemplateBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const saved = await saveTrainingTemplate(parsed.data, {
      supabase: ctx.supabase,
      userId: ctx.user.id,
    });
    return NextResponse.json({ template: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save that template. Try again." },
      { status: 500 }
    );
  }
}
