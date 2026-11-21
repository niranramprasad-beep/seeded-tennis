import { describe, expect, it } from "vitest";
import { FAMILY_INCLUDED_LABEL, accountPlanEntry, planButtonState } from "./plan-entry";
import { CHECKOUT_FAMILY_ALREADY } from "./checkout-messages";

// final-check PR E review (MEDIUM): a parent whose family is unlocked by
// ANOTHER member's Family plan has subscription_tier 'free' on their own
// row. Keyed on that alone, Settings said "Plan: Free · See plans" and
// /pricing offered "Choose Family" — a second Family checkout.

describe("accountPlanEntry", () => {
  const locked = { unlocked: false };
  const unlocked = { unlocked: true };

  it("shows nothing until the tier is known (no See plans -> Plan and billing flicker)", () => {
    expect(accountPlanEntry({ tierHydrated: false, tier: "free", familyPlan: unlocked })).toEqual({ kind: "loading" });
    expect(accountPlanEntry({ tierHydrated: false, tier: "family", familyPlan: undefined })).toEqual({ kind: "loading" });
  });

  it("own paid tier -> billing, whatever the family", () => {
    for (const tier of ["player", "family"] as const) {
      for (const familyPlan of [undefined, locked, unlocked]) {
        expect(accountPlanEntry({ tierHydrated: true, tier, familyPlan })).toEqual({ kind: "billing" });
      }
    }
  });

  it("Free waits for the family's plan before offering anything", () => {
    expect(accountPlanEntry({ tierHydrated: true, tier: "free", familyPlan: undefined })).toEqual({ kind: "loading" });
  });

  it("Free in a locked family (or none) -> See plans", () => {
    expect(accountPlanEntry({ tierHydrated: true, tier: "free", familyPlan: locked })).toEqual({ kind: "see-plans" });
  });

  it("Free in a family someone else unlocked -> included, not See plans", () => {
    expect(accountPlanEntry({ tierHydrated: true, tier: "free", familyPlan: unlocked })).toEqual({ kind: "family-included" });
  });
});

describe("planButtonState: /pricing never sells a family a second Family plan", () => {
  const base = { signedIn: true, tier: "free" as const, planName: "Family", loadingTier: null };

  it("Free viewer, family unlocked: Family is disabled and says why", () => {
    const b = planButtonState({ ...base, planTier: "family", familyUnlocked: true });
    expect(b).toMatchObject({ disabled: true, includedAlready: true, current: false, label: FAMILY_INCLUDED_LABEL });
  });

  it("Free viewer, family unlocked: Player is still a real purchase for themselves", () => {
    const b = planButtonState({ ...base, planTier: "player", planName: "Player", familyUnlocked: true });
    expect(b).toMatchObject({ disabled: false, label: "Choose Player" });
  });

  it("Player viewer, family unlocked: Family is withheld too", () => {
    const b = planButtonState({ ...base, tier: "player", planTier: "family", familyUnlocked: true });
    expect(b).toMatchObject({ disabled: true, label: FAMILY_INCLUDED_LABEL });
  });

  it("the payer on Family sees Current plan, not 'included'", () => {
    const b = planButtonState({ ...base, tier: "family", planTier: "family", familyUnlocked: true });
    expect(b).toMatchObject({ current: true, disabled: true, label: "Current plan" });
  });

  it("locked family: Choose Family as before", () => {
    const b = planButtonState({ ...base, planTier: "family", familyUnlocked: false });
    expect(b).toMatchObject({ disabled: false, label: "Choose Family" });
  });

  it("signed out: unaffected (Start free / Choose …)", () => {
    expect(planButtonState({ ...base, signedIn: false, planTier: "free", planName: "Free", familyUnlocked: false }).label).toBe("Start free");
    expect(planButtonState({ ...base, signedIn: false, planTier: "family", familyUnlocked: true }).label).toBe("Choose Family");
  });

  it("below your own tier: 'Included in your plan'", () => {
    const b = planButtonState({ ...base, tier: "family", planTier: "player", planName: "Player", familyUnlocked: true });
    expect(b).toMatchObject({ disabled: true, label: "Included in your plan" });
  });

  it("the click-before-status-loaded guard says nothing was charged", () => {
    expect(CHECKOUT_FAMILY_ALREADY).toMatch(/nothing was charged/);
  });
});
