import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PACE_STRETCH_NOTE,
  PLANNING_PACE_CAP_PER_YEAR,
  buildFitReport,
  isRealisticTarget,
  planGoalNeedsPaceWarning,
  planGoalPaceSeverity,
  recruitingTimeUtr,
  resolvePlanGoal,
} from "./fit";
import { computeGoalPace } from "./school-fit";
import { buildRoadmap } from "./db/plan";
import { parsePlanGoalUtr } from "./db/settings";
import { buildNextSteps, todayHeadline } from "./today-actions";
import type { SchoolLite } from "./types";
import { FIT_ENGINE_FILES } from "./fit/engine-files";

const NOW = new Date(2026, 10, 18, 12);
// The sweep persona: men's 5.95, Class of 2029, four targets incl. Duke.
const P = { currentUtr: 5.95, graduationYear: 2029, gender: "male" as const };
// What the fit report hands usePlanGoal (report.utr).
const EST = recruitingTimeUtr({ ...P, now: NOW });

const school = (slug: string, floor: number, avg: number) =>
  ({ id: slug, slug, name: slug, shortName: slug, minCompetitiveUTR: floor, avgRosterUTR: avg }) as unknown as SchoolLite;
const TARGETS = [school("duke", 12, 13.2), school("mid", 8.5, 9.6), school("near", 7.2, 8.3), school("low", 6.0, 7.0)];

/* ------------------------------------------------------------ C11 */

