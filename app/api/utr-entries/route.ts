import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { createUtrEntry } from "@/lib/db/plan";
import { UtrEntryBodySchema } from "@/lib/api-schemas/utr-entries";

// Real write path behind /plan's "Log a new UTR" and /today's Sunday
// check-in drawer. zod only checks shape (right types) here; the actual
// business rule (UTR within range, a real date) is enforced once, by
// createUtrEntry itself — the same function the browser called directly
// before this route existed — so there's exactly one place that logic can
// drift, not two.
export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UtrEntryBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    const entry = await createUtrEntry(parsed.data, {
      supabase: ctx.supabase,
      userId: ctx.user.id,
    });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your UTR entry. Try again." },
      { status: 500 }
    );
  }
}
