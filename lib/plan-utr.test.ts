// The stored Plan UTR (Niran, 2026-11-27): ONE number the player sets, used
// everywhere fit is judged — Schools, Plan, Today, a school page, the
// tournament checker — with a quarterly checkpoint line and one realism
// note on /plan. Clearly-fake numbers only.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { activePlanUtr, buildFitReport, planCheckpoints, planRealismNote } from "./fit";
import { judgingRatingFor, ratingBasisLabel } from "./fit-copy";
import { summerBeforeSeniorYear } from "./school-fit";
import type { SchoolLite } from "./types";

const NOW = new Date(2026, 10, 27, 12); // 27 Nov 2026
const GOAL_DATE = new Date(2028, 5, 1); // summer before senior year, class of 2029

describe("activePlanUtr — when the plan judges fit", () => {
  it("a saved plan above today's rating applies", () => {
    expect(activePlanUtr(10.5, 9)).toBe(10.5);
  });
  it("no plan, or a junk value, → none", () => {
    for (const v of [null, undefined, 0, -1, Number.NaN]) expect(activePlanUtr(v, 9)).toBeNull();
  });
  it("a plan today's rating has reached is spent (fit falls back to the estimate)", () => {
    expect(activePlanUtr(9, 9)).toBeNull();
    expect(activePlanUtr(8.5, 9)).toBeNull();
    expect(activePlanUtr(9.01, 9)).toBe(9.01);
  });
  it("with no real rating (null or the 0 sentinel) any saved plan applies", () => {
    expect(activePlanUtr(7, null)).toBe(7);
    expect(activePlanUtr(7, 0)).toBe(7);
  });
});

describe("buildFitReport judges on the plan, and every screen can tell", () => {
  const school = (slug: string, floor: number, avg: number) =>
    ({ id: slug, slug, name: slug, shortName: slug, minCompetitiveUTR: floor, avgRosterUTR: avg }) as unknown as SchoolLite;
  const schools = [school("a", 9, 10), school("b", 10.4, 11.2), school("c", 12, 13)];
  const report = buildFitReport({ currentUtr: 9, graduationYear: 2029, gender: "male", schools, planUtr: 10.6, now: NOW })!;

  it("the plan is the judging rating, as given", () => {
    expect(report.utr.value).toBe(10.6);
    expect(report.utr.source).toBe("plan");
    expect(report.utr.year).toBe(summerBeforeSeniorYear(2029).getFullYear());
    expect(report.bandBySlug.get("a")).toBe("likely");
    expect(report.bandBySlug.get("b")).toBe("target");
  });
  it("its label says 'your plan', never 'estimate' or 'today'", () => {
    const judging = judgingRatingFor({ report })!;
    expect(judging.basis).toEqual({ kind: "plan", year: 2028 });
    expect(ratingBasisLabel(judging.basis)).toBe("by summer 2028, your plan");
  });
});

