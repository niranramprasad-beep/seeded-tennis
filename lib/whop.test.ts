import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { unwrapWebhook, WebhookVerificationError } from "@whop/sdk/helpers";
import { TIER_PRICE_USD, yearlySavingsPercent, type SubscriptionTier } from "./types";
import {
  allConfiguredPlanIds,
  intervalForPlanId,
  planIdFor,
  priceUsdForPlanId,
  tierForPlanId,
  type WhopPlanIds,
} from "./whop";

// The six real plan ids, read from the Whop API on 2026-11-14 against
// products prod_J02fNUDMl7eEw (Player) and prod_tJaXXUiiq1J8x (Family).
// Hardcoded here on purpose: this is the mapping a mistake in which charges
// somebody the wrong price or hands them the wrong tier, and a test that
// read them from the environment would pass against an empty environment.
const IDS: WhopPlanIds = {
  playerMonthly: "plan_iWNSNKqks0ddp", // $12 / month
  playerYearly: "plan_uh50GMFYQVxAc", // $99 / year
  familyMonthly: "plan_0z5e439ZymJC9", // $19 / month
  familyYearly: "plan_06ceyeQdTKF29", // $159 / year
  legacyPlayer: "plan_TdtqfjDqtjGOq", // $19 / month, sold from 2026-10-03
  legacyFamily: "plan_8ybt0oV8kZ79m", // $39 / month, sold from 2026-10-03
};

describe("every plan id resolves to the right tier", () => {
  it("maps all six", () => {
    expect(tierForPlanId(IDS.playerMonthly, IDS)).toBe("player");
    expect(tierForPlanId(IDS.playerYearly, IDS)).toBe("player");
    expect(tierForPlanId(IDS.familyMonthly, IDS)).toBe("family");
    expect(tierForPlanId(IDS.familyYearly, IDS)).toBe("family");
    expect(tierForPlanId(IDS.legacyPlayer, IDS)).toBe("player");
    expect(tierForPlanId(IDS.legacyFamily, IDS)).toBe("family");
  });

  it("keeps people on the OLD plans on their tier", () => {
    // The whole reason the legacy ids are still in the registry. Somebody
    // bought Player at $19/mo on 2026-10-03; a webhook for that membership
    // arriving today must still say "player", not "free".
    expect(tierForPlanId(IDS.legacyPlayer, IDS)).toBe("player");
    expect(tierForPlanId(IDS.legacyFamily, IDS)).toBe("family");
  });

  it("does not confuse the new Family monthly with the old Player monthly", () => {
    // Both are $19. If the mapping ever went through price instead of id,
    // this is the pair that would break, and it would break silently by
    // giving a Family customer the Player tier.
    expect(TIER_PRICE_USD.family.monthly).toBe(19);
    expect(tierForPlanId(IDS.familyMonthly, IDS)).toBe("family");
    expect(tierForPlanId(IDS.legacyPlayer, IDS)).toBe("player");
    expect(IDS.familyMonthly).not.toBe(IDS.legacyPlayer);
  });

  it("resolves anything it does not recognise to free, not to a paid tier", () => {
    for (const unknown of ["plan_somethingelse", "", null, undefined, "prod_J02fNUDMl7eEw"]) {
      expect(tierForPlanId(unknown, IDS)).toBe("free");
    }
  });

  it("does not match a tier when that plan is unconfigured", () => {
    // An empty env var must not make `undefined === undefined` true and
    // hand out a tier for a missing plan id.
    expect(tierForPlanId(undefined, {})).toBe("free");
    expect(tierForPlanId("plan_iWNSNKqks0ddp", {})).toBe("free");
  });
});

describe("a new checkout never starts on an old price", () => {
  it("returns the new plans for each tier and interval", () => {
    expect(planIdFor("player", "monthly", IDS)).toBe(IDS.playerMonthly);
    expect(planIdFor("player", "yearly", IDS)).toBe(IDS.playerYearly);
    expect(planIdFor("family", "monthly", IDS)).toBe(IDS.familyMonthly);
    expect(planIdFor("family", "yearly", IDS)).toBe(IDS.familyYearly);
  });

  it("never returns a legacy plan", () => {
    const sellable = (["player", "family"] as const).flatMap((tier) =>
      (["monthly", "yearly"] as const).map((interval) => planIdFor(tier, interval, IDS))
    );
    expect(sellable).not.toContain(IDS.legacyPlayer);
    expect(sellable).not.toContain(IDS.legacyFamily);
  });

  it("returns undefined rather than falling back when a plan is unconfigured", () => {
    // A fallback here charges somebody the wrong price. The route turns this
    // into "that plan isn't available right now".
    expect(planIdFor("player", "yearly", { playerMonthly: IDS.playerMonthly })).toBeUndefined();
  });

  it("has no plan for free", () => {
    expect(planIdFor("free", "monthly", IDS)).toBeUndefined();
  });
});

