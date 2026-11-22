import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/api-auth";
import { getWhop } from "@/lib/whop";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { describePaidPlan } from "@/lib/billing-plan";
import type { BillingLookup } from "@/lib/billing-view";
import { TIER_RANK, type SubscriptionTier } from "@/lib/types";
import { logServerError } from "@/lib/server-log";

const ROUTE = "/api/whop/membership";

// Read-only companion to /settings/billing — never mutates anything.
//
// Reads the signed-in user's OWN profile row (by id) for
// `whop_membership_id`, which only the webhook and the post-checkout sync
// write, and only onto the BUYER's profile (lib/whop-sync.ts). So:
//
//   no membership id  → { kind: "none" }: this person does not pay. The page
//                       does not send them to Whop, where they would only be
//                       told "You do not have access to this page on this
//                       account."
//   Whop unanswerable → { kind: "unreachable" }: never "none" and never a
//                       downgrade — not being able to ask is not an answer.
//   otherwise         → { kind: "found" }: the plan they ACTUALLY pay for,
//                       from the membership's own plan id (describePaidPlan),
//                       not today's price table.
//
// Nothing here can change a subscription; memberships.retrieve() is a GET.
// It never reads another user's profile: who pays for a family is not
// something this route can learn without doing so, and it does not try.
export async function GET(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const respond = (lookup: BillingLookup) => NextResponse.json({ lookup });

  const admin = getSupabaseAdmin();
  if (!admin) return respond({ kind: "unreachable" });

  const { data: profile, error } = await admin
    .from("profiles")
    .select("subscription_tier, whop_membership_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    logServerError("whop.membership.profile_read_failed", error, { route: ROUTE });
    return respond({ kind: "unreachable" });
  }

  const membershipId = profile?.whop_membership_id as string | null | undefined;
  if (!membershipId) return respond({ kind: "none" });

  const whop = getWhop();
  if (!whop) return respond({ kind: "unreachable" });

  const rawTier = profile?.subscription_tier as string | null | undefined;
  const profileTier: SubscriptionTier | undefined =
    rawTier && rawTier in TIER_RANK ? (rawTier as SubscriptionTier) : undefined;

  try {
    const membership = await whop.memberships.retrieve({ id: membershipId });
    const plan = describePaidPlan(
      // `variant_id` is the plan id on the current API version — see the
      // webhook's notes on why `plan_id` / `plan.id` are not.
      membership.variant_id,
      {
        status: membership.status,
        currentPeriodEnd: membership.current_period_end,
        cancelAtPeriodEnd: membership.cancel_at_period_end,
      },
      { profileTier }
    );
    return respond({ kind: "found", plan, manageUrl: membership.manage_url });
  } catch (err) {
    logServerError("whop.membership.retrieve_failed", err, { route: ROUTE });
    // A Whop hiccup, a rotated key, or a membership Whop no longer returns.
    // The page says "We can't reach Whop right now. Your plan is still
    // active." and offers a retry — it never claims the plan is gone.
    return respond({ kind: "unreachable" });
  }
}
