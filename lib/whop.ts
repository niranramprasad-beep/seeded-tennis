import { WhopClient } from "@whop/sdk";
import type { BillingInterval, SubscriptionTier } from "@/lib/types";

// Null when WHOP_API_KEY isn't set yet, matching the rest of the app's
// pattern of degrading gracefully instead of crashing without optional keys.
let client: WhopClient | null = null;

export function getWhop(): WhopClient | null {
  const token = process.env.WHOP_API_KEY;
  if (!token) return null;
  if (!client) {
    client = new WhopClient({ token });
  }
  return client;
}

// ---------------------------------------------------------------------------
// The plan registry
// ---------------------------------------------------------------------------
// Whop models monthly and yearly as two separate plans (it calls them
// variants) on one product, so there are six ids in play, not two:
//
//   Player  (prod_J02fNUDMl7eEw)   $12/mo   $99/yr   + the old $19/mo
//   Family  (prod_tJaXXUiiq1J8x)   $19/mo   $159/yr  + the old $39/mo
//
// The two old plans are not decommissioned and must not be: people are
// subscribed on them. A webhook for one of those memberships has to resolve
// to the right tier for as long as anyone holds it, which is the entire
// reason `legacyPlayer`/`legacyFamily` still exist here. They are
// resolve-only — `planIdFor()` never returns one, so no new checkout can
// ever start on an old price.
//
// Read from the environment on every call rather than captured at module
// load, because a module-level snapshot is read once per server process:
// changing a plan id in Vercel would then need a redeploy to take effect,
// and — worse for us — tests could not set one.

export interface WhopPlanIds {
  playerMonthly?: string;
  playerYearly?: string;
  familyMonthly?: string;
  familyYearly?: string;
  /** $19/mo Player, sold Oct–Nov 2026. Resolve-only. */
  legacyPlayer?: string;
  /** $39/mo Family, sold Oct–Nov 2026. Resolve-only. */
  legacyFamily?: string;
}

export function whopPlanIds(env: NodeJS.ProcessEnv = process.env): WhopPlanIds {
  return {
    playerMonthly: env.WHOP_PLAN_PLAYER_MONTHLY,
    playerYearly: env.WHOP_PLAN_PLAYER_YEARLY,
    familyMonthly: env.WHOP_PLAN_FAMILY_MONTHLY,
    familyYearly: env.WHOP_PLAN_FAMILY_YEARLY,
    legacyPlayer: env.WHOP_PLAN_PLAYER,
    legacyFamily: env.WHOP_PLAN_FAMILY,
  };
}

/**
 * The plan to send a NEW checkout to. Never returns a legacy plan: the old
 * prices stay resolvable for people already on them, and unreachable for
 * anyone else.
 *
 * `undefined` means that plan is not configured in this environment — the
 * caller must treat it as "this tier can't be bought right now" rather than
 * falling back to another plan, because falling back would charge somebody
 * the wrong price.
 */
export function planIdFor(
  tier: SubscriptionTier,
  interval: BillingInterval,
  ids: WhopPlanIds = whopPlanIds()
): string | undefined {
  if (tier === "player") return interval === "yearly" ? ids.playerYearly : ids.playerMonthly;
  if (tier === "family") return interval === "yearly" ? ids.familyYearly : ids.familyMonthly;
  return undefined; // free is not a plan anybody buys
}

/**
 * Which tier a membership on `planId` grants. The ONE place a plan id turns
 * into a tier — the webhook and the post-checkout sync both call this, so
 * they cannot disagree about what somebody paid for.
 *
 * Unknown or missing plan id resolves to "free", deliberately: an event we
 * cannot attribute to a plan must not grant paid access. The caller decides
 * whether that means "downgrade" or "ignore" — see applyMembershipToProfile.
 */
export function tierForPlanId(
  planId: string | null | undefined,
  ids: WhopPlanIds = whopPlanIds()
): SubscriptionTier {
  if (!planId) return "free";
  if (planId === ids.playerMonthly || planId === ids.playerYearly || planId === ids.legacyPlayer) {
    return "player";
  }
  if (planId === ids.familyMonthly || planId === ids.familyYearly || planId === ids.legacyFamily) {
    return "family";
  }
  return "free";
}

/** The billing interval of a known plan, or null when it is not one of ours.
 * Legacy plans were monthly. Used for the GA4 purchase value, so that a
 * renewal on the old $19 Player plan is not reported as the new $12 one. */
export function intervalForPlanId(
  planId: string | null | undefined,
  ids: WhopPlanIds = whopPlanIds()
): BillingInterval | null {
  if (!planId) return null;
  if (planId === ids.playerYearly || planId === ids.familyYearly) return "yearly";
  if (
    planId === ids.playerMonthly ||
    planId === ids.familyMonthly ||
    planId === ids.legacyPlayer ||
    planId === ids.legacyFamily
  ) {
    return "monthly";
  }
  return null;
}

/**
 * What a membership on this plan actually bills, in USD.
 *
 * NOT `TIER_PRICE_USD[tier][interval]` for the legacy plans: somebody on the
 * old $19 Player plan is still paying $19, and reporting their renewal to
 * GA4 as $12 would quietly understate revenue. Returns null when the plan is
 * not one of ours, which the caller must treat as "don't report a number"
 * rather than as zero.
 */
export const LEGACY_PLAN_PRICE_USD = { legacyPlayer: 19, legacyFamily: 39 } as const;

export function priceUsdForPlanId(
  planId: string | null | undefined,
  prices: Record<SubscriptionTier, Record<BillingInterval, number>>,
  ids: WhopPlanIds = whopPlanIds()
): number | null {
  if (!planId) return null;
  if (planId === ids.legacyPlayer) return LEGACY_PLAN_PRICE_USD.legacyPlayer;
  if (planId === ids.legacyFamily) return LEGACY_PLAN_PRICE_USD.legacyFamily;
  const tier = tierForPlanId(planId, ids);
  const interval = intervalForPlanId(planId, ids);
  if (tier === "free" || !interval) return null;
  return prices[tier][interval];
}

/** Every plan id configured in this environment, newest prices first. Used by
 * the post-checkout sync to ask Whop "any membership on one of my plans for
 * this person?" without needing a product id as well. */
export function allConfiguredPlanIds(ids: WhopPlanIds = whopPlanIds()): string[] {
  return [
    ids.playerMonthly,
    ids.playerYearly,
    ids.familyMonthly,
    ids.familyYearly,
    ids.legacyPlayer,
    ids.legacyFamily,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
}
