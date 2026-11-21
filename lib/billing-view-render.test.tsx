import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TIER_PRICE_USD } from "./types";
import { describePaidPlan } from "./billing-plan";
import type { WhopPlanIds } from "./whop";
import {
  NOT_PAYER_SELF_NOTE,
  WHOP_PORTAL_URL,
  WHOP_UNREACHABLE_NOTE,
  billingViewState,
  type BillingLookup,
  type BillingMembership,
} from "./billing-view";
import { BillingContent } from "@/components/seeded/settings/billing-content";

// final-check PR E: /settings/billing, rendered — not just the state
// machine (lib/billing-plan.test.ts covers that), but what each state puts
// on the screen: which plan name and price, and which links. The rule that
// matters most is the not-payer one: a paid profile with no membership of
// its own gets the honest sentence and NO link to Whop, because Whop would
// answer a non-payer with "You do not have access to this page on this
// account".

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

function render(input: Parameters<typeof billingViewState>[0], onRetry?: () => void): string {
  const view = billingViewState(input);
  return renderToStaticMarkup(createElement(BillingContent, { view, familyMembers: [], onRetry }));
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

describe("/settings/billing renders each state honestly", () => {
  it("free: 'You're on Free' and one link, to /pricing — nothing to Whop", () => {
    const html = render({ tier: "free", lookup: undefined, viewerName: "Fake Final" });
    expect(text(html)).toContain("You're on Free");
    expect(hrefs(html)).toEqual(["/pricing"]);
  });

  const PAID: Array<[string, "player" | "family", "monthly" | "yearly", string]> = [
    ["plan_pm", "player", "monthly", "a month"],
    ["plan_py", "player", "yearly", "a year"],
    ["plan_fm", "family", "monthly", "a month"],
    ["plan_fy", "family", "yearly", "a year"],
  ];
  for (const [planId, tier, interval, per] of PAID) {
    it(`payer on ${tier} ${interval}: the plan name, the TIER_PRICE_USD price, and Whop links only`, () => {
      const plan = describePaidPlan(planId, ACTIVE, { ids: IDS });
      const lookup: BillingLookup = { kind: "found", plan, manageUrl: null };
      const html = render({ tier, lookup, viewerName: "Fake Final Parent" });
      const t = text(html);
      expect(t).toContain(`${tier === "player" ? "Player" : "Family"} plan`);
      expect(t).toContain(`$${TIER_PRICE_USD[tier][interval]} ${per}`);
      expect(t).toContain("Sign in there as Fake, the person who pays.");
      // Every action on the payer's page is the Whop portal from the lookup
      // (here the default portal, since the lookup had no manage_url).
      const links = hrefs(html);
      expect(links.length).toBeGreaterThanOrEqual(3);
      for (const h of links) expect(h).toBe(WHOP_PORTAL_URL);
      expect(html).not.toMatch(/_blank/);
    });
  }

  it("payer: the membership's own Whop manage_url wins when the lookup has one", () => {
    const plan = describePaidPlan("plan_pm", ACTIVE, { ids: IDS });
    const manageUrl = "https://whop.com/billing/manage/mem_fake/";
    const html = render({ tier: "player", lookup: { kind: "found", plan, manageUrl }, viewerName: null });
    for (const h of hrefs(html)) expect(h).toBe(manageUrl);
  });

  it("not-payer: the honest sentence, and no Whop link and no 'Manage billing' at all", () => {
    for (const tier of ["player", "family"] as const) {
      const html = render({ tier, lookup: { kind: "none" }, viewerName: "Fake Final Child" });
      const t = text(html);
      expect(t).toContain("The person who pays for Seeded manages billing from their own account.");
      expect(t).toContain(NOT_PAYER_SELF_NOTE);
      expect(hrefs(html)).toEqual([]);
      expect(html).not.toMatch(/whop\.com\/|<a\b/);
      expect(t).not.toMatch(/manage billing|change plan|cancel plan|update card/i);
    }
  });

  it("unreachable: the calm note and a Try again button, no Whop link", () => {
    const html = render({ tier: "family", lookup: { kind: "unreachable" }, viewerName: null }, () => {});
    const t = text(html);
    expect(t).toContain(WHOP_UNREACHABLE_NOTE);
    expect(t).toContain("Try again");
    expect(hrefs(html)).toEqual([]);
  });
});
