import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { writeCurrentPlayerProfile } from "@/lib/auth";
import { PlayerBodySchema } from "@/lib/api-schemas/profile";
import {
  FREE_TIER_TARGET_SCHOOL_LIMIT,
  TIER_RANK,
  type SubscriptionTier,
} from "@/lib/types";

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

  // S-6: one shared, Postgres-backed limiter for every write route. Fails
  // closed — see lib/rate-limit.ts.
  const limited = await rateLimited(ctx.supabase, "profile_write");
  if (limited) return limited;

  const json = await req.json().catch(() => null);
  const parsed = PlayerBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  // Free accounts may track FREE_TIER_TARGET_SCHOOL_LIMIT schools. This check
  // is NOT the gate — migration 024's trigger is, because `profiles` is
  // directly PATCHable through PostgREST and anything enforced only here can
  // be routed around (the P0-1 lesson). This exists so the common path gets a
  // clear sentence instead of a raw Postgres check_violation.
  //
  // Read the tier server-side from the caller's own row; never trust a tier
  // sent in the body.
  if (parsed.data.targetSchoolSlugs.length > FREE_TIER_TARGET_SCHOOL_LIMIT) {
    const { data: profile } = await ctx.supabase
      .from("profiles")
      .select("subscription_tier")
      .eq("id", ctx.user.id)
      .maybeSingle();

    const tier = (profile?.subscription_tier ?? "free") as SubscriptionTier;
    if (TIER_RANK[tier] < TIER_RANK.player) {
      return NextResponse.json(
        {
          error: `Free accounts can track up to ${FREE_TIER_TARGET_SCHOOL_LIMIT} schools. Upgrade to Player to track more.`,
        },
        { status: 403 }
      );
    }
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
