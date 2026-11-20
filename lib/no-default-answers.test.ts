import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A player's team and grade decide every fit band and every date Seeded
// shows them. Both sign-up forms used to start them pre-chosen — "Male" and
// 10th on email sign-up, "Women's" and 10th after Google — so a player who
// didn't touch them was stored as whatever Seeded picked (audit for 049,
// 2026-11-20). They now start unanswered and a player must choose.
//
// A PARENT is not asked either: their own row (never shown) gets the shared
// PARENT_ROW_GENDER / PARENT_ROW_GRADE in every sign-up path. The paths used
// to disagree (email "male", Google "female").

const SIGNUP = join("components", "auth", "signup-flow.tsx");
const OAUTH = join("components", "auth", "complete-oauth-signup.tsx");
const DIAG_SAVE = join("components", "seeded", "onboarding", "diagnostic", "diagnostic-save.tsx");

describe("sign-up never pre-answers a player's team or grade", () => {
  for (const file of [SIGNUP, OAUTH]) {
    it(`${file}: grade and gender start unanswered`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/const \[grade, setGrade\] = useState<number \| null>\(null\)/);
      expect(src).toMatch(/const \[gender, setGender\] = useState<PlayerGender \| null>\(null\)/);
      expect(src).not.toMatch(/useState\(10\)/);
      expect(src).toMatch(/Choose your grade in school\./);
    });
  }

  it("email sign-up hides team and grade from a parent", () => {
    const src = readFileSync(SIGNUP, "utf8");
    for (const name of ["signup-gender", "signup-grade"]) {
      const at = src.indexOf(`name="${name}"`);
      expect(at).toBeGreaterThan(-1);
      // The nearest conditional opened before the chip is the parent guard.
      const before = src.slice(Math.max(0, at - 400), at);
      expect(before).toMatch(/\{!isParentSignup && \(\s*<ChipRadioGroup/);
    }
  });

  it("every parent path writes the same shared constants, never a bare value", () => {
    for (const file of [SIGNUP, OAUTH, DIAG_SAVE]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("PARENT_ROW_GENDER");
      expect(src).toContain("PARENT_ROW_GRADE");
      expect(src).not.toMatch(/gender(?::| \?\?)\s*"(?:male|female)"/);
      expect(src).not.toMatch(/grade:\s*10\b/);
    }
  });
});
