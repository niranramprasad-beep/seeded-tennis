import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifySchoolFit, countSchoolFits } from "@/lib/school-fit";
import { hasRealUtr } from "@/lib/utils";
import { emptyPlayer } from "@/lib/data/user";
import { syntheticUtrHistoryFor } from "@/lib/what-if-utr";

// P0 from the launch UI review: a logged-out visitor opening /schools was
// shown "Reach 37 · Target 0 · Likely 0", every row banded "Reach", and
// "You 0.0" on all 37 range bars — all of it computed against the
// `currentUTR <= 0` sentinel.
//
// This is the regression guard. It has two halves, because either alone
// would be defeatable:
//
//  1. A BEHAVIOURAL proof that the sentinel really does produce a wrong
//     answer, so nobody can argue the guard is theatre and delete it.
//  2. A SOURCE check that the browser gates its derived output on
//     hasRealUtr(), because the rendering itself needs a DOM this suite
//     does not run.
//
// Half 2 is a lint, not a proof — same honest caveat as
// lib/db/family-scope.test.ts carries. It can tell you the gate is
// present; it cannot tell you every branch respects it.

const BROWSER = "components/seeded/schools/seeded-schools-browser.tsx";

const SAMPLE = [
  { minCompetitiveUTR: 9.1, avgRosterUTR: 10.2, usNewsRanking: 10 },
  { minCompetitiveUTR: 7.4, avgRosterUTR: 8.6, usNewsRanking: 40 },
  { minCompetitiveUTR: 11.0, avgRosterUTR: 12.4, usNewsRanking: 4 },
];

describe("the UTR sentinel is detectably wrong, which is why the guard exists", () => {
  it("emptyPlayer carries the sentinel, not a plausible rating", () => {
    expect(emptyPlayer.currentUTR).toBe(0);
    expect(hasRealUtr(emptyPlayer.currentUTR)).toBe(false);
  });

  it("classifying against the sentinel calls every program a Reach", () => {
    const projection = {
      utrHistory: syntheticUtrHistoryFor({ currentUTR: 0, targetUTR: 0, graduationYear: 2028 }),
      graduationYear: 2028,
    };
    const counts = countSchoolFits(0, SAMPLE, projection);
    // This is the bug, asserted: 0 is below every team floor, so the
    // honest classifier honestly reports the whole catalogue as a Reach.
    // That is a true answer to a meaningless question, and showing it to a
    // visitor is the thing being prevented.
    expect(counts.likely).toBe(0);
    expect(counts.target).toBe(0);
    expect(counts.reach + counts.outOfRange).toBe(SAMPLE.length);
  });

  it("a real rating produces a spread of bands, so the guard is not hiding a broken classifier", () => {
    const projection = {
      utrHistory: syntheticUtrHistoryFor({ currentUTR: 10.5, targetUTR: 10.5, graduationYear: 2028 }),
      graduationYear: 2028,
    };
    const bands = new Set(SAMPLE.map((s) => classifySchoolFit(10.5, s, projection)));
    expect(bands.size).toBeGreaterThan(1);
  });
});

describe("the schools browser gates every derived output on hasRealUtr", () => {
  const source = readFileSync(BROWSER, "utf8");

  it("derives a single hasUtr flag from hasRealUtr", () => {
    expect(source).toMatch(/const hasUtr = hasRealUtr\(effectiveUtr\)/);
  });

  it("does not count fit bands without a rating", () => {
    // countSchoolFits must be reached only through the hasUtr branch.
    const call = source.match(/countSchoolFits\([^)]*\)/)?.[0] ?? "";
    expect(call).not.toBe("");
    const before = source.slice(Math.max(0, source.indexOf(call) - 220), source.indexOf(call));
    expect(before).toMatch(/hasUtr\s*$|hasUtr[\s\S]*\?\s*$/);
  });

  it("never interpolates a raw currentUTR into a 'You …' caption", () => {
    // Any `You ${...toFixed}` must sit on the true side of a hasUtr
    // ternary. Stated positionally rather than as a "must not appear"
    // pattern: the caption is correct copy once there IS a rating, so
    // banning the string outright would be wrong and would be worked
    // around by moving it one line.
    const youCaptions = [...source.matchAll(/You \$\{effectiveUtr\.toFixed\(1\)\}/g)];
    for (const m of youCaptions) {
      const before = source.slice(Math.max(0, m.index! - 300), m.index!);
      expect(before, "a 'You {utr}' caption outside a hasUtr branch").toMatch(/hasUtr[\s\S]*\?/);
    }
  });

  it("shows the visitor how to get a fit instead of a zero", () => {
    expect(source).toMatch(/Enter your UTR to see your fit/);
  });

  it("does not sort by gap or fit without a rating", () => {
    expect(source).toMatch(/hasUtr \|\| sort === "academics" \? sort : "default"/);
  });
});
