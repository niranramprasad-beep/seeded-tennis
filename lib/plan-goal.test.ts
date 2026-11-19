import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildFitReport, isRealisticTarget, recruitingTimeUtr, resolvePlanGoal } from "./fit";
import { computeGoalPace, goalPaceNeedsWarning } from "./school-fit";
import { buildRoadmap } from "./db/plan";
import { parsePlanGoalUtr } from "./db/settings";
import { buildNextSteps, todayHeadline } from "./today-actions";
import type { SchoolLite } from "./types";

const NOW = new Date(2026, 10, 18, 12);
// The sweep persona: men's 5.95, Class of 2029, four targets incl. Duke.
const P = { currentUtr: 5.95, graduationYear: 2029, gender: "male" as const };
// What the fit report hands usePlanGoal (report.utr).
const EST = recruitingTimeUtr({ ...P, now: NOW });

const school = (slug: string, floor: number, avg: number) =>
  ({ id: slug, slug, name: slug, shortName: slug, minCompetitiveUTR: floor, avgRosterUTR: avg }) as unknown as SchoolLite;
const TARGETS = [school("duke", 12, 13.2), school("mid", 8.5, 9.6), school("near", 7.2, 8.3), school("low", 6.0, 7.0)];

/* ------------------------------------------------------------ C11 */

