import { describe, expect, it } from "vitest";
import { resolveFamilyPlayerFacts } from "./family-view";
import type { Player } from "./types";

// Behavioural cover for the bug a text grep could not hold (see
// lib/family-view.ts). Every case here is a shape /family really produces.

const parentViewer = {
  currentUTR: 7, // the emptyPlayer placeholder a parent profile used to carry
  graduationYear: 2028, // the PARENT's own, meaningless as a class year
  gender: "male",
  role: "parent",
} as Pick<Player, "currentUTR" | "graduationYear" | "gender" | "role">;

const playerViewer = {
  currentUTR: 8.2,
  graduationYear: 2027,
  gender: "female",
  role: "player",
} as Pick<Player, "currentUTR" | "graduationYear" | "gender" | "role">;

describe("a parent's own profile never stands in for the player's", () => {
  it("reports nothing when the family has no player member", () => {
    const f = resolveFamilyPlayerFacts(undefined, parentViewer);
    expect(f.currentUtr).toBeNull();
    expect(f.graduationYear).toBeNull();
    expect(f.gender).toBeNull();
    expect(f.hasLinkedPlayer).toBe(false);
    // The exact symptom that started this: 7.0 on screen for a NULL rating.
    expect(f.currentUtr).not.toBe(7);
    expect(f.graduationYear).not.toBe(2028);
  });

  it("keeps a player member's nulls null instead of borrowing the viewer's", () => {
    const f = resolveFamilyPlayerFacts(
      { currentUtr: null, graduationYear: null, gender: undefined },
      parentViewer
    );
    expect(f.currentUtr).toBeNull();
    expect(f.graduationYear).toBeNull();
    expect(f.gender).toBeNull();
    expect(f.hasLinkedPlayer).toBe(true);
  });

  it("never borrows the parent's gender, which would pick the growth curve", () => {
    const f = resolveFamilyPlayerFacts(
      { currentUtr: 7.4, graduationYear: 2029, gender: undefined },
      { ...parentViewer, gender: "male" }
    );
    expect(f.gender).toBeNull();
  });

  it("uses the player member's real values when it has them", () => {
    const f = resolveFamilyPlayerFacts(
      { currentUtr: 7.4, graduationYear: 2029, gender: "female" },
      parentViewer
    );
    expect(f).toEqual({
      currentUtr: 7.4,
      graduationYear: 2029,
      gender: "female",
      hasLinkedPlayer: true,
    });
  });
});

describe("a player viewing their own family describes themselves", () => {
  it("uses their own row when the roster has not loaded yet", () => {
    const f = resolveFamilyPlayerFacts(undefined, playerViewer);
    expect(f).toEqual({
      currentUtr: 8.2,
      graduationYear: 2027,
      gender: "female",
      hasLinkedPlayer: true,
    });
  });

  it("treats their own placeholder UTR as not tracked", () => {
    // 0 is the "no UTR logged yet" sentinel (lib/data/user.ts).
    const f = resolveFamilyPlayerFacts(undefined, { ...playerViewer, currentUTR: 0 });
    expect(f.currentUtr).toBeNull();
  });
});
