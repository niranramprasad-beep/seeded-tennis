import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TIER_PRICE_USD } from "./types";
import { LEGACY_PLAN_PRICE_USD, type WhopPlanIds } from "./whop";
import { describePaidPlan, planStatus } from "./billing-plan";
import {
  SEE_PRICE_ON_WHOP,
  WHOP_PORTAL_URL,
  billingDate,
  billingViewState,
  firstName,
  notPayerNote,
  parseBillingLookup,
  priceLine,
  whopHandoffNote,
  type BillingMembership,
  type PaidPlanDescription,
} from "./billing-view";

// Fake ids on purpose: what matters is which of the six slots an id is in,
// not its value (lib/whop.test.ts pins the real ones).
const IDS: WhopPlanIds = {
  playerMonthly: "plan_pm",
  playerYearly: "plan_py",
  familyMonthly: "plan_fm",
  familyYearly: "plan_fy",
  legacyPlayer: "plan_legacy_p",
  legacyFamily: "plan_legacy_f",
};

const ACTIVE: BillingMembership = {
  status: "active",
  currentPeriodEnd: "2026-12-14T17:00:00.000Z",
  cancelAtPeriodEnd: false,
};

describe("describePaidPlan: the plan they ACTUALLY pay for", () => {
  it("maps each current plan to tier, interval and its TIER_PRICE_USD price", () => {
    const cases = [
      ["plan_pm", "player", "monthly", TIER_PRICE_USD.player.monthly],
      ["plan_py", "player", "yearly", TIER_PRICE_USD.player.yearly],
      ["plan_fm", "family", "monthly", TIER_PRICE_USD.family.monthly],
      ["plan_fy", "family", "yearly", TIER_PRICE_USD.family.yearly],
    ] as const;
    for (const [id, tier, interval, price] of cases) {
      const d = describePaidPlan(id, ACTIVE, { ids: IDS });
      expect(d, id).toMatchObject({ known: true, tier, interval, priceUsd: price, legacy: false });
    }
  });

  it("shows the legacy plans at their OWN price, not today's", () => {
    const p = describePaidPlan("plan_legacy_p", ACTIVE, { ids: IDS });
    expect(p).toMatchObject({ tier: "player", interval: "monthly", legacy: true, priceUsd: LEGACY_PLAN_PRICE_USD.legacyPlayer });
    expect(p.priceUsd).not.toBe(TIER_PRICE_USD.player.monthly);
    expect(priceLine(p)).toBe("$19 a month");

    const f = describePaidPlan("plan_legacy_f", ACTIVE, { ids: IDS });
    expect(f).toMatchObject({ tier: "family", interval: "monthly", legacy: true, priceUsd: 39 });
  });

  it("an unknown plan id names the profile's tier and claims no price", () => {
    const d = describePaidPlan("plan_something_else", ACTIVE, { ids: IDS, profileTier: "family" });
    expect(d).toMatchObject({ known: false, tier: "family", tierName: "Family", interval: null, priceUsd: null });
    expect(priceLine(d)).toBeNull();
  });

  it("a missing plan id is unknown, not free-and-priced", () => {
    const d = describePaidPlan(null, ACTIVE, { ids: IDS, profileTier: "player" });
    expect(d).toMatchObject({ known: false, tier: "player", priceUsd: null });
  });

  it("an unconfigured environment cannot match an undefined plan id", () => {
    const d = describePaidPlan(undefined, ACTIVE, { ids: {}, profileTier: "player" });
    expect(d.known).toBe(false);
    expect(d.legacy).toBe(false);
    expect(d.priceUsd).toBeNull();
  });

  it("carries the period end through unformatted", () => {
    expect(describePaidPlan("plan_pm", ACTIVE, { ids: IDS }).periodEnd).toBe(ACTIVE.currentPeriodEnd);
  });
});

describe("planStatus", () => {
  it("active, cancelled-but-active, past due, ended", () => {
    expect(planStatus(ACTIVE)).toBe("active");
    expect(planStatus({ ...ACTIVE, status: "trialing" })).toBe("active");
    expect(planStatus({ ...ACTIVE, cancelAtPeriodEnd: true })).toBe("canceling");
    expect(planStatus({ ...ACTIVE, status: "past_due" })).toBe("past-due");
    expect(planStatus({ ...ACTIVE, status: "canceled" })).toBe("ended");
    expect(planStatus({ ...ACTIVE, status: "expired" })).toBe("ended");
  });
});

