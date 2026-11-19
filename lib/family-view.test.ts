import { describe, expect, it } from "vitest";
import {
  firstNameLastInitial,
  multiPlayerNote,
  parentScopeSentence,
  parentSidebarNote,
  pickFamilyPlayer,
  resolveFamilyPlayerFacts,
} from "./family-view";
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

describe("pickFamilyPlayer: every family screen agrees on which child", () => {
  const parent = { id: "p", role: "parent", createdAt: "2026-01-01T00:00:00Z" };
  const older = { id: "b", role: "player", createdAt: "2026-02-01T00:00:00Z" };
  const younger = { id: "a", role: "player", createdAt: "2026-03-01T00:00:00Z" };

  it("is independent of the order family_members() returns", () => {
    expect(pickFamilyPlayer([parent, younger, older])?.id).toBe("b");
    expect(pickFamilyPlayer([older, younger, parent])?.id).toBe("b");
    expect(pickFamilyPlayer([younger, parent, older])?.id).toBe("b");
  });

  it("breaks a tie on id, and never picks a parent", () => {
    const x = { id: "x", role: "player", createdAt: "2026-02-01T00:00:00Z" };
    expect(pickFamilyPlayer([x, older])?.id).toBe("b");
    expect(pickFamilyPlayer([parent])).toBeUndefined();
    expect(pickFamilyPlayer([])).toBeUndefined();
  });

  it("puts a member with no join date last rather than first", () => {
    const undated = { id: "0", role: "player", createdAt: undefined };
    expect(pickFamilyPlayer([undated, younger])?.id).toBe("a");
  });
});

describe("how a parent's screens name people", () => {
  it("first name and last initial", () => {
    expect(firstNameLastInitial("Bailey Post035")).toBe("Bailey P.");
    expect(firstNameLastInitial("  Ana  María  López ")).toBe("Ana L.");
    expect(firstNameLastInitial("Bailey")).toBe("Bailey");
    expect(firstNameLastInitial("")).toBe("Your player");
    expect(firstNameLastInitial(null)).toBe("Your player");
  });

  it("the scope sentence names both people and the two things a parent can write", () => {
    const s = parentScopeSentence("Drew", "Bailey");
    expect(s).toMatch(/^Drew · parent of Bailey · /);
    expect(s).toMatch(/read-only for you/);
    expect(s).toMatch(/season budget/);
    expect(s).toMatch(/notes/);
    // Never claims the parent can change the player's own data.
    expect(s).not.toMatch(/you can (edit|change|update) (bailey's|their) (profile|results|plan)/i);
  });

  it("with no player yet, says so instead of describing nobody", () => {
    expect(parentScopeSentence("Drew", null)).toMatch(/No player has joined/);
  });

  it("the sidebar note names the child and the two things a parent can write (Board 22)", () => {
    expect(parentSidebarNote("Bailey")).toBe(
      "You're viewing Bailey's account. You can edit the budget and send notes. Everything else is Bailey's."
    );
    expect(parentSidebarNote(null)).toMatch(/No player has joined/);
  });

  it("a two-player family is told which child the page shows", () => {
    const one = [{ role: "player" }, { role: "parent" }];
    const two = [{ role: "player" }, { role: "player" }, { role: "parent" }];
    expect(multiPlayerNote(one, "Bailey")).toBeNull();
    expect(multiPlayerNote(two, "Bailey")).toBe("Your family has 2 players. This page shows Bailey, who joined first.");
  });
});