describe("C11 — the plan goal is the player's, or the estimate; never the hardest target", () => {
  it("defaults to the typical-growth estimate (the number every screen prints)", () => {
    const goal = resolvePlanGoal({ chosenGoalUtr: null, estimate: EST })!;
    expect(goal.source).toBe("estimate");
    expect(goal.value).toBe(recruitingTimeUtr({ ...P, now: NOW })!.value);
    expect(goal.value).toBeLessThan(12); // not Duke's floor
  });

  it("adding a target cannot move it — targets are not an input", () => {
    // The old buildRoadmap(player, targets) took the max floor: 8.90 → 9.0 →
    // 9.50 as targets were added. Its signature now takes the goal.
    expect(buildRoadmap.length).toBeGreaterThanOrEqual(2);
    const goal = resolvePlanGoal({ chosenGoalUtr: null, estimate: EST })!;
    const a = buildRoadmap({ currentUTR: P.currentUtr, graduationYear: P.graduationYear }, goal.value, NOW);
    const b = buildRoadmap({ currentUTR: P.currentUtr, graduationYear: P.graduationYear }, goal.value, NOW);
    expect(a).toEqual(b);
    const src = readFileSync("lib/db/plan.ts", "utf8");
    expect(src).not.toMatch(/minCompetitiveUTR/);
  });

  it("the default goal never needs an unrealistic pace — the 3.9/yr default is gone", () => {
    const goal = resolvePlanGoal({ chosenGoalUtr: null, estimate: EST })!;
    const pace = computeGoalPace(P.currentUtr, goal.value, P.graduationYear, NOW);
    expect(goalPaceNeedsWarning(pace)).toBe(false);
    expect(pace.requiredPaceUtrPerYear!).toBeLessThanOrEqual(1.5);
  });

  it("a chosen goal wins, and an unrealistic one warns — one rule for /plan and /today", () => {
    const goal = resolvePlanGoal({ chosenGoalUtr: 12, estimate: EST })!;
    expect(goal).toMatchObject({ value: 12, source: "chosen" });
    expect(goal.estimate).toBe(recruitingTimeUtr({ ...P, now: NOW })!.value);
    expect(goalPaceNeedsWarning(computeGoalPace(P.currentUtr, 12, P.graduationYear, NOW))).toBe(true);
    for (const f of ["components/seeded/dashboard/seeded-dashboard-layout.tsx", "components/seeded/roadmap/seeded-roadmap-layout.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/<GoalPaceWarning/);
    }
    expect(readFileSync("components/seeded/roadmap/goal-pace-warning.tsx", "utf8")).toMatch(/goalPaceNeedsWarning\(/);
  });

  it("usePlanGoal takes its default from the fit report, not a projection of its own", () => {
    expect(readFileSync("lib/hooks/use-plan-goal.ts", "utf8")).toMatch(/resolvePlanGoal\(\{[^}]*estimate: report\?\.utr/);
  });

  it("no rating and no chosen goal → no goal at all, not a plan from 0", () => {
    expect(resolvePlanGoal({ chosenGoalUtr: null, estimate: recruitingTimeUtr({ ...P, currentUtr: 0, now: NOW }) })).toBeNull();
  });

  it("a stored goal is read back only when it is a real UTR", () => {
    expect(parsePlanGoalUtr(9.25)).toBe(9.25);
    expect(parsePlanGoalUtr("9.5")).toBe(9.5);
    for (const bad of [0, -1, 17, "x", null, undefined, Number.NaN]) expect(parsePlanGoalUtr(bad)).toBeNull();
  });
});

/* ------------------------------------------------------------- C5 */

describe("C5 — 'Show realistic targets' keeps the targets the estimate reaches", () => {
  const report = buildFitReport({ ...P, schools: TARGETS, now: NOW });

  it("filters something real: Duke out, a school whose floor the estimate reaches in", () => {
    expect(isRealisticTarget(report, "duke")).toBe(false);
    expect(isRealisticTarget(report, "low")).toBe(true);
    const kept = TARGETS.filter((s) => isRealisticTarget(report, s.slug)).map((s) => s.slug);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(TARGETS.length);
  });

  it("is exactly the report's recruiting-time band being Target or Likely", () => {
    for (const row of report!.rows) {
      expect(isRealisticTarget(report, row.slug)).toBe(row.recruitingBand === "target" || row.recruitingBand === "likely");
    }
  });

  it("no report (no rating) → nothing is called realistic", () => {
    expect(isRealisticTarget(null, "low")).toBe(false);
  });
});

/* ------------------------------------------------------------ C12 */

describe("C12 — Today never says 'caught up' over an off-track player", () => {
  it("off track with no actions: real next steps, and a headline that says so", () => {
    const steps = buildNextSteps({ hasUtr: true, targetCount: 4, onTrackCount: 0, matchesThisWeek: 0, actionCount: 0 });
    expect(steps.map((s) => s.id)).toEqual(["targets-in-range", "log-result", "check-tournament"]);
    expect(todayHeadline(0, steps.length)).not.toMatch(/caught up/);
  });

  it("no rating: logging one comes first", () => {
    const steps = buildNextSteps({ hasUtr: false, targetCount: 0, onTrackCount: 0, matchesThisWeek: 0, actionCount: 0 });
    expect(steps[0].id).toBe("log-utr");
    expect(steps[0].href).toBeUndefined(); // opens the UTR drawer
  });

  it("on track with real actions: no filler steps", () => {
    expect(buildNextSteps({ hasUtr: true, targetCount: 3, onTrackCount: 3, matchesThisWeek: 1, actionCount: 2 })).toEqual([]);
    expect(todayHeadline(2, 0)).toBe("2 things move your recruiting this week.");
    // reviewer: "1 thing move your recruiting" — a hand-rolled plural
    expect(todayHeadline(1, 0)).toBe("1 thing moves your recruiting this week.");
  });

  it("every step links to a page that exists", () => {
    const all = [
      ...buildNextSteps({ hasUtr: true, targetCount: 4, onTrackCount: 0, matchesThisWeek: 0, actionCount: 0 }),
      ...buildNextSteps({ hasUtr: false, targetCount: 0, onTrackCount: 0, matchesThisWeek: 0, actionCount: 0 }),
    ];
    for (const s of all) {
      if (!s.href) continue;
      const route = s.href.split("?")[0].replace(/^\//, "");
      expect(existsSync(join("app", route, "page.tsx")), s.href).toBe(true);
    }
  });

  it("Today renders the headline from todayHeadline, not its own 'caught up' rule", () => {
    const src = readFileSync("components/seeded/dashboard/seeded-dashboard-layout.tsx", "utf8");
    expect(src).toMatch(/todayHeadline\(actions\.length, nextSteps\.length\)/);
    expect(src).not.toMatch(/"You're all caught up this week\."/);
  });
});

/* --------------------------------------------------- C16, C24 copy */

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(e) && !e.includes(".test.")) acc.push(full);
  }
  return acc;
}
const UI = [...walk("components/seeded"), ...walk("app")];

describe("C16 / C24 — said once, said plainly", () => {
  it("the early-decision line is opted into on exactly one Seeded screen: the /schools list", () => {
    const optIns = UI.filter((f) => /\bwithEarlyDecisionNote\b(?!\?)/.test(readFileSync(f, "utf8")) && !f.endsWith("projection-note.tsx"));
    expect(optIns).toEqual(["components/seeded/schools/seeded-schools-browser.tsx"]);
    // Imported directly only by the note itself and the onboarding
    // diagnostic's result screen (board 20, PR B). The fit report one click
    // after that screen printed it a second time; it no longer does.
    const direct = UI.filter((f) => /\bEARLY_DECISION_NOTE\b/.test(readFileSync(f, "utf8"))).sort();
    expect(direct).toEqual(
      ["components/seeded/onboarding/diagnostic/diagnostic-flow.tsx", "components/seeded/ui/projection-note.tsx"].sort()
    );
  });

  it("the NCAA contact-period caveat is said once per card, not under every dated row", () => {
    const lib = readFileSync("lib/recruiting-checklist.ts", "utf8");
    expect(lib).not.toMatch(/General NCAA contact-period guidance/);
    expect(readFileSync("components/seeded/roadmap/recruiting-checklist.tsx", "utf8")).toMatch(/General NCAA contact-period guidance/);
  });

  it.each([
    ["Live data, your own account."],
    ["Top (drawn)"],
    ["on our combined score"],
  ])("'%s' is gone from Seeded screens", (phrase) => {
    const hits = UI.filter((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").includes(phrase));
    expect(hits).toEqual([]);
  });

  it("/plan has a page title", () => {
    expect(readFileSync("components/seeded/roadmap/seeded-roadmap-layout.tsx", "utf8")).toMatch(/<h1[^>]*>Plan<\/h1>/);
  });
});
