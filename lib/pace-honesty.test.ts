import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { FIT_ENGINE_FILES } from "./fit/engine-files";

// PR D, D1 decision 3: ONE pace number, said one way. The owner's audit found
// the same player's pace as "+1.45 last 6 months" (/plan), "My pace … +1.5/yr"
// (the what-if panel) and "needs 2.25 a year" (the goal warning). Now every
// pace goes through formatPacePerYear ("+1.45 a year", lib/utils.ts,
// re-exported by lib/fit.ts) and the number comes from lib/fit.ts.
//
// This is a lint over the screens that show a pace, not a proof: it strips
// comments and looks for the phrasings that were removed.

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(e) && !e.includes(".test.")) acc.push(full);
  }
  return acc;
}

// /plan, /schools, /today, the school page, onboarding, the what-if panel,
// and the two lib modules that build pace sentences.
const PACE_SCREENS = [
  ...walk("components/seeded/roadmap"),
  ...walk("components/seeded/schools"),
  ...walk("components/seeded/dashboard"),
  ...walk("components/seeded/onboarding"),
  "components/seeded/ui/what-if-panel.tsx",
  "components/seeded/ui/projection-note.tsx",
  // lib/fit.ts — since the 2026-11-21 split, the barrel and lib/fit/*.ts.
  ...FIT_ENGINE_FILES,
  "lib/school-fit.ts",
];

describe("one pace phrasing", () => {
  it.each([
    ["last 6 months", /last 6 months/],
    ["a pace per month", /a month\b/],
    ["/yr", /\/yr\b/],
    ["/year", /\d\}?\/year\b/],
    ["a one-decimal pace", /(requiredPaceUtrPerYear|perYear|pacePerYear)\??\.toFixed\(/],
    ["a hand-rolled 'a year' pace", /\.toFixed\(2\)\}? a year/],
  ])("no '%s' on a pace screen", (_label, pattern) => {
    const hits = PACE_SCREENS.filter((f) => pattern.test(code(f)));
    expect(hits).toEqual([]);
  });

  it("the plan tile, the what-if panel, the goal warning and the school page use the formatter", () => {
    for (const f of [
      "components/seeded/roadmap/seeded-roadmap-layout.tsx",
      "components/seeded/ui/what-if-panel.tsx",
      "components/seeded/roadmap/goal-pace-warning.tsx",
      "components/seeded/schools/seeded-school-detail.tsx",
      "lib/school-fit.ts",
    ]) {
      expect(code(f), f).toMatch(/formatPacePerYear\(/);
    }
  });

  it("/plan's pace tile reads lib/fit.ts's one pace number", () => {
    const src = code("components/seeded/roadmap/seeded-roadmap-layout.tsx");
    expect(src).toMatch(/playerPacePerYear\(/);
    expect(src).not.toMatch(/utrDeltaOverMonths/);
  });

  it("/plan's closest schools come from the report, never a classification of their own", () => {
    const src = code("components/seeded/roadmap/seeded-roadmap-layout.tsx");
    expect(src).toMatch(/closestSchoolsFromReport\(realReport/);
    expect(src).not.toMatch(/closestSchoolsByUtrGap/);
  });

  it("/schools sorts by the report's bands, not a classification of its own", () => {
    expect(code("components/seeded/schools/seeded-schools-browser.tsx")).toMatch(
      /sortSchoolsForSeeded\(filtered, safeSort, judgingUtr \?\? effectiveUtr, bandFor\)/
    );
  });

  it("the upside is said by the one sentence helper on /plan and /today, and charted as 'Estimate'", () => {
    for (const f of ["components/seeded/roadmap/seeded-roadmap-layout.tsx", "components/seeded/dashboard/seeded-dashboard-layout.tsx"]) {
      const src = code(f);
      expect(src, f).toMatch(/<PaceUpsideNote utr=\{(realReport|fitReport)\?\.utr\}/);
      expect(src, f).toMatch(/upsideProjectionPath\(\{\s*estimate: (realReport|fitReport)\?\.utr/);
    }
    for (const f of ["components/seeded/roadmap/plan-trajectory-chart.tsx", "components/seeded/dashboard/utr-vs-plan-chart.tsx"]) {
      expect(code(f), f).toMatch(/chartEndLabels\(estimate, upside\)/);
    }
  });

  it("the checklist's hide button says what it does", () => {
    const src = code("components/seeded/roadmap/recruiting-checklist.tsx");
    expect(src).toMatch(/aria-label=\{[^}]*"Hide this step"/);
    expect(src).toMatch(/title=\{[^}]*"Hide this step"/);
  });
});
