import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { writeCurrentPlayerProfile } from "@/lib/auth";
import { PlayerBodySchema, playerWriteFromBody } from "@/lib/api-schemas/profile";
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

  // The caller's own row, read server-side: role and tier both come from the
  // database, never from the body (which is the client's merged Player and
  // carries a `role` the client could set to anything).
  const { data: own } = await ctx.supabase
    .from("profiles")
    .select("role, subscription_tier")
    .eq("id", ctx.user.id)
    .maybeSingle();

  // A PARENT account writes its name and nothing else through this route.
  //
  // The client posts the whole merged Player on every save, so a parent
  // saving their name used to write a defaulted gender, graduation_year,
  // target list and UTR fields onto their own row — invented stats about
  // the parent that nothing should read. And Settings used to show a parent
  // the player-profile form outright. Parents follow a player; they do not
  // have tennis data of their own. Settings no longer offers the fields, and
  // this makes the route refuse them regardless of what the screen sends.
  //
  // Scope, stated plainly: RLS lets any account update ITS OWN profile row,
  // so a parent going around this route straight to PostgREST could still
  // write those columns on their own row. They can never write the
  // player's row (profiles_update_own is `id = auth.uid()`), and family
  // screens never read the parent's row for player facts
  // (resolveFamilyPlayerFacts).
  if (own?.role === "parent") {
    const name = parsed.data.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }
    const { error } = await ctx.supabase.from("profiles").update({ name }).eq("id", ctx.user.id);
    if (error) {
      return NextResponse.json({ error: "Could not save your name. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
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
    const tier = (own?.subscription_tier ?? "free") as SubscriptionTier;
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
    // parsed.data as-is: an ABSENT birthMonth / enrollmentTerm stays
    // undefined, so writeCurrentPlayerProfile leaves the stored value alone.
    // (Coercing absent to null here once let an older client's body wipe a
    // stored enrollment term; lib/profile-route-absent-fields.test.ts.)
    await writeCurrentPlayerProfile(
      playerWriteFromBody(parsed.data),
      {
        supabase: ctx.supabase,
        userId: ctx.user.id,
        userEmail: ctx.user.email ?? null,
      }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save your profile. Try again." },
      { status: 500 }
    );
  }
}
