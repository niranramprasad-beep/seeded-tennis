import { NextResponse } from "next/server";
import { getRequestScopedSupabase } from "@/lib/api-auth";
import { rateLimited } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { allConfiguredPlanIds, getWhop } from "@/lib/whop";
import { ACCESS_GRANTING_STATUSES, applyMembershipToProfile } from "@/lib/whop-sync";

// The safety net. Called when someone lands back on Seeded with
// `?checkout=success` — see components/shared/checkout-sync.tsx.
//
// WHY IT EXISTS: the webhook is the right mechanism and it has never once
// fired. Two real payments (2026-10-03, 2026-11-02) left the buyer on the
// free tier because the only thing that could have upgraded them was an
// endpoint Whop was never delivering to. A person who has just been charged
// should not be one misconfigured dashboard field away from getting nothing.
//
// WHY IT IS SERVER-SIDE: `subscription_tier` is a privileged column — the
// 022 trigger rejects any client write to it, which is the entire point of
// P0-1. So the client cannot do this even dishonestly. The tier written here
// comes from Whop's own API, never from the request body; the only thing the
// caller supplies is their own bearer token.
//
// WHY IT IS SAFE TO CALL REPEATEDLY: applyMembershipToProfile is idempotent
// and carries the same anti-downgrade guard as the webhook. Running it on a
// page load that already has the right tier is a no-op returning
// "already-current".
//
// WHAT IT DOES NOT DO: invent a tier. If Whop cannot be reached, or the API
// key cannot read memberships, it says so and changes nothing. A safety net
// that guesses is worse than one that admits it failed — the failure is
// visible and a person can fix it; a guess is a free subscription or a
// wrongly-charged customer.

export async function POST(req: Request) {
  const ctx = await getRequestScopedSupabase(req);
  if (!ctx) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  // Shares the checkout bucket: same surface, same user, and 20/hour covers
  // both starting a checkout and returning from one many times over.
  const limited = await rateLimited(ctx.supabase, "whop_checkout");
  if (limited) return limited;

  const admin = getSupabaseAdmin();
  const whop = getWhop();
  if (!admin || !whop) {
    return NextResponse.json({ synced: false, reason: "not-configured" });
  }

  const planIds = allConfiguredPlanIds();
  if (planIds.length === 0) {
    return NextResponse.json({ synced: false, reason: "no-plans-configured" });
  }

  // Find a membership of ours that names this account.
  //
  // Whop has no "list memberships by metadata" filter, so this asks per
  // plan and matches on metadata.supabase_user_id. Six plans × a page each
  // is a handful of calls on a path that runs once after a purchase, which
  // is a fine trade against the alternative: storing a Whop user id we do
  // not otherwise need.
  let matched: { id: string; planId: string | null; status: string } | null = null;
  let reachedWhop = false;

  for (const planId of planIds) {
    if (matched) break;
    try {
      const page = await whop.memberships.list({ plan_id: planId, first: 25 });
      reachedWhop = true;
      for await (const membership of page) {
        const metadata = membership.metadata as Record<string, unknown> | null;
        if (metadata?.supabase_user_id !== ctx.user.id) continue;
        const status = String(membership.status ?? "");
        // Prefer an access-granting membership if the person has more than
        // one on record; otherwise take the first match so a cancellation
        // still reconciles.
        if (!matched || ACCESS_GRANTING_STATUSES.has(status)) {
          // `memberships.list` returns the flat Membership shape
          // (`plan_id`), unlike the webhook payload, which may serialize the
          // nested one. Falls back to the plan we filtered by, which is the
          // same id by construction.
          matched = { id: membership.id, planId: membership.plan_id ?? planId, status };
        }
        if (ACCESS_GRANTING_STATUSES.has(status)) break;
      }
    } catch {
      // Keep going: one unreadable plan should not abandon the others. If
      // every call fails, `reachedWhop` stays false and we say so below
      // rather than reporting "no membership found", which would be a
      // different and wrong answer.
      continue;
    }
  }

  if (!reachedWhop) {
    // The local API key currently 401s on memberships.list — it can read
    // public plan data and nothing of the account's own. If that is also
    // true of the production key, this is the branch that fires, and it is
    // important that it reads as "could not check", not "nothing to do".
    return NextResponse.json({ synced: false, reason: "whop-unreachable" }, { status: 502 });
  }

  if (!matched) {
    return NextResponse.json({ synced: false, reason: "no-membership-found" });
  }

  const outcome = await applyMembershipToProfile(admin, {
    supabaseUserId: ctx.user.id,
    membershipId: matched.id,
    planId: matched.planId,
    status: matched.status,
  });

  return NextResponse.json({
    synced: outcome.applied,
    reason: outcome.reason,
    tier: outcome.applied ? outcome.tier : undefined,
  });
}
