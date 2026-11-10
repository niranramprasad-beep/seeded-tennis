import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { writeCurrentPlayerProfile } from "@/lib/auth";
import { PlayerBodySchema } from "@/lib/api-schemas/profile";

// The single highest-traffic write path in the app — every settings/
// onboarding/profile-edit screen funnels through updatePlayer()
// (lib/context/player-context.tsx), which always posts the FULL merged
// player object here. zod only checks shape (right types); the actual
// business rule (a well-formed UTR profile link) is enforced once, by
// writeCurrentPlayerProfile itself — same split as every other migrated
// write path in lib/db/*.
export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = PlayerBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  try {
    await writeCurrentPlayerProfile(parsed.data, {
      supabase: ctx.supabase,
      userId: ctx.user.id,
      userEmail: ctx.user.email ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your profile. Try again." },
      { status: 500 }
    );
  }
}
