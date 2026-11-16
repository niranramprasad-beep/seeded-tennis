import { describe, expect, it } from "vitest";
import {
  FEATURE_TIER,
  FREE_TIER_TARGET_SCHOOL_LIMIT,
  TIER_RANK,
  type SubscriptionTier,
} from "./types";

// P1-PRICE-1. These constants are mirrored in SQL — migration 024 sets the
// coach_outreach write policy to has_tier('player') and caps Free accounts at
// the same target-school number. If someone changes one side without the
// other, the UI offers something the database then refuses (or vice versa),
// which is the worst of both: a paywall that lies in either direction.
//
// These tests can't read the database, so they lock the TypeScript half and
// name the SQL that has to agree. The real cross-check is the staging
// verification block at the bottom of 024.

const ORDER: SubscriptionTier[] = ["free", "player", "family"];

function hasTier(actual: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}

describe("tier ordering", () => {
  it("ranks free < player < family", () => {
    expect(TIER_RANK.free).toBeLessThan(TIER_RANK.player);
    expect(TIER_RANK.player).toBeLessThan(TIER_RANK.family);
  });

  it("treats a higher tier as satisfying a lower requirement", () => {
    // This is what Postgres has_tier() does too — family passes has_tier('player').
    expect(hasTier("family", "player")).toBe(true);
    expect(hasTier("player", "player")).toBe(true);
    expect(hasTier("free", "player")).toBe(false);
    expect(hasTier("player", "family")).toBe(false);
  });
});

describe("coach outreach is a Player feature, not Family", () => {
  // The headline of P1-PRICE-1: outreach is the core recruiting loop. Gating
  // it at $39 put the product's whole point behind the most expensive plan.
  it("requires exactly the player tier", () => {
    expect(FEATURE_TIER.outreach).toBe("player");
  });

  it("lets Player and Family in, and keeps Free out", () => {
    expect(hasTier("free", FEATURE_TIER.outreach)).toBe(false);
    expect(hasTier("player", FEATURE_TIER.outreach)).toBe(true);
    expect(hasTier("family", FEATURE_TIER.outreach)).toBe(true);
  });

  it("does not sit above the plan tier — you can't have outreach but no plan", () => {
    expect(TIER_RANK[FEATURE_TIER.outreach]).toBeLessThanOrEqual(
      TIER_RANK[FEATURE_TIER.family]
    );
    expect(FEATURE_TIER.outreach).toBe(FEATURE_TIER.plan);
  });
});

describe("free target-school limit", () => {
  it("is a real, usable number — not zero and not unlimited", () => {
    expect(FREE_TIER_TARGET_SCHOOL_LIMIT).toBe(3);
  });

  // Mirrors the trigger in migration 024: `new_count > limit AND NOT
  // has_tier('player')` raises. Anything at or under the limit is fine.
  function wouldBlock(tier: SubscriptionTier, count: number): boolean {
    return count > FREE_TIER_TARGET_SCHOOL_LIMIT && !hasTier(tier, "player");
  }

  it("allows a Free account up to the limit and blocks past it", () => {
    expect(wouldBlock("free", FREE_TIER_TARGET_SCHOOL_LIMIT)).toBe(false);
    expect(wouldBlock("free", FREE_TIER_TARGET_SCHOOL_LIMIT + 1)).toBe(true);
  });

  it("never blocks a paid tier at any count", () => {
    for (const tier of ORDER.filter((t) => t !== "free")) {
      for (const count of [0, 3, 4, 50]) {
        expect(wouldBlock(tier, count)).toBe(false);
      }
    }
  });

  it("never blocks an empty or single-school list", () => {
    for (const tier of ORDER) {
      expect(wouldBlock(tier, 0)).toBe(false);
      expect(wouldBlock(tier, 1)).toBe(false);
    }
  });
});
