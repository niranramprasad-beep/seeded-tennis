import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A player's team and grade decide every fit band and every date Seeded
// shows them. Both sign-up forms used to start them pre-chosen — "Male" and
// 10th on email sign-up, "Women's" and 10th after Google — so a player who
// didn't touch them was stored as whatever Seeded picked (audit for 049,
// 2026-11-20). They now start unanswered and a player must choose; a
// parent's own row (never shown) gets the documented PARENT_ROW_GRADE.

const FORMS = [
  join("components", "auth", "signup-flow.tsx"),
  join("components", "auth", "complete-oauth-signup.tsx"),
];

describe("sign-up never pre-answers a player's team or grade", () => {
  for (const file of FORMS) {
    it(`${file}: grade and gender start unanswered`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/const \[grade, setGrade\] = useState<number \| null>\(null\)/);
      expect(src).toMatch(/const \[gender, setGender\] = useState<PlayerGender \| null>\(null\)/);
      expect(src).not.toMatch(/useState\(10\)/);
      expect(src).toMatch(/Choose your grade in school\./);
    });
  }

  it("a parent's row grade is the one named constant, not a bare 10", () => {
    const save = readFileSync(join("components", "seeded", "onboarding", "diagnostic", "diagnostic-save.tsx"), "utf8");
    expect(save).not.toMatch(/grade:\s*10\b/);
    expect(save).toContain("grade: PARENT_ROW_GRADE");
  });
});
