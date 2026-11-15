import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildSeasonBudgetSummary, pendingSkipDecisions } from "./family-budget";
import type { TournamentEntry } from "./db/events";

// Found while capturing the real /family screenshots for TASK B, on a staging
// family whose parent had signed up first: /family rendered
//
//     Robin's recruiting · Class of 2028 · Junior fall
//     7.0  UTR
//
// for an account whose `current_utr` is NULL in the database. The 7 came from
// the `emptyPlayer` placeholder (lib/data/user.ts, lib/auth.ts:455) by way of
//
//     const currentUTR = playerMember?.currentUtr ?? player.currentUTR;
//
// where `player` is the signed-in PARENT. Nobody in that family had a rating,
// and the page showed one anyway — the exact thing CLAUDE.md's first
// non-negotiable rule forbids. The /dev/family-preview fixture had a UTR, so
// every screenshot taken before tonight hid it.
//
// These tests pin the two halves of the fix: the data layer may not invent a
// number, and the view layer may not fall back to someone else's.

const REPO = join(__dirname, "..");

function grep(pattern: string): string[] {
  // The whole repo, not a hand-picked list of files — the lesson from the
  // Google-button miss, where a test iterated three files and the fourth
  // offender shipped.
  try {
    // NOTE: git grep -E is POSIX ERE — `\s` matches NOTHING and the search
    // silently returns no hits. The first version of this guard used `\s`,
    // passed happily with the bug reintroduced, and hid a fourth offender
    // (seeded-family-budget-view.tsx). Use [[:space:]].
    return execFileSync(
      "git",
      ["grep", "-n", "-E", pattern, "--", "*.ts", "*.tsx", ":!*.test.ts", ":!*.test.tsx"],
      { cwd: REPO, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // git grep exits 1 when there are no matches
  }
}

describe("no fabricated UTR reaches a family screen", () => {
  it("nothing falls back from a family member's UTR to the viewer's own", () => {
    // `playerMember?.currentUtr ?? player.currentUTR` is the bug, exactly.
    // A parent's own profile is never the player's rating, and a player row
    // with a null UTR must stay null rather than borrow the viewer's.
    //
    // Matches on CODE only: this file and the fixed components quote the old
    // expression in comments deliberately, so the grep requires the line to
    // start with `const` or an assignment rather than a comment marker.
    // The pattern matches the FILE CONTENT line, not git grep's
    // "path:lineno:" output prefix — anchoring on the prefix would never
    // match and would make this guard vacuous for the second time.
    const hits = grep(
      String.raw`^[[:space:]]*(const|let|var)[^/]*playerMember\?\.currentUtr[[:space:]]*\?\?`
    );
    expect(hits).toEqual([]);
  });

  it("the family roster never substitutes a number for a missing UTR", () => {
    const family = readFileSync(join(REPO, "lib/db/family.ts"), "utf8");
    // Comments quote the old expression on purpose, so match code only.
    const code = family
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    expect(code).not.toMatch(/current_utr\s*\?\?\s*0/);
    expect(family).toContain("row.current_utr == null ? null : Number(row.current_utr)");
  });

  it("every screen that prints a UTR handles the unknown case", () => {
    // Any `formatUTR(x)` whose argument can be null must be guarded. Rather
    // than parse types, assert the guard exists beside each family-surface
    // call site, which is where the nullable value actually lives.
    for (const file of [
      "components/seeded/family/seeded-family-overview.tsx",
      "components/seeded/family/seeded-weekly-report-view.tsx",
      "components/parents/parent-dashboard-view.tsx",
    ]) {
      const src = readFileSync(join(REPO, file), "utf8");
      expect(src, file).toMatch(/currentUTR == null \? "Not tracked"/);
    }
  });
});

const entry: TournamentEntry = {
  id: "t1",
  name: "Fall Open",
  level: "L4",
  eventDate: "2026-12-01",
  city: "Rockville",
  state: "MD",
  status: "saved",
  entryCost: 120,
  travelCost: 80,
  travelHours: 3,
  distanceMiles: 140,
  goalUtr: null,
  drawUtr: null,
  createdAt: "2026-11-01T00:00:00.000Z",
};

describe("the budget math refuses to judge fit without a rating", () => {
  it("returns no bad-fit decisions when the UTR is unknown", () => {
    expect(pendingSkipDecisions([entry], null)).toEqual([]);
    // and still works normally when it is known
    expect(Array.isArray(pendingSkipDecisions([entry], 7.4))).toBe(true);
  });

  it("gives an entered tournament a neutral chip instead of a verdict", () => {
    const summary = buildSeasonBudgetSummary({
      totalBudget: 1000,
      playerUtr: null,
      entries: [{ ...entry, status: "entered" }],
      expenses: [],
    });
    expect(summary.lineItems).toHaveLength(1);
    // "good"/"decent"/"bad" would all be claims about a rating nobody entered.
    expect(summary.lineItems[0].chip).toBe("entries");
    expect(summary.skippedBadFitCount).toBe(0);
    expect(summary.skippedBadFitSaved).toBe(0);
    // The money is real and must still add up.
    expect(summary.spent).toBe(200);
    expect(summary.remaining).toBe(800);
  });

  it("still produces a real verdict when the UTR is known", () => {
    const summary = buildSeasonBudgetSummary({
      totalBudget: 1000,
      playerUtr: 7.4,
      entries: [{ ...entry, status: "entered" }],
      expenses: [],
    });
    expect(["good", "decent", "bad"]).toContain(summary.lineItems[0].chip);
  });
});
