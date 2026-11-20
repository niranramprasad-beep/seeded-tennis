// Everything /pricing SAYS, as data — prices, the yearly saving, the plan
// cards and the comparison table. Pure TypeScript (no React), so the tests in
// pricing-data.test.ts can check every string against the constants it is
// supposed to come from.
//
// Two rules this file exists to keep:
//   1. CLAUDE.md: prices live only in TIER_PRICE_USD (lib/types). Nothing
//      here types a dollar amount — every figure is derived.
//   2. Board 19: the comparison table is GENERATED from FEATURE_TIER. The
//      table cannot claim a tier gets something the gating does not give it,
//      and cannot forget a gated feature: COMPARE_FEATURES is a
//      Record over FEATURE_TIER's keys, so a new key fails the typecheck, and
//      pricing-data.test.ts fails the build at runtime too.

import {
  FAMILY_PLAN_MAX_PARENTS,
  FAMILY_PLAN_MAX_PLAYERS,
  FAMILY_PLAN_SCOPE_LABEL,
  FEATURE_TIER,
  FREE_TIER_TARGET_SCHOOL_LIMIT,
  TIER_PRICE_USD,
  TIER_RANK,
  formatTierPrice,
  yearlyAsMonthlyLabel,
  yearlySavingsPercent,
  type BillingInterval,
  type SubscriptionTier,
} from "@/lib/types";
import type { CatalogCounts } from "@/lib/db/schools";

export const TIERS: readonly SubscriptionTier[] = ["free", "player", "family"] as const;
const PAID_TIERS: readonly SubscriptionTier[] = ["player", "family"] as const;

export const TIER_NAME: Record<SubscriptionTier, string> = {
  free: "Free",
  player: "Player",
  family: "Family",
};

/** True when `tier` gets something that needs `required`. Same ordering as
 * Postgres has_tier(): family passes a player check. */
export function tierIncludes(tier: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[required];
}

// ---------------------------------------------------------------- prices

/** "$45" — same shape as formatTierPrice, for an amount that is not a list
 * price (the yearly saving). This is Seeded's own subscription price, not a
 * school's cost, which is what the per-year price guard in
 * lib/no-invented-school-data.test.ts is about. */
function formatUsd(amount: number): string {
  return "$" + amount;
}

/** What a year saves against twelve monthly payments, in dollars. */
function yearlySavingsUsd(tier: SubscriptionTier): number {
  const { monthly, yearly } = TIER_PRICE_USD[tier];
  return monthly * 12 - yearly;
}

/**
 * The toggle's "save about N%". The smallest saving across the paid tiers,
 * so "about N%" is never more than either plan actually saves. At today's
 * prices: Player 31%, Family 30% -> 30.
 */
function yearlySavingsAboutPercent(): number {
  return Math.min(...PAID_TIERS.map((t) => yearlySavingsPercent(t)));
}

export function yearlyToggleLabel(): string {
  // Never "N months free" — Board 19. It was wrong in the customer's favour
  // at today's prices and reads as a promotion rather than a price.
  return `Yearly · save about ${yearlySavingsAboutPercent()}%`;
}

export interface PriceBlock {
  /** "$99" — the big mono number. */
  amount: string;
  /** "per year" / "per month" / "forever". */
  cadence: string;
  /** The one line under the price. */
  note: string;
}

export function priceBlockFor(tier: SubscriptionTier, interval: BillingInterval): PriceBlock {
  if (tier === "free") {
    return { amount: formatTierPrice("free", interval), cadence: "forever", note: "No card needed." };
  }
  if (interval === "yearly") {
    return {
      amount: formatTierPrice(tier, "yearly"),
      cadence: "per year",
      note: `About ${yearlyAsMonthlyLabel(tier)} a month. Saves ${formatUsd(yearlySavingsUsd(tier))} a year.`,
    };
  }
  return {
    amount: formatTierPrice(tier, "monthly"),
    cadence: "per month",
    note: `Or ${formatTierPrice(tier, "yearly")} a year.`,
  };
}

// ---------------------------------------------------- target-school cap

/**
 * The tier that lifts the target-school cap. Mirrors migration 024/040's
 * trigger, which refuses growth past FREE_TIER_TARGET_SCHOOL_LIMIT unless
 * `has_tier('player')` — and lib/hooks/use-star-schools.ts's
 * `canAccess("player")`. Change all three together.
 */
const TARGET_CAP_LIFTED_AT: SubscriptionTier = "player";

function targetSchoolsLabel(tier: SubscriptionTier): string {
  return tierIncludes(tier, TARGET_CAP_LIFTED_AT) ? "Unlimited" : String(FREE_TIER_TARGET_SCHOOL_LIMIT);
}

// ------------------------------------------------------------ plan cards

export interface PlanCard {
  tier: SubscriptionTier;
  name: string;
  tagline: string;
  features: string[];
  /**
   * Parallel to `features`: the FEATURE_TIER key each line advertises, or
   * null for a line that is free for everyone / a limit / "Everything in".
   * pricing-data.test.ts holds every gated line to its card's tier and every
   * ungated line to an explicit allow-list, so a card can't advertise a
   * feature its tier doesn't unlock (independent review, 2026-11-16).
   */
  gates: (GatedFeature | null)[];
  recommended: boolean;
}

