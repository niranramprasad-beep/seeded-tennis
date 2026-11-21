import { TIER_RANK, type SubscriptionTier } from "@/lib/types";

// What the Settings Account cards and the /pricing buttons offer, given the
// viewer's OWN tier and their family's plan. Pure, so every case is tested
// (lib/plan-entry.test.ts) — the components only render the answer.
//
// Why the family matters (final-check PR E review): a Family plan unlocks a
// whole family (042/045, `my_family_has_tier('family')`), but
// `subscription_tier` is per profile. A parent whose family is unlocked by
// another member's Family plan has tier 'free' on their own row, so a card
// keyed on the viewer's tier alone said "Plan: Free · See plans", and
// /pricing then offered "Choose Family" — a second Family checkout for a
// family that already has one.
//
// What a Family plan does NOT do: raise anyone else's OWN tier. The 024/040
// target-school cap is `has_tier('player')` on the caller's own row, so a
// player on Free in an unlocked family is still on Free for their own
// limits — which is why the player card keeps "See plans" (buying Player
// for themselves is a real purchase) and only the Family purchase is
// withheld.

export const FAMILY_INCLUDED_LABEL = "Included in your family's plan";

export const FAMILY_TOOLS_INCLUDED_NOTE = "Your family's Family plan covers the family tools.";

/** The shape lib/db/family-plan.ts returns; only `unlocked` matters here. */
export interface FamilyPlanLike {
  unlocked: boolean;
}

export type AccountPlanEntry =
  /** Tier or family status not known yet: show neither button (no flicker
   * from "See plans" to "Plan and billing"). */
  | { kind: "loading" }
  /** Own paid tier: "Plan and billing" -> /settings/billing. */
  | { kind: "billing" }
  /** Own tier Free, nothing unlocked: "See plans" -> /pricing. */
  | { kind: "see-plans" }
  /** Own tier Free, family unlocked by someone else's Family plan. */
  | { kind: "family-included" };

export function accountPlanEntry(input: {
  tierHydrated: boolean;
  tier: SubscriptionTier;
  /** Undefined while loading. */
  familyPlan: FamilyPlanLike | undefined;
}): AccountPlanEntry {
  if (!input.tierHydrated) return { kind: "loading" };
  if (input.tier !== "free") return { kind: "billing" };
  if (!input.familyPlan) return { kind: "loading" };
  return input.familyPlan.unlocked ? { kind: "family-included" } : { kind: "see-plans" };
}

export interface PlanButtonState {
  /** Signed in AND on exactly this tier. */
  current: boolean;
  /** Signed in on a higher tier, or (Family) the family already has it —
   * never a checkout target. */
  includedAlready: boolean;
  loading: boolean;
  disabled: boolean;
  label: string;
}

/** One /pricing card's button. */
export function planButtonState(input: {
  signedIn: boolean;
  tier: SubscriptionTier;
  planTier: SubscriptionTier;
  planName: string;
  loadingTier: SubscriptionTier | null;
  /** True when the viewer's family is already unlocked by a Family plan. */
  familyUnlocked: boolean;
}): PlanButtonState {
  const { signedIn, tier, planTier, planName, loadingTier, familyUnlocked } = input;
  const current = signedIn && tier === planTier;
  // Any plan ranked below what the user already has must never start a
  // checkout — clicking Player while on Family would open a brand-new Whop
  // checkout for a tier already exceeded.
  const belowOwn = !current && TIER_RANK[planTier] < TIER_RANK[tier];
  // A second Family plan for a family that already has one.
  const familyHasIt = signedIn && !current && planTier === "family" && familyUnlocked;
  const includedAlready = belowOwn || familyHasIt;
  const loading = loadingTier === planTier;
  const label = loading
    ? "Redirecting..."
    : current
      ? "Current plan"
      : familyHasIt
        ? FAMILY_INCLUDED_LABEL
        : includedAlready
          ? "Included in your plan"
          : !signedIn && planTier === "free"
            ? "Start free"
            : `Choose ${planName}`;
  return { current, includedAlready, loading, disabled: current || includedAlready || loading, label };
}
