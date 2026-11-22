import { NextResponse } from "next/server";
import { getRequestScopedSupabase, refuseParentPlayerDataWrite } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { logServerError } from "@/lib/server-log";
import { clientWriteErrorMessage, clientWriteErrorStatus } from "@/lib/db/write-error";
import { writeRefusalContext } from "@/lib/db/write-refusal";
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

  const parentRefusal = await refuseParentPlayerDataWrite(ctx);
  if (parentRefusal) return parentRefusal;

  // S-6: one shared, Postgres-backed limiter for every write route. Fails
  // closed — see lib/rate-limit.ts.
  const limited = await rateLimited(ctx.supabase, "utr_entry");
  if (limited) return limited;

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
    // S-10: the database's own text goes to the log, never to the response
    // (lib/db/write-error.ts). Our validation sentences still reach the UI.
    logServerError("api.utr_entries.write_failed", err, { route: "/api/utr-entries" });
    // A permission refusal reads its reason from the caller's own profile
    // (consent pending / Free plan), never from the error's text.
    const refusal = await writeRefusalContext(ctx.supabase, ctx.user.id, err);
    return NextResponse.json(
      { error: clientWriteErrorMessage(err, "Could not save your UTR entry. Try again.", refusal) },
      { status: clientWriteErrorStatus(err) }
    );
  }
}
