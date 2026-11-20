import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProfileRoleAndFamily,
  getRequestScopedSupabase,
  PARENT_ONLY_BUDGET_MESSAGE,
  refuseUnlessFamilyPlan,
} from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { saveBudgetExpense, validateBudgetExpenseInput } from "@/lib/db/family";

// Real write path behind /family's "Add expense" — parent/family money
// data, flagged explicitly as high-value/high-risk in this task. zod
// checks shape; validateBudgetExpenseInput (the same pure function
// budget-modals.tsx already calls client-side, and lib/db/family.test.ts
// already covers) is the single source of the actual business rules
// (non-blank label, valid category, non-negative amount, parseable date).
const BodySchema = z.object({
  category: z.enum(["entries", "travel", "camps"]),
  label: z.string(),
  amount: z.number(),
  expenseDate: z.string(),
});

export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // S-6: one shared, Postgres-backed limiter for every write route. Fails
  // closed — see lib/rate-limit.ts.
  const limited = await rateLimited(ctx.supabase, "budget_write");
  if (limited) return limited;

  // B4 / migration 042: budget expenses are Family-plan data. RLS refuses a
  // locked family's write regardless; this turns that into a sentence.
  const locked = await refuseUnlessFamilyPlan(ctx);
  if (locked) return locked;

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const validationError = validateBudgetExpenseInput(parsed.data);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { role, familyCode } = await getProfileRoleAndFamily(ctx.supabase, ctx.user.id);
  if (!familyCode) {
    return NextResponse.json({ error: "You're not part of a family yet." }, { status: 403 });
  }
  // Migration 050: only a parent writes the season budget. RLS refuses
  // anyone else regardless; this turns the refusal into a 403 and a
  // sentence instead of a 500 carrying the raw policy error.
  if (role !== "parent") {
    return NextResponse.json({ error: PARENT_ONLY_BUDGET_MESSAGE }, { status: 403 });
  }

  try {
    const saved = await saveBudgetExpense(parsed.data, {
      supabase: ctx.supabase,
      userId: ctx.user.id,
      familyCode,
    });
    return NextResponse.json({ expense: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the expense. Try again." },
      { status: 500 }
    );
  }
}
