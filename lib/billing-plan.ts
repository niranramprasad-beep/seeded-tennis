import { TIER_PRICE_USD, type SubscriptionTier } from "@/lib/types";
import {
  LEGACY_PLAN_PRICE_USD,
  intervalForPlanId,
  tierForPlanId,
  whopPlanIds,
  type WhopPlanIds,
} from "@/lib/whop";
import {
  TIER_NAME,
  type BillingMembership,
  type PaidPlanDescription,
  type PaidPlanStatus,
} from "@/lib/billing-view";

// What /settings/billing says about the plan somebody ACTUALLY pays for.
//
// Server-side and pure: it imports lib/whop (which carries the Whop SDK
// client), so it runs in app/api/whop/membership and in the dev preview's
// server page — never in a client component. Only the server can read the
// six WHOP_PLAN_* variables anyway. The browser half, which turns the result
// into what the page shows, is lib/billing-view.ts.
//
// The rule this file exists for: never show the current price table as if it
// were what somebody pays. The two legacy plans ($19 Player, $39 Family) are
// still billing real people, and a plan id we do not recognise could be
// anything — so the price comes from the plan id, or not at all.

/**
 * The plan a membership is actually on, from its Whop plan id.
 *
 *   WHOP_PLAN_PLAYER_MONTHLY / _YEARLY, WHOP_PLAN_FAMILY_MONTHLY / _YEARLY
 *       → that tier and interval, priced from TIER_PRICE_USD
 *   WHOP_PLAN_PLAYER / WHOP_PLAN_FAMILY (legacy, resolve-only)
 *       → that tier, monthly, priced from LEGACY_PLAN_PRICE_USD ($19 / $39)
 *   anything else, or no plan id
 *       → the profile's tier by name, no interval, no price
 *
 * `profileTier` is used only for an unknown plan id: the page can still say
 * "Family plan" (the profile says so) without claiming a price.
 */
export function describePaidPlan(
  planId: string | null | undefined,
  membership: BillingMembership,
  opts: { profileTier?: SubscriptionTier; ids?: WhopPlanIds } = {}
): PaidPlanDescription {
  const ids = opts.ids ?? whopPlanIds();
  // tierForPlanId is the ONE place a plan id becomes a tier (lib/whop.ts);
  // it answers "free" for anything it does not recognise.
  const planTier = tierForPlanId(planId, ids);
  const known = planTier !== "free";
  const tier: SubscriptionTier = known ? planTier : opts.profileTier ?? "free";
  const legacy = known && (planId === ids.legacyPlayer || planId === ids.legacyFamily);
  const interval = known ? intervalForPlanId(planId, ids) : null;

  let priceUsd: number | null = null;
  if (known && planId === ids.legacyPlayer) priceUsd = LEGACY_PLAN_PRICE_USD.legacyPlayer;
  else if (known && planId === ids.legacyFamily) priceUsd = LEGACY_PLAN_PRICE_USD.legacyFamily;
  else if (known && interval) priceUsd = TIER_PRICE_USD[planTier][interval];

  return {
    known,
    tier,
    tierName: TIER_NAME[tier],
    interval,
    legacy,
    priceUsd,
    status: planStatus(membership),
    periodEnd: membership.currentPeriodEnd ?? null,
  };
}

/** Whop's status, reduced to what the page says about it. */
export function planStatus(m: BillingMembership): PaidPlanStatus {
  if (m.status === "past_due" || m.status === "unresolved") return "past-due";
  if (m.status === "active" || m.status === "trialing" || m.status === "completed") {
    return m.cancelAtPeriodEnd ? "canceling" : "active";
  }
  return "ended";
}
