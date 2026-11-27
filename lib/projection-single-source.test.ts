import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  buildFitReport,
  chartEndLabels,
  projectionPath,
  projectionTargetDate,
  recruitingTimeUtr,
  resolvePlanGoal,
} from "./fit";
import { explainSchoolFit } from "./school-fit";
import { buildRoadmap } from "./db/plan";
import type { PlayerGender, SchoolLite } from "./types";
import { FIT_ENGINE_FILES } from "./fit/engine-files";

// C8 (2026-11-18). The school page printed two projections for one date:
//
//   Pace   "At the pace in your logged ratings: 8.5 by Jun 1, 2028"
//   note   "Bands use your estimated UTR for summer 2028, the summer before
//           senior year: 7.5"
//
// /today and /plan each shaded their own regression band too. There is now
// ONE projection — lib/fit.ts projectUtrAtRecruiting — and every screen
// reaches it through one of the functions below. Same pattern as
// fit-band-consistency.test.ts: lock the invariant on the shared functions
// every screen calls (the behaviour), then lock that each screen calls them
// (the wiring).

const NOW = new Date(2026, 10, 18, 12);

const PERSONAS: { name: string; currentUtr: number; graduationYear: number; gender: PlayerGender }[] = [
  { name: "sweep player — men's 5.95, Class of 2029", currentUtr: 5.95, graduationYear: 2029, gender: "male" },
  { name: "men's 8.7, Class of 2031", currentUtr: 8.7, graduationYear: 2031, gender: "male" },
  { name: "women's 6.0, Class of 2029", currentUtr: 6.0, graduationYear: 2029, gender: "female" },
  { name: "junior — women's 9.0, Class of 2028", currentUtr: 9.0, graduationYear: 2028, gender: "female" },
  { name: "near the ceiling — women's 12.3, Class of 2030", currentUtr: 12.3, graduationYear: 2030, gender: "female" },
];

const SCHOOL = {
  id: "s",
  slug: "s",
  name: "S",
  shortName: "S",
  city: "X",
  state: "NC",
  division: "D1",
  conference: "C",
  gender: "men",
  minCompetitiveUTR: 9,
  avgRosterUTR: 10.5,
  usNewsRanking: 20,
} as unknown as SchoolLite;