describe("what a membership actually bills", () => {
  it("reports the legacy price for a legacy plan, not the new one", () => {
    // Somebody renewing on the old $19 Player plan is still paying $19.
    // Reporting $12 to GA4 would quietly understate revenue every month.
    expect(priceUsdForPlanId(IDS.legacyPlayer, TIER_PRICE_USD, IDS)).toBe(19);
    expect(priceUsdForPlanId(IDS.legacyFamily, TIER_PRICE_USD, IDS)).toBe(39);
  });

  it("reports the current price for the current plans", () => {
    expect(priceUsdForPlanId(IDS.playerMonthly, TIER_PRICE_USD, IDS)).toBe(12);
    expect(priceUsdForPlanId(IDS.playerYearly, TIER_PRICE_USD, IDS)).toBe(99);
    expect(priceUsdForPlanId(IDS.familyMonthly, TIER_PRICE_USD, IDS)).toBe(19);
    expect(priceUsdForPlanId(IDS.familyYearly, TIER_PRICE_USD, IDS)).toBe(159);
  });

  it("returns null — never 0 — for a plan it does not know", () => {
    // 0 would be reported to GA4 as a free sale. null means "don't report".
    expect(priceUsdForPlanId("plan_nope", TIER_PRICE_USD, IDS)).toBeNull();
    expect(priceUsdForPlanId(null, TIER_PRICE_USD, IDS)).toBeNull();
  });

  it("knows which interval each plan bills on", () => {
    expect(intervalForPlanId(IDS.playerYearly, IDS)).toBe("yearly");
    expect(intervalForPlanId(IDS.familyYearly, IDS)).toBe("yearly");
    expect(intervalForPlanId(IDS.playerMonthly, IDS)).toBe("monthly");
    expect(intervalForPlanId(IDS.legacyFamily, IDS)).toBe("monthly");
    expect(intervalForPlanId("plan_nope", IDS)).toBeNull();
  });
});

describe("the configured plan list", () => {
  it("includes legacy plans, so the sync can find an old membership", () => {
    expect(allConfiguredPlanIds(IDS)).toHaveLength(6);
    expect(allConfiguredPlanIds(IDS)).toContain(IDS.legacyPlayer);
  });

  it("drops unset and empty ids rather than querying for an empty string", () => {
    expect(allConfiguredPlanIds({ playerMonthly: "plan_a", playerYearly: "" })).toEqual(["plan_a"]);
    expect(allConfiguredPlanIds({})).toEqual([]);
  });
});

describe("the prices themselves", () => {
  it("makes yearly cheaper than twelve months of monthly for every paid tier", () => {
    for (const tier of ["player", "family"] as const) {
      expect(TIER_PRICE_USD[tier].yearly).toBeLessThan(TIER_PRICE_USD[tier].monthly * 12);
      expect(yearlySavingsPercent(tier)).toBeGreaterThan(0);
    }
  });

  it("keeps Family above Player at both intervals", () => {
    expect(TIER_PRICE_USD.family.monthly).toBeGreaterThan(TIER_PRICE_USD.player.monthly);
    expect(TIER_PRICE_USD.family.yearly).toBeGreaterThan(TIER_PRICE_USD.player.yearly);
  });

  it("charges nothing for free", () => {
    const free: SubscriptionTier = "free";
    expect(TIER_PRICE_USD[free].monthly).toBe(0);
    expect(yearlySavingsPercent("free")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------
// Against the real verifier the route uses, not a reimplementation of it.
// Whop signs with the Standard Webhooks scheme over
// `${id}.${timestamp}.${body}`, and the `@whop/sdk` helper base64-encodes
// the `ws_` secret before handing it to the library (see its own comment —
// the library base64-DECODES whatever it is given, and `_` is not in the
// base64 alphabet, so passing the secret raw throws rather than failing
// verification cleanly).

const SECRET = "ws_test_secret_value_for_unit_tests";

function sign(payload: string, { id = "msg_test", timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const key = Buffer.from(SECRET, "utf8");
  const signature = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
  };
}

describe("webhook signature verification", () => {
  const body = JSON.stringify({
    type: "membership.activated",
    data: { id: "mem_1", status: "active", plan_id: IDS.playerMonthly },
  });

  it("accepts a correctly signed payload and returns the parsed body", () => {
    const event = unwrapWebhook<{ type: string }>(body, { headers: sign(body), key: SECRET });
    expect(event.type).toBe("membership.activated");
  });

  it("rejects a body that changed after signing", () => {
    // The exact bytes matter: this is why the route reads req.text() and
    // never req.json().
    const headers = sign(body);
    const tampered = body.replace('"plan_id":"plan_iWNSNKqks0ddp"', `"plan_id":"${IDS.familyYearly}"`);
    expect(tampered).not.toBe(body);
    expect(() => unwrapWebhook(tampered, { headers, key: SECRET })).toThrow(
      WebhookVerificationError
    );
  });

  it("rejects a signature made with a different secret", () => {
    const headers = sign(body);
    expect(() => unwrapWebhook(body, { headers, key: `${SECRET}_other` })).toThrow(
      WebhookVerificationError
    );
  });

  it("rejects a stale timestamp", () => {
    const old = Math.floor(Date.now() / 1000) - 60 * 60 * 24;
    expect(() => unwrapWebhook(body, { headers: sign(body, { timestamp: old }), key: SECRET })).toThrow(
      WebhookVerificationError
    );
  });

  it("rejects a missing signature header", () => {
    const headers = sign(body);
    delete (headers as Record<string, string>)["webhook-signature"];
    expect(() => unwrapWebhook(body, { headers, key: SECRET })).toThrow(WebhookVerificationError);
  });

  it("refuses to verify at all without a key", () => {
    // Not a verification failure — a configuration one, and it must be loud
    // rather than quietly accepting everything.
    expect(() => unwrapWebhook(body, { headers: sign(body), key: undefined })).toThrow();
  });
});
