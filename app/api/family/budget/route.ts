import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfileRoleAndFamily, getRequestScopedSupabase } from "@/lib/api-auth";
import { saveSeasonBudget } from "@/lib/db/family";

// Real write path behind /family's "Edit budget" — parent/family money
// data, flagged explicitly as high-value/high-risk in this task. zod only
// checks shape (right types) here; the actual business rules (non-negative
// total, non-blank label) are enforced once, by saveSeasonBudget itself —
// the same function the browser called directly before this route existed
// — so there's exactly one place that logic can drift, not two.
const BodySchema = z.object({
  seasonLabel: z.string(),
  totalBudget: z.number(),
});

export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { familyCode } = await getProfileRoleAndFamily(ctx.supabase, ctx.user.id);
  if (!familyCode) {
    return NextResponse.json({ error: "You're not part of a family yet." }, { status: 403 });
  }

  try {
    const saved = await saveSeasonBudget(parsed.data, {
      supabase: ctx.supabase,
      userId: ctx.user.id,
      familyCode,
    });
    return NextResponse.json({ budget: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the budget. Try again." },
      { status: 500 }
    );
  }
}