describe("billingViewState: every state the page can show", () => {
  const found = (plan: PaidPlanDescription, manageUrl: string | null = null) =>
    ({ kind: "found", plan, manageUrl }) as const;

  it("Free has no portal at all, whatever the lookup says", () => {
    expect(billingViewState({ tier: "free", lookup: undefined, viewerName: "Wei Chen" })).toEqual({ kind: "free" });
    const ended = describePaidPlan("plan_pm", { ...ACTIVE, status: "canceled" }, { ids: IDS });
    expect(billingViewState({ tier: "free", lookup: found(ended), viewerName: "Wei" })).toEqual({ kind: "free" });
  });

  it("loading while the lookup is in flight", () => {
    expect(billingViewState({ tier: "player", lookup: undefined, viewerName: "Wei" }).kind).toBe("loading");
  });

  it("the payer sees their plan and is told to sign in to Whop as themselves", () => {
    const plan = describePaidPlan("plan_py", ACTIVE, { ids: IDS });
    const v = billingViewState({ tier: "player", lookup: found(plan), viewerName: "Wei Chen" });
    expect(v).toEqual({ kind: "payer", plan, portalUrl: WHOP_PORTAL_URL, payerFirstName: "Wei" });
  });

  it("prefers the membership's own Whop manage_url, but only a Whop one", () => {
    const plan = describePaidPlan("plan_pm", ACTIVE, { ids: IDS });
    const own = billingViewState({ tier: "player", lookup: found(plan, "https://whop.com/billing/manage/mem_1"), viewerName: "W" });
    expect(own.kind === "payer" && own.portalUrl).toBe("https://whop.com/billing/manage/mem_1");
    const evil = billingViewState({ tier: "player", lookup: found(plan, "https://evil.example/whop.com"), viewerName: "W" });
    expect(evil.kind === "payer" && evil.portalUrl).toBe(WHOP_PORTAL_URL);
  });

  it("a paid profile with no membership of its own is NOT the payer", () => {
    const v = billingViewState({ tier: "family", lookup: { kind: "none" }, viewerName: "Maya Chen" });
    expect(v).toEqual({ kind: "not-payer", tier: "family", tierName: "Family", payerFirstName: null });
  });

  it("never names a payer it was not told", () => {
    const v = billingViewState({ tier: "family", lookup: { kind: "none" }, viewerName: "Maya" });
    expect(v.kind === "not-payer" && notPayerNote(v.payerFirstName)).toBe(
      "The person who pays for Seeded manages billing from their own account."
    );
    const named = billingViewState({ tier: "family", lookup: { kind: "none" }, viewerName: "Maya", otherPayerFirstName: "Wei" });
    expect(named.kind === "not-payer" && notPayerNote(named.payerFirstName)).toBe(
      "Wei manages billing for your family. Ask them to change or cancel the plan."
    );
  });

  it("Whop failing is its own calm state — never 'none', never Free", () => {
    const v = billingViewState({ tier: "player", lookup: { kind: "unreachable" }, viewerName: "Wei" });
    expect(v).toEqual({ kind: "unreachable", tier: "player", tierName: "Player" });
  });
});

describe("copy", () => {
  it("the Whop hand-off names the payer, or nobody", () => {
    expect(whopHandoffNote("Wei")).toBe("Billing is handled by Whop. Sign in there as Wei, the person who pays.");
    expect(whopHandoffNote(null)).not.toMatch(/as \w+,/);
  });

  it("an unknown price says where to see it", () => {
    expect(SEE_PRICE_ON_WHOP).toBe("See your price on Whop");
  });

  it("firstName never invents one", () => {
    expect(firstName("  Wei   Chen ")).toBe("Wei");
    expect(firstName("")).toBeNull();
    expect(firstName(null)).toBeNull();
  });

  it("yearly prices read per year", () => {
    expect(priceLine({ priceUsd: 99, interval: "yearly" })).toBe("$99 a year");
  });
});

describe("billingDate is the viewer's local date", () => {
  const original = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterEach(() => {
    process.env.TZ = original;
  });

  it("a date-only value is not shifted a day back by UTC", () => {
    expect(billingDate("2027-01-14")).toBe("Jan 14, 2027");
  });

  it("a timestamp is shown in the viewer's timezone", () => {
    // 03:00 UTC on Dec 15 is still Dec 14 in California.
    expect(billingDate("2026-12-15T03:00:00.000Z")).toBe("Dec 14, 2026");
  });

  it("missing or garbled is null, never 'Invalid Date'", () => {
    expect(billingDate(null)).toBeNull();
    expect(billingDate("not a date")).toBeNull();
  });
});

describe("parseBillingLookup trusts nothing", () => {
  it("anything unexpected is 'unreachable', never 'none'", () => {
    expect(parseBillingLookup(null)).toEqual({ kind: "unreachable" });
    expect(parseBillingLookup({ membership: null })).toEqual({ kind: "unreachable" });
    expect(parseBillingLookup({ lookup: { kind: "found" } })).toEqual({ kind: "unreachable" });
    expect(parseBillingLookup({ lookup: { kind: "none" } })).toEqual({ kind: "none" });
  });

  it("keeps a found plan and drops a non-Whop manage url", () => {
    const plan = describePaidPlan("plan_fm", ACTIVE, { ids: IDS });
    expect(parseBillingLookup({ lookup: { kind: "found", plan, manageUrl: "javascript:alert(1)" } })).toEqual({
      kind: "found",
      plan,
      manageUrl: null,
    });
  });
});