describe("planCheckpoints — the quarterly line to the plan", () => {
  const line = planCheckpoints({ currentUtr: 9, planUtr: 11, goalDate: GOAL_DATE, now: NOW });

  it("the 1st of every Mar / Jun / Sep / Dec from a month out to the summer before senior year", () => {
    // Dec 1 2026 is four days after NOW: too close to be a checkpoint.
    expect(line.map((c) => c.label)).toEqual(["Mar 2027", "Jun 2027", "Sep 2027", "Dec 2027", "Mar 2028", "Jun 2028"]);
    for (const c of line) expect(c.date.getDate()).toBe(1);
  });
  it("ends exactly at the plan, and only the last one is the plan", () => {
    expect(line[line.length - 1]).toMatchObject({ utr: 11, isPlan: true });
    expect(line.filter((c) => c.isPlan)).toHaveLength(1);
  });
  it("rises on a straight line in time, two decimals", () => {
    for (let i = 1; i < line.length; i++) expect(line[i].utr).toBeGreaterThan(line[i - 1].utr);
    const span = GOAL_DATE.getTime() - NOW.getTime();
    const mar = line[0];
    expect(mar.utr).toBe(Math.round((9 + (2 * (mar.date.getTime() - NOW.getTime())) / span) * 100) / 100);
  });
  it("nothing without a rating, without an active plan, or once the date has passed", () => {
    expect(planCheckpoints({ currentUtr: null, planUtr: 11, goalDate: GOAL_DATE, now: NOW })).toEqual([]);
    expect(planCheckpoints({ currentUtr: 0, planUtr: 11, goalDate: GOAL_DATE, now: NOW })).toEqual([]);
    expect(planCheckpoints({ currentUtr: 9, planUtr: null, goalDate: GOAL_DATE, now: NOW })).toEqual([]);
    expect(planCheckpoints({ currentUtr: 11.2, planUtr: 11, goalDate: GOAL_DATE, now: NOW })).toEqual([]);
    expect(planCheckpoints({ currentUtr: 9, planUtr: 11, goalDate: new Date(2026, 5, 1), now: NOW })).toEqual([]);
  });
  it("Today's next checkpoint is the first box on /plan (one function)", () => {
    expect(readFileSync("components/dashboard/dashboard-view.tsx", "utf8")).toMatch(/planCheckpoints\(\{/);
    expect(readFileSync("components/seeded/roadmap/seeded-roadmap-layout.tsx", "utf8")).toMatch(/planCheckpoints\(\{/);
  });
});

describe("planRealismNote — one plain sentence, from the player's own pace", () => {
  const base = { currentUtr: 9, planUtr: 11, goalDate: GOAL_DATE, now: NOW };
  // 2.00 UTR over ~1.51 years ≈ 1.32 a year.
  it("says the pace the plan needs, against the player's own pace", () => {
    expect(planRealismNote({ ...base, ownPacePerYear: 1.5 })).toBe(
      "Your plan needs about +1.32 a year, and your pace so far is +1.50 a year. Keep that up and you're on track."
    );
    expect(planRealismNote({ ...base, ownPacePerYear: 0.8 })).toBe(
      "Your plan needs about +1.32 a year, but your pace so far is +0.80 a year. You'd need to speed up, so keep some schools on your list that fit your UTR today."
    );
  });
  it("no logged pace: says how to find out, invents nothing", () => {
    expect(planRealismNote({ ...base, ownPacePerYear: null })).toBe(
      "Your plan needs about +1.32 a year. Log your UTR every few months and Seeded will show whether you're keeping up."
    );
  });
  it("never cites a 1.5-a-year limit or 'a stretch'", () => {
    for (const own of [null, 0.2, 3]) {
      const note = planRealismNote({ ...base, ownPacePerYear: own })!;
      expect(note).not.toMatch(/1\.5 a year|1\.5-a-year|stretch|planning limit/);
    }
  });
  it("null without a rating, a plan, or time left", () => {
    expect(planRealismNote({ ...base, currentUtr: null, ownPacePerYear: 1 })).toBeNull();
    expect(planRealismNote({ ...base, planUtr: null, ownPacePerYear: 1 })).toBeNull();
    expect(planRealismNote({ ...base, goalDate: new Date(2026, 0, 1), ownPacePerYear: 1 })).toBeNull();
  });
  it("is shown once: on /plan only", () => {
    const files = [
      "components/seeded/roadmap/seeded-roadmap-layout.tsx",
      "components/seeded/dashboard/seeded-dashboard-layout.tsx",
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/schools/seeded-school-detail.tsx",
    ];
    const using = files.filter((f) => /planRealismNote\(/.test(readFileSync(f, "utf8")));
    expect(using).toEqual(["components/seeded/roadmap/seeded-roadmap-layout.tsx"]);
  });
});

describe("one stored value, read by every fit screen", () => {
  it("useFitReport reads the stored plan by default; only a parent's view and usePlanGoal's estimate skip it", () => {
    const src = readFileSync("lib/hooks/use-fit-report.ts", "utf8");
    expect(src).toMatch(/judgeOn = "plan"/);
    expect(src).toMatch(/activePlanUtr\(storedPlan, player\.currentUTR\)/);
    expect(readFileSync("lib/hooks/use-plan-goal.ts", "utf8")).toMatch(/judgeOn: "estimate"/);
  });
  it("the what-if slider is gone; Schools and Plan show the same control", () => {
    for (const f of ["components/seeded/schools/seeded-schools-browser.tsx", "components/seeded/roadmap/seeded-roadmap-layout.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/<PlanUtrControl/);
      expect(src, f).not.toMatch(/WhatIfPanel|useWhatIfUtr/);
    }
    expect(readFileSync("components/seeded/ui/plan-utr-control.tsx", "utf8")).toMatch(/Set your plan UTR/);
  });
  it("the tournament checker passes the plan as its goal", () => {
    expect(readFileSync("components/seeded/tournament-fit/seeded-tournament-fit-view.tsx", "utf8")).toMatch(/goalUtr: planUtr \?\? null/);
  });
});
