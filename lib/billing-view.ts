import type { BillingInterval, SubscriptionTier } from "@/lib/types";
import { formatDate } from "@/lib/time";

// The browser half of /settings/billing: what the page shows for a given
// membership lookup. Pure and client-safe — it must not import lib/whop
// (the Whop SDK client); the server half that knows the plan ids is
// lib/billing-plan.ts.
//
// Every state the page can be in is a value of BillingViewState, built by
// billingViewState() from plain inputs, so each is unit-tested and each can
// be rendered in /dev/billing-preview without signing in.

/** Whop's hosted member portal. Opened in the SAME tab, always: a new tab
 * hid the fact that the person had left Seeded. A membership's own
 * `manage_url` is preferred when the lookup returns one. */
export const WHOP_PORTAL_URL = "https://whop.com/@me/settings/memberships/";

export const SEE_PRICE_ON_WHOP = "See your price on Whop";

export const TIER_NAME: Record<SubscriptionTier, string> = {
  free: "Free",
  player: "Player",
  family: "Family",
};

/** The membership fields the page needs — a subset of Whop's `Membership`. */
export interface BillingMembership {
  /** Whop's lifecycle status: active, trialing, past_due, canceled, … */
  status: string;
  /** Whop's `current_period_end`: when the period renews, or when access
   * ends if the plan is canceling. ISO 8601. */
  currentPeriodEnd: string | null;
  /** Whop's `cancel_at_period_end`: cancelled, but paid up to the end. */
  cancelAtPeriodEnd: boolean;
}

export type PaidPlanStatus = "active" | "canceling" | "past-due" | "ended";

export interface PaidPlanDescription {
  /** Whether the plan id is one of the six configured in this environment. */
  known: boolean;
  /** The tier the plan grants. For an unknown plan id, the profile's tier. */
  tier: SubscriptionTier;
  tierName: string;
  /** Null when the plan id is unknown: we do not know how often it bills. */
  interval: BillingInterval | null;
  /** One of the two resolve-only plans from before the 2026-11-14 prices. */
  legacy: boolean;
  /** What this plan bills, in USD. Null = we do not know; never a guess. */
  priceUsd: number | null;
  status: PaidPlanStatus;
  /** Renewal date, or the date access ends. ISO, unformatted: the browser
   * formats it so it is the viewer's own local date. */
  periodEnd: string | null;
}

/** "$12 a month", "$99 a year", or null when we do not know the price. */
export function priceLine(plan: Pick<PaidPlanDescription, "priceUsd" | "interval">): string | null {
  if (plan.priceUsd == null || !plan.interval) return null;
  return `$${plan.priceUsd} ${plan.interval === "yearly" ? "a year" : "a month"}`;
}

export function intervalLabel(interval: BillingInterval | null): string | null {
  if (interval === "yearly") return "Yearly";
  if (interval === "monthly") return "Monthly";
  return null;
}

/** The viewer's local calendar date, or null for a missing/garbled value.
 * A date-only "2027-01-14" is read as local midnight — `new Date()` would
 * read it as UTC and show Jan 13 anywhere west of Greenwich. A full
 * timestamp is shown in the viewer's own timezone. */
export function billingDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  if (!isDateOnly && Number.isNaN(new Date(iso).getTime())) return null;
  return formatDate(iso);
}

/** First word of a display name, or null — never a placeholder. */
export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

// ---------------------------------------------------------------------------
// What /api/whop/membership answers, and what the page shows for it
// ---------------------------------------------------------------------------

/**
 *   none         the signed-in user holds no membership. The webhook and the
 *                post-checkout sync write `whop_membership_id` onto the
 *                BUYER's own profile only (lib/whop-sync.ts), so a paid tier
 *                without one means somebody else pays.
 *   unreachable  they hold one, but Whop (or our own config) did not answer.
 *                Says nothing about whether the plan is still live.
 *   found        the live membership, described by describePaidPlan().
 */
export type BillingLookup =
  | { kind: "none" }
  | { kind: "unreachable" }
  | { kind: "found"; plan: PaidPlanDescription; manageUrl: string | null };

