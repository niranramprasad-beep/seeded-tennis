import { NextResponse } from "next/server";
import { getProfileRoleAndFamily, getRequestScopedSupabase, refuseParentPlayerDataWrite } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { logServerError } from "@/lib/server-log";
import { clientWriteErrorMessage, clientWriteErrorStatus } from "@/lib/db/write-error";
import { deleteMatch, saveMatch } from "@/lib/db/events";
import { MatchesBodySchema } from "@/lib/api-schemas/matches";

// Real write path behind /matches' log form and /events' Match mode (prep
// plan, result, cancel) — save and delete both act on the caller's own
// `matches` rows, so one endpoint with a discriminated `kind` (same shape
// as app/api/outreach/route.ts) covers both instead of two routes.
export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const parentRefusal = await refuseParentPlayerDataWrite(ctx);
  if (parentRefusal) return parentRefusal;

  // S-6: one shared, Postgres-backed limiter for every write route. Fails
  // closed — see lib/rate-limit.ts.
  const limited = await rateLimited(ctx.supabase, "match_write");
  if (limited) return limited;

  const json = await req.json().catch(() => null);
  const parsed = MatchesBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  const { familyCode } = await getProfileRoleAndFamily(ctx.supabase, ctx.user.id);
  const writeCtx = { supabase: ctx.supabase, userId: ctx.user.id, familyCode };

  try {
    if (parsed.data.kind === "delete") {
      await deleteMatch(parsed.data.id, writeCtx);
      return NextResponse.json({ ok: true });
    }
    const { kind, ...match } = parsed.data;
    const saved = await saveMatch(match, writeCtx);
    return NextResponse.json({ match: saved });
  } catch (err) {
    // S-10: the database's own text goes to the log, never to the response
    // (lib/db/write-error.ts). Our validation sentences still reach the UI.
    logServerError("api.matches.write_failed", err, { route: "/api/matches" });
    return NextResponse.json(
      { error: clientWriteErrorMessage(err, "Could not save that match. Try again.") },
      { status: clientWriteErrorStatus(err) }
    );
  }
}