// C11 made the goal default to the estimate; PR D (D1, owner's decision
// 2026-11-19) reversed that. These are the same guards, re-pointed: the goal
// is the player's or there is none — never the hardest target, never the
// estimate.
describe("D1 (was C11) — the plan goal is the player's, or there is none", () => {
  it("never defaults to the estimate: no chosen goal → no goal", () => {
    expect(EST?.isProjected).toBe(true);
    expect(resolvePlanGoal({ chosenGoalUtr: null, estimate: EST })).toBeNull();
    expect(resolvePlanGoal({ chosenGoalUtr: undefined, estimate: EST })).toBeNull();
    // No "estimate" source exists any more.
    // lib/fit.ts — since the 2026-11-21 split, the barrel and lib/fit/*.ts.
    expect(FIT_ENGINE_FILES.map((f) => readFileSync(f, "utf8")).join("\n")).not.toMatch(/source: "estimate"/);
  });

  it("adding a target cannot move it — targets are not an input", () => {
    // The old buildRoadmap(player, targets) took the max floor: 8.90 → 9.0 →
    // 9.50 as targets were added. Its signature now takes the goal.
    expect(buildRoadmap.length).toBeGreaterThanOrEqual(2);
    const goal = resolvePlanGoal({ chosenGoalUtr: 7.5, estimate: EST })!;
    const a = buildRoadmap({ currentUTR: P.currentUtr, graduationYear: P.graduationYear }, goal.value, NOW);
    const b = buildRoadmap({ currentUTR: P.currentUtr, graduationYear: P.graduationYear }, goal.value, NOW);
    expect(a).toEqual(b);
    const src = readFileSync("lib/db/plan.ts", "utf8");
    expect(src).not.toMatch(/minCompetitiveUTR/);
  });

  it("no goal → no warning, on /plan or /today, whatever the estimate's pace", () => {
    expect(planGoalNeedsPaceWarning(null, computeGoalPace(P.currentUtr, 12, P.graduationYear, NOW))).toBe(false);
  });

  it("a goal within the cap does not warn; the estimate offered as a goal never needs more than the cap", () => {
    const realistic = resolvePlanGoal({ chosenGoalUtr: EST!.value, estimate: EST })!;
    const pace = computeGoalPace(P.currentUtr, realistic.value, P.graduationYear, NOW);
    expect(planGoalNeedsPaceWarning(realistic, pace)).toBe(false);
    expect(pace.requiredPaceUtrPerYear!).toBeLessThanOrEqual(PLANNING_PACE_CAP_PER_YEAR);
  });

  it("a chosen goal needing more than the cap warns — one rule for /plan and /today", () => {
    const goal = resolvePlanGoal({ chosenGoalUtr: 12, estimate: EST })!;
    expect(goal).toEqual({ value: 12, estimate: recruitingTimeUtr({ ...P, now: NOW })!.value });
    expect(planGoalNeedsPaceWarning(goal, computeGoalPace(P.currentUtr, 12, P.graduationYear, NOW))).toBe(true);
    for (const f of ["components/seeded/dashboard/seeded-dashboard-layout.tsx", "components/seeded/roadmap/seeded-roadmap-layout.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/<GoalPaceWarning/);
    }
    expect(readFileSync("components/seeded/roadmap/goal-pace-warning.tsx", "utf8")).toMatch(/planGoalNeedsPaceWarning\(goal, goalPace\)/);
  });

  it("the red warning starts above the cap plus the 0.05 stretch margin; at or near the cap is amber (A-022)", () => {
    const goal = { value: 9, estimate: null };
    const at = { gap: 1, byDate: "2028-06-01", requiredPaceUtrPerYear: PLANNING_PACE_CAP_PER_YEAR, paceRead: "within-realistic-range" as const };
    const faster = (r: number) => ({ ...at, requiredPaceUtrPerYear: r, paceRead: "faster-than-realistic" as const });
    expect(planGoalNeedsPaceWarning(goal, at)).toBe(false);
    expect(planGoalPaceSeverity(goal, at)).toBe("stretch");
    // 1.51 and 1.55 were red; they are right at the limit, a stretch.
    expect(planGoalNeedsPaceWarning(goal, faster(1.51))).toBe(false);
    expect(planGoalPaceSeverity(goal, faster(1.51))).toBe("stretch");
    expect(planGoalPaceSeverity(goal, faster(1.55))).toBe("stretch");
    expect(planGoalPaceSeverity(goal, faster(1.56))).toBe("warning");
    expect(planGoalNeedsPaceWarning(goal, faster(1.56))).toBe(true);
    // Within 0.05 below the cap is a stretch too; further below, nothing.
    expect(planGoalPaceSeverity(goal, { ...at, requiredPaceUtrPerYear: 1.45 })).toBe("stretch");
    expect(planGoalPaceSeverity(goal, { ...at, requiredPaceUtrPerYear: 1.44 })).toBeNull();
    expect(planGoalNeedsPaceWarning(goal, { ...at, requiredPaceUtrPerYear: null, paceRead: "no-time-left" })).toBe(true);
    expect(planGoalPaceSeverity(null, faster(3))).toBeNull();
    expect(PACE_STRETCH_NOTE).toBe("That's a stretch: right at our 1.5-a-year planning limit.");
    // The banner uses the amber (gold) tokens for the stretch, never clay.
    const src = readFileSync("components/seeded/roadmap/goal-pace-warning.tsx", "utf8");
    const stretch = src.slice(src.indexOf('severity === "stretch"'), src.indexOf("planGoalNeedsPaceWarning(goal, goalPace)"));
    expect(stretch).toMatch(/--c-gold-tint-bg/);
    expect(stretch).not.toMatch(/clay-tint/);
    expect(stretch).toMatch(/PACE_STRETCH_NOTE/);
  });

  it("usePlanGoal hands the estimate over only as an offer, never as the goal", () => {
    const src = readFileSync("lib/hooks/use-plan-goal.ts", "utf8");
    expect(src).toMatch(/resolvePlanGoal\(\{ chosenGoalUtr: chosen \?\? null, estimate: report\?\.utr \?\? null \}\)/);
  });

  it("/plan says 'Set a goal' when there is none, and never labels the estimate a goal", () => {
    const src = readFileSync("components/seeded/roadmap/seeded-roadmap-layout.tsx", "utf8");
    expect(src).toMatch(/"Set a goal"/);
    expect(src).toMatch(/"No goal set"/);
    expect(src).not.toMatch(/\(your estimate\)/);
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

describe("a chosen goal must be above today's rating (decision 2026-11-18)", () => {
  it("planGoalInputError", async () => {
    const { planGoalInputError } = await import("./fit");
    expect(planGoalInputError(6.6, 5.95)).toBeNull();
    expect(planGoalInputError(5.95, 5.95)).toBe("Your goal needs to be above your current UTR, 5.95.");
    expect(planGoalInputError(5.5, 5.95)).toMatch(/above your current UTR/);
    expect(planGoalInputError(0.5, 5.95)).toBe("Enter a UTR between 1.00 and 16.50.");
    expect(planGoalInputError(17, null)).toBe("Enter a UTR between 1.00 and 16.50.");
    // no real rating yet (null or the 0 sentinel): any goal in range
    expect(planGoalInputError(3, null)).toBeNull();
    expect(planGoalInputError(3, 0)).toBeNull();
  });

  it("the /plan editor uses it, and a passed goal is said out loud", () => {
    expect(readFileSync("components/seeded/roadmap/plan-goal-editor.tsx", "utf8")).toMatch(/planGoalInputError\(v, currentUtr\)/);
    expect(readFileSync("components/seeded/roadmap/seeded-roadmap-layout.tsx", "utf8")).toMatch(/You&apos;ve reached your/);
  });
});