export type BillingViewState =
  | { kind: "loading"; tier: SubscriptionTier }
  | { kind: "free" }
  | {
      kind: "payer";
      plan: PaidPlanDescription;
      portalUrl: string;
      /** The signed-in user's own first name — they are the payer. Null
       * when their profile has no name; the note then names nobody. */
      payerFirstName: string | null;
    }
  | {
      kind: "not-payer";
      tier: SubscriptionTier;
      tierName: string;
      /** Only from a source that does not read another user's `profiles`
       * row. Null means "we don't know who pays", and the copy never
       * guesses. */
      payerFirstName: string | null;
    }
  | { kind: "unreachable"; tier: SubscriptionTier; tierName: string };

export function billingViewState(input: {
  /** profiles.subscription_tier of the signed-in user. */
  tier: SubscriptionTier;
  /** Undefined while the lookup is still in flight. */
  lookup: BillingLookup | undefined;
  viewerName: string | null | undefined;
  /** Who pays, when someone else does — see the "not-payer" state. */
  otherPayerFirstName?: string | null;
}): BillingViewState {
  const { tier, lookup } = input;
  // The profile decides whether the app treats them as paid. A cancelled
  // membership keeps its id on the profile (whop-sync revokes the tier, not
  // the id), so an ended membership on a Free profile is simply Free.
  if (tier === "free") return { kind: "free" };
  if (!lookup) return { kind: "loading", tier };
  if (lookup.kind === "unreachable") return { kind: "unreachable", tier, tierName: TIER_NAME[tier] };
  if (lookup.kind === "none") {
    return {
      kind: "not-payer",
      tier,
      tierName: TIER_NAME[tier],
      payerFirstName: input.otherPayerFirstName ?? null,
    };
  }
  return {
    kind: "payer",
    plan: lookup.plan,
    portalUrl: lookup.manageUrl && isWhopUrl(lookup.manageUrl) ? lookup.manageUrl : WHOP_PORTAL_URL,
    payerFirstName: firstName(input.viewerName),
  };
}

/** The sentence shown before anyone is sent to Whop. */
export function whopHandoffNote(payerFirstName: string | null): string {
  return payerFirstName
    ? `Billing is handled by Whop. Sign in there as ${payerFirstName}, the person who pays.`
    : "Billing is handled by Whop. Sign in there with the account that pays.";
}

/** The sentence shown INSTEAD of sending a non-payer to Whop, where Whop
 * would only say "You do not have access to this page on this account". */
export function notPayerNote(payerFirstName: string | null): string {
  return payerFirstName
    ? `${payerFirstName} manages billing for your family. Ask them to change or cancel the plan.`
    : "The person who pays for Seeded manages billing from their own account.";
}

export const WHOP_UNREACHABLE_NOTE = "We can't reach Whop right now. Your plan is still active.";

/** Parses /api/whop/membership's body without trusting its shape. Anything
 * unexpected is "unreachable" — never "none", which would tell the person
 * who pays that somebody else does. */
export function parseBillingLookup(body: unknown): BillingLookup {
  const lookup = (body as { lookup?: unknown } | null)?.lookup as
    | { kind?: unknown; plan?: unknown; manageUrl?: unknown }
    | undefined;
  if (!lookup || typeof lookup !== "object") return { kind: "unreachable" };
  if (lookup.kind === "none") return { kind: "none" };
  if (lookup.kind === "found" && lookup.plan && typeof lookup.plan === "object") {
    const p = lookup.plan as PaidPlanDescription;
    if (typeof p.tier === "string" && typeof p.tierName === "string" && typeof p.status === "string") {
      return {
        kind: "found",
        plan: p,
        manageUrl: typeof lookup.manageUrl === "string" && isWhopUrl(lookup.manageUrl) ? lookup.manageUrl : null,
      };
    }
  }
  return { kind: "unreachable" };
}

/** Only ever send someone to Whop itself. */
function isWhopUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "whop.com" || u.hostname.endsWith(".whop.com"));
  } catch {
    return false;
  }
}