describe("one player + one date = one projected UTR, on every screen", () => {
  // Real logged history, so whatever rule recruitingTimeUtr applies to a
  // player WITH history (typical growth today; the logged pace after PR B)
  // is the rule under test. The assertion never names a rule: every screen
  // must print report.utr, whatever it is.
  const history = (p: (typeof PERSONAS)[number]) => ({
    utrHistory: [
      { date: new Date(2025, 10, 1), utr: Math.max(1, p.currentUtr - 0.8) },
      { date: new Date(2026, 4, 1), utr: Math.max(1, p.currentUtr - 0.4) },
      { date: new Date(2026, 10, 1), utr: p.currentUtr },
    ],
    graduationYear: p.graduationYear,
    gender: p.gender,
    now: NOW,
  });

  for (const p of PERSONAS) {
    for (const withHistory of [false, true]) {
      it(`${p.name}${withHistory ? " · with logged history" : ""}`, () => {
        // /schools, /today, /plan, /family and the school page: the
        // ProjectionNote prints report.utr.value. THE source.
        const report = buildFitReport({
          ...p,
          schools: [SCHOOL],
          now: NOW,
          projectionInput: withHistory ? history(p) : undefined,
        })!;
        const source = report.utr;
        expect(source.isProjected).toBe(true);

        // The school page's Pace row prints explainSchoolFit's pace, handed report.utr.
        const explanation = explainSchoolFit(p.currentUtr, SCHOOL as never, {
          graduationYear: p.graduationYear,
          gender: p.gender,
          now: NOW,
          band: report.bandBySlug.get(SCHOOL.slug),
          estimate: report.utr,
        });
        // /today's and /plan's charts shade projectionPath(report.utr); its end is the label.
        const path = projectionPath({ estimate: report.utr, currentUtr: p.currentUtr, graduationYear: p.graduationYear, now: NOW });
        // There is no default goal any more (PR D, D1): with none chosen
        // there is no goal. The estimate is only OFFERED ("Use 8.10
        // instead"); picked, it is the goal and the last checkpoint.
        expect(resolvePlanGoal({ chosenGoalUtr: null, estimate: report.utr })).toBeNull();
        const offered = resolvePlanGoal({ chosenGoalUtr: 99, estimate: report.utr })!.estimate!;
        const roadmap = buildRoadmap({ currentUTR: p.currentUtr, graduationYear: p.graduationYear }, offered, NOW);

        const values = {
          "school page Pace row": explanation.pace.status === "ready" ? explanation.pace.projectedUTR : NaN,
          "chart end (/today, /plan)": path[path.length - 1].value,
          "estimate offered as a goal": offered,
          "last plan checkpoint once picked": roadmap[roadmap.length - 1].utrTarget,
        };
        // The chart's end LABEL is the report's number in the report's format.
        expect(chartEndLabels(path).plan).toBe(source.value.toFixed(1));
        for (const [where, v] of Object.entries(values)) {
          expect(v, `${where} disagrees with report.utr`).toBe(source.value);
        }

        // Same DATE, too: the summer before senior year.
        const target = projectionTargetDate(p.graduationYear);
        expect(path[path.length - 1].date.getTime()).toBe(target.getTime());
        if (explanation.pace.status === "ready") {
          const [y, m, d] = explanation.pace.byDate.split("-").map(Number);
          expect(new Date(y, m - 1, d).getTime()).toBe(target.getTime());
        }
        expect(new Date(roadmap[roadmap.length - 1].calendarYear, 5, 1).getTime()).toBe(target.getTime());

        // And the chart's band is the report's own low–high at that date.
        expect(path[path.length - 1].low).toBe(source.low);
        expect(path[path.length - 1].high).toBe(source.high);
      });
    }
  }

  it("without history the report's value is lib/fit's one projection rule", () => {
    for (const p of PERSONAS) {
      const report = buildFitReport({ ...p, schools: [SCHOOL], now: NOW })!;
      expect(report.utr.value).toBe(recruitingTimeUtr({ ...p, now: NOW })!.value);
    }
  });

  it("the path starts at today's rating and stays inside the report's low–high", () => {
    const p = PERSONAS[0];
    const report = buildFitReport({ ...p, schools: [SCHOOL], now: NOW })!;
    const path = projectionPath({ estimate: report.utr, currentUtr: p.currentUtr, graduationYear: p.graduationYear, now: NOW, steps: 20 });
    expect(path[0].value).toBe(p.currentUtr);
    for (const pt of path) {
      expect(pt.low).toBeLessThanOrEqual(pt.value);
      expect(pt.value).toBeLessThanOrEqual(pt.high);
    }
  });

  it("no estimate, or today's rating (summer begun), means nothing projected to draw", () => {
    const senior = buildFitReport({ currentUtr: 11, graduationYear: 2027, gender: "male", schools: [SCHOOL], now: NOW })!;
    expect(senior.utr.isProjected).toBe(false);
    expect(projectionPath({ estimate: senior.utr, currentUtr: 11, graduationYear: 2027, now: NOW })).toEqual([]);
    expect(projectionPath({ estimate: null, currentUtr: 6, graduationYear: 2030, now: NOW })).toEqual([]);
  });

  it("projectionPath and resolvePlanGoal compute no projection of their own", () => {
    // lib/fit.ts's code is in lib/fit/*.ts since the 2026-11-21 split.
    const src = FIT_ENGINE_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
    for (const fn of ["projectionPath", "resolvePlanGoal"]) {
      const start = src.indexOf(`export function ${fn}(`);
      expect(start, `${fn} is defined in the fit engine`).toBeGreaterThanOrEqual(0);
      const body = src.slice(start, src.indexOf("\n}\n", start));
      expect(body, fn).not.toMatch(/recruitingTimeUtr\(|projectUtrAtRecruiting\(|UTR_GROWTH_PER_YEAR|computeUtrProjection/);
    }
  });
});

/* ------------------------------------------------------- the wiring */

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("each screen reads the one projection", () => {
  it("school page: the Pace row is handed the report's estimate", () => {
    const src = code("components/seeded/schools/seeded-school-detail.tsx");
    expect(src).toMatch(/explainSchoolFit\([^)]*\{[\s\S]{0,200}estimate:\s*report\?\.utr/);
    expect(src).not.toMatch(/logged ratings: \$\{/);
  });

  it("/today and /plan: the charts shade projectionPath, never a regression of their own", () => {
    for (const f of ["components/seeded/dashboard/seeded-dashboard-layout.tsx", "components/seeded/roadmap/seeded-roadmap-layout.tsx"]) {
      expect(code(f), f).toMatch(/projectionPath\(\{\s*estimate: (fitReport|realReport|estimateReport)\?\.utr/);
    }
    for (const f of ["components/seeded/dashboard/utr-vs-plan-chart.tsx", "components/seeded/roadmap/plan-trajectory-chart.tsx"]) {
      const src = code(f);
      expect(src, f).not.toMatch(/computeUtrProjection|\.predict\(|upperBound|lowerBound/);
      expect(src, f).toMatch(/estimate/);
    }
  });

  it("/schools, /today, /plan and the school page print the report's value in the ProjectionNote", () => {
    expect(code("components/seeded/ui/projection-note.tsx")).toMatch(/formatUtrEstimate\(utr\.value\)/);
    for (const f of [
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/dashboard/seeded-dashboard-layout.tsx",
      "components/seeded/roadmap/seeded-roadmap-layout.tsx",
      "components/seeded/schools/seeded-school-detail.tsx",
    ]) {
      expect(code(f), f).toMatch(/<ProjectionNote[\s\S]{0,80}utr=\{(fitReport\?\.utr|report\.utr|judging)\}/);
    }
  });

  it("explainSchoolFit projects nothing itself: no .predict( in lib/school-fit.ts outside classifySchoolFit", () => {
    const src = code("lib/school-fit.ts");
    const explain = src.slice(src.indexOf("export function explainSchoolFit("), src.indexOf("export function computeGoalPace("));
    expect(explain).not.toMatch(/\.predict\(/);
  });

  it("no component computes a projection of its own", () => {
    const walk = (dir: string, acc: string[] = []): string[] => {
      for (const e of readdirSync(dir)) {
        const full = `${dir}/${e}`;
        if (statSync(full).isDirectory()) walk(full, acc);
        else if (/\.tsx?$/.test(e) && !e.includes(".test.")) acc.push(full);
      }
      return acc;
    };
    // Every component directory, charts included: the deleted Legacy /today
    // chart ran its own regression until the PR C review. Only the dev
    // harness is exempt.
    const offenders = walk("components")
      .filter((f) => !f.startsWith("components/dev/"))
      .filter((f) => /\bcomputeUtrProjection\b|\.predict\(|upperBound\(|lowerBound\(/.test(code(f)));
    expect(offenders, "every screen takes its projection from lib/fit.ts").toEqual([]);
  });
});