export function planCards(counts: CatalogCounts): PlanCard[] {
  return [
    {
      tier: "free",
      name: TIER_NAME.free,
      tagline: "See where you fit.",
      features: [
        // Counted from the catalogue, never typed — lib/copy-honesty.test.ts
        // bans a literal program count anywhere in shipped copy.
        `Browse ${counts.total} ${counts.divisionLabel} programs`,
        "Your fit report",
        `Track ${targetSchoolsLabel("free")} target schools`,
        "Every school page",
      ],
      gates: [null, null, null, null],
      recommended: false,
    },
    {
      tier: "player",
      name: TIER_NAME.player,
      tagline: "Know what to do every week.",
      features: [
        "Everything in Free",
        `${targetSchoolsLabel("player")} target schools`,
        "Coach outreach: drafts and a pipeline",
        "Your year-by-year roadmap",
      ],
      gates: [null, null, "outreach", "plan"],
      recommended: true,
    },
    {
      tier: "family",
      name: TIER_NAME.family,
      // Migration 045: one plan, one family, capped. The database enforces
      // both halves (family_has_tier, join_family, approve_family_join).
      tagline: `${FAMILY_PLAN_SCOPE_LABEL}.`,
      features: [
        "Everything in Player",
        "Parent dashboard, read-only",
        "Season budget for the family",
        // "in the app": the report is a page the parent opens, computed when
        // they open it. Seeded sends no email, so the line must not read as
        // something that arrives.
        "Weekly family report in the app",
      ],
      gates: [null, "family", "family", "family"],
      recommended: false,
    },
  ];
}

// ------------------------------------------------------ comparison table

export type GatedFeature = keyof typeof FEATURE_TIER;

const COMPARE_GROUPS = ["Schools", "Planning", "Family"] as const;
export type CompareGroup = (typeof COMPARE_GROUPS)[number];

/**
 * Display labels for each gated feature, keyed by FEATURE_TIER's own keys.
 * The tier is NOT here — it is read from FEATURE_TIER when the rows are
 * built. A `Record` over the keys means a new FEATURE_TIER key is a type
 * error until it is given a label and a group here.
 */
export const COMPARE_FEATURES: Record<GatedFeature, { group: CompareGroup; rows: string[] }> = {
  outreach: {
    group: "Schools",
    rows: ["Coach email drafts from your results", "Outreach pipeline, from researching to committed"],
  },
  plan: {
    group: "Planning",
    rows: ["Your year-by-year roadmap", "Training calendar you fill in yourself"],
  },
  family: {
    group: "Family",
    rows: ["Parent dashboard, read-only", "Season budget for the family", "Weekly family report in the app"],
  },
};

/**
 * Things no tier gates — public pages and client-side maths over the public
 * catalogue. Required tier is "free" because nothing checks one, not
 * because someone decided to give it away; a paywall that cannot be
 * enforced is a claim, not a feature.
 */
export const ALWAYS_FREE_FEATURES: { group: CompareGroup; label: string }[] = [
  { group: "Schools", label: "Every school page" },
  { group: "Schools", label: "Your fit report" },
  { group: "Schools", label: "What-if UTR slider on the school list" },
  { group: "Planning", label: "Tournament fit checker" },
];

export type CompareCell = { kind: "check"; included: boolean } | { kind: "text"; value: string };

export interface CompareRow {
  label: string;
  /** Which FEATURE_TIER key this row came from; null for ungated rows. */
  source: GatedFeature | "target-limit" | "family-size" | null;
  cells: Record<SubscriptionTier, CompareCell>;
}

function checkCells(required: SubscriptionTier): Record<SubscriptionTier, CompareCell> {
  return {
    free: { kind: "check", included: tierIncludes("free", required) },
    player: { kind: "check", included: tierIncludes("player", required) },
    family: { kind: "check", included: tierIncludes("family", required) },
  };
}

export function compareGroups(): { group: CompareGroup; rows: CompareRow[] }[] {
  return COMPARE_GROUPS.map((group) => {
    const rows: CompareRow[] = [];

    for (const f of ALWAYS_FREE_FEATURES) {
      if (f.group === group) rows.push({ label: f.label, source: null, cells: checkCells("free") });
    }

    if (group === "Schools") {
      rows.push({
        label: "Target schools",
        source: "target-limit",
        cells: {
          free: { kind: "text", value: targetSchoolsLabel("free") },
          player: { kind: "text", value: targetSchoolsLabel("player") },
          family: { kind: "text", value: targetSchoolsLabel("family") },
        },
      });
    }

    for (const key of Object.keys(FEATURE_TIER) as GatedFeature[]) {
      const display = COMPARE_FEATURES[key];
      if (display.group !== group) continue;
      for (const label of display.rows) {
        rows.push({ label, source: key, cells: checkCells(FEATURE_TIER[key]) });
      }
    }

    if (group === "Family") {
      // 045: what one Family plan covers. The caps come from lib/types, which
      // lib/family-plan-scope.test.ts pins to the migration.
      rows.push({
        label: "Family size",
        source: "family-size",
        cells: {
          free: { kind: "check", included: false },
          player: { kind: "check", included: false },
          family: {
            kind: "text",
            value: `1 family: ${FAMILY_PLAN_MAX_PLAYERS} players, ${FAMILY_PLAN_MAX_PARENTS} parents`,
          },
        },
      });
    }

    return { group, rows };
  });
}
