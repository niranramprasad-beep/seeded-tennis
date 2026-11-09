import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { cancelAccountDeletion, requestAccountDeletion } from "@/lib/db/settings";

// The single destructive write in this app with a dedicated endpoint —
// starting (or canceling) the 30-day account-deletion grace period. Real
// RLS still applies (the request-scoped client only ever carries the
// caller's own bearer token), but this is also validated and given a
// specific error message before it ever reaches Supabase, rather than
// going through the generic, unvalidated saveCurrentPlayer()/
// updatePlayer() profile-patch in lib/auth.ts the rest of /settings'
// Profile tab still uses. See components/seeded/settings/
// delete-account-dialog.tsx for the UI-side confirmation gate (an explicit
// checkbox AND typing "DELETE") that must pass before this is ever called.
const BodySchema = z.object({
  action: z.enum(["request", "cancel"]),
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

  try {
    if (parsed.data.action === "request") {
      await requestAccountDeletion(ctx.supabase, ctx.user.id);
    } else {
      await cancelAccountDeletion(ctx.supabase, ctx.user.id);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update your account. Try again." },
      { status: 500 }
    );
  }
}
