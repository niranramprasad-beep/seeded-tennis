import { describe, expect, it } from "vitest";
import {
  PLANNING_PACE_CAP_PER_YEAR,
  buildDiagnosticFitReport,
  buildFitReport,
  chartEndLabels,
  closestSchoolsFromReport,
  diagnosticProjection,
  isRealisticTarget,
  paceUpsideSentence,
  planGoalNeedsPaceWarning,
  playerPacePerYear,
  projectedUtrOn,
  projectionPath,
  projectionReachDate,
  projectionTargetDate,
  recruitingTimeUtr,
  resolvePlanGoal,
  upsideProjectionPath,
  utrHistoryFromEntries,
  yearsUntilRecruiting,
  type FitReport,
} from "./fit";
import { computeGoalPace, explainSchoolFit } from "./school-fit";
import { sortSchoolsForSeeded } from "./school-sort";
import { formatPacePerYear, formatPlayerUtr, formatUtrEstimate } from "./utils";
import type { PlayerGender, SchoolLite } from "./types";

// PR D, D1 (owner's decisions, 2026-11-19). Three player shapes, and every
// screen's source for "where is this player headed" and "which band":
//
//   fit report            buildFitReport — /schools, /today, /plan, /family
//   school page           a ONE-school report + explainSchoolFit (Pace row)
//   /schools rows         the catalog report's bandBySlug, and its sort
//   /today headline       a TARGETS-only report's on-track count + note
//   /plan                 closest schools, realistic targets, pace tile, goal
//   onboarding            diagnosticProjection / buildDiagnosticFitReport
//   charts' end label     chartEndLabels(projectionPath(report.utr))
//
// Every one must show the same CONSERVATIVE number — min(own pace, 1.5 a
// year) — and the same bands. The faster own pace is shown as an upside and
// never moves a band.

const NOW = new Date(2026, 10, 19, 12); // Thu Nov 19 2026, local noon

const school = (slug: string, floor: number, avg: number): SchoolLite =>
  ({
    id: slug,
    slug,
    name: slug,
    shortName: slug,
    city: "X",
    state: "NC",
    conference: "C",
    division: "D1",
    gender: "men",
    usNewsRanking: 50,
    minCompetitiveUTR: floor,
    avgRosterUTR: avg,
  }) as unknown as SchoolLite;

// Floors chosen around the owner's two numbers: 8.3 and 8.6 sit between the
// conservative 8.1 and the uncapped 8.9 — the "2 programs flipped to Target"
// from the audit.
const CATALOG = [
  school("elite", 12.3, 13.6),
  school("high", 10.4, 11.5),
  school("flip-a", 8.3, 9.4),
  school("flip-b", 8.6, 9.8),
  school("mid", 7.6, 8.8),
  school("near", 6.8, 7.9),
  school("low", 5.2, 6.4),
];
const TARGETS = ["elite", "flip-a", "flip-b", "near"];

interface Shape {
  name: string;
  currentUtr: number;
  graduationYear: number;
  gender: PlayerGender;
  entries: { utr: number; recordedAt: string }[];
  /** What the player would have answered in the onboarding diagnostic. */
  diagnostic: { sixMonthsAgoUtr?: number; yearAgoUtr?: number };
}

const SHAPES: Shape[] = [
  {
    // The owner's signed-in production audit, entry for entry.
    name: "fast recent jump — men's 5.80, Class of 2029 (owner's audit)",
    currentUtr: 5.8,
    graduationYear: 2029,
    gender: "male",
    entries: [
      { utr: 4.5, recordedAt: "2026-03-30" },
      { utr: 5.65, recordedAt: "2026-08-15" },
      { utr: 5.76, recordedAt: "2026-09-20" },
      { utr: 5.79, recordedAt: "2026-10-05" },
      { utr: 5.7, recordedAt: "2026-10-20" },
      { utr: 5.78, recordedAt: "2026-11-02" },
      { utr: 5.81, recordedAt: "2026-11-08" },
      { utr: 5.8, recordedAt: "2026-11-16" },
    ],
    diagnostic: { sixMonthsAgoUtr: 4.5 },
  },
  {
    name: "steady — men's 7.00, Class of 2029, +1.00 a year",
    currentUtr: 7,
    graduationYear: 2029,
    gender: "male",
    entries: [
      { utr: 6, recordedAt: "2025-11-19" },
      { utr: 6.5, recordedAt: "2026-05-19" },
      { utr: 7, recordedAt: "2026-11-16" },
    ],
    diagnostic: { yearAgoUtr: 6, sixMonthsAgoUtr: 6.5 },
  },
  {
    name: "no history — men's 6.50, Class of 2029",
    currentUtr: 6.5,
    graduationYear: 2029,
    gender: "male",
    entries: [],
    diagnostic: {},
  },
];

const subject = (s: Shape) => ({
  currentUtr: s.currentUtr,
  graduationYear: s.graduationYear,
  gender: s.gender,
  now: NOW,
});
const projectionInput = (s: Shape) =>
  s.entries.length
    ? { utrHistory: utrHistoryFromEntries(s.entries), graduationYear: s.graduationYear, gender: s.gender, now: NOW }
    : undefined;
const reportFor = (s: Shape, schools: SchoolLite[]) =>
  buildFitReport({ ...subject(s), schools, projectionInput: projectionInput(s) })!;
const bandsOf = (r: FitReport) => Object.fromEntries(r.rows.map((row) => [row.slug, row.band]));

describe("every screen shows the same conservative number and the same bands", () => {
  for (const s of SHAPES) {
    describe(s.name, () => {
      const report = reportFor(s, CATALOG);
      const value = report.utr.value;
      const bands = bandsOf(report);

      it("the number is the conservative one: today + min(own pace, cap) × years", () => {
        const years = yearsUntilRecruiting(s.graduationYear, NOW);
        const own = playerPacePerYear({ currentUtr: s.currentUtr, history: utrHistoryFromEntries(s.entries), now: NOW });
        const planned = own == null ? 1.0 : Math.min(own, PLANNING_PACE_CAP_PER_YEAR);
        expect(report.utr.isProjected).toBe(true);
        expect(value).toBe(Math.max(s.currentUtr, Math.round((s.currentUtr + planned * years) * 10) / 10));
        expect(report.utr.planningPacePerYear).toBeCloseTo(planned, 12);
        expect(report.utr.planningPacePerYear!).toBeLessThanOrEqual(PLANNING_PACE_CAP_PER_YEAR);
      });

      it("school page: a one-school report and its Pace row agree with the catalog report", () => {
        for (const sch of CATALOG) {
          const one = reportFor(s, [sch]);
          expect(one.utr).toEqual(report.utr);
          expect(one.bandBySlug.get(sch.slug), sch.slug).toBe(bands[sch.slug]);
          const explanation = explainSchoolFit(s.currentUtr, sch, {
            utrHistory: utrHistoryFromEntries(s.entries),
            graduationYear: s.graduationYear,
            gender: s.gender,
            now: NOW,
            band: one.bandBySlug.get(sch.slug),
            estimate: one.utr,
          });
          expect(explanation.band).toBe(bands[sch.slug]);
          expect(explanation.pace.status === "ready" ? explanation.pace.projectedUTR : NaN).toBe(value);
        }
      });

      it("/schools: the rows' chips and the 'Fit' sort read the same bands", () => {
        const sorted = sortSchoolsForSeeded(CATALOG, "fit", value, (sch) => report.bandBySlug.get(sch.slug) ?? null);
        const RANK = { likely: 0, target: 1, reach: 2, "out-of-range": 3 } as const;
        const ranks = sorted.map((sch) => RANK[bands[sch.slug] as keyof typeof RANK]);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      });

      it("/today: the targets-only report gives the same bands, on-track count and note number", () => {
        const targets = CATALOG.filter((sch) => TARGETS.includes(sch.slug));
        const today = reportFor(s, targets);
        expect(today.utr.value).toBe(value);
        for (const sch of targets) expect(today.bandBySlug.get(sch.slug)).toBe(bands[sch.slug]);
        const onTrack = (r: FitReport) =>
          targets.filter((sch) => ["target", "likely"].includes(r.bandBySlug.get(sch.slug) ?? "")).length;
        expect(onTrack(today)).toBe(onTrack(report));
        // No goal set → no pace warning on Today, whatever the pace.
        const goal = resolvePlanGoal({ chosenGoalUtr: null, estimate: today.utr });
        expect(goal).toBeNull();
        expect(planGoalNeedsPaceWarning(goal, computeGoalPace(s.currentUtr, 12, s.graduationYear, NOW))).toBe(false);
      });

      it("/plan: closest schools, realistic targets and the chart all read the report", () => {
        for (const row of closestSchoolsFromReport(report, CATALOG, 5)) {
          expect(row.band).toBe(bands[row.school.slug]);
          expect(row.gap).toBe(Math.round((row.school.avgRosterUTR - value) * 100) / 100);
        }
        for (const sch of CATALOG) {
          expect(isRealisticTarget(report, sch.slug)).toBe(["target", "likely"].includes(bands[sch.slug]));
        }
        // The chart line under the label, and the reach-date helper, use the same capped rule.
        const end = projectedUtrOn({ ...subject(s), history: utrHistoryFromEntries(s.entries) }, projectionTargetDate(s.graduationYear))!;
        expect(Math.round(end * 10) / 10).toBe(value);
        // The unrounded line reaches its own end on the target date, not before.
        const reach = projectionReachDate({ ...subject(s), history: utrHistoryFromEntries(s.entries) }, end - 1e-6);
        expect(reach).not.toBeNull();
        expect(Math.abs(reach!.getTime() - projectionTargetDate(s.graduationYear).getTime())).toBeLessThan(86_400_000);
      });

      it("charts' end label is the conservative number; the upside label only above the cap", () => {
        const path = projectionPath({ estimate: report.utr, currentUtr: s.currentUtr, graduationYear: s.graduationYear, now: NOW });
        const up = upsideProjectionPath({ estimate: report.utr, currentUtr: s.currentUtr, graduationYear: s.graduationYear, now: NOW });
        const labels = chartEndLabels(path, up);
        expect(path[path.length - 1].value).toBe(value);
        expect(labels.plan).toBe(formatUtrEstimate(value));
        if (report.utr.upside) {
          expect(labels.upside).toBe(`Estimate ${formatPlayerUtr(report.utr.upside.value)}`);
          expect(up[up.length - 1].value).toBe(report.utr.upside.value);
        } else {
          expect(labels.upside).toBeNull();
          expect(up).toEqual([]);
        }
      });

      it("onboarding: the diagnostic's number and bands are the app's", () => {
        const diag = diagnosticProjection({ todayUtr: s.currentUtr, ...s.diagnostic, ...subject(s) })!;
        // The conservative number does not depend on HOW fast a fast player
        // was: above the cap, everyone is planned at the cap.
        expect(diag.value).toBe(value);
        const built = buildDiagnosticFitReport({ todayUtr: s.currentUtr, ...s.diagnostic, ...subject(s), schools: CATALOG })!;
        expect(built.report.utr.value).toBe(value);
        for (const sch of CATALOG) {
          const b = built.report.bandBySlug.get(sch.slug);
          // Likely / Target come from the number alone, so they must match.
          if (bands[sch.slug] === "target" || bands[sch.slug] === "likely") expect(b, sch.slug).toBe(bands[sch.slug]);
          else expect(["reach", "out-of-range"], sch.slug).toContain(b);
        }
      });
    });
  }
});

describe("the fast recent jump (owner's audit) in numbers", () => {
  const s = SHAPES[0];
  const report = reportFor(s, CATALOG);

  it("plans at the cap and shows the faster pace as an upside, with the owner's sentence", () => {
    const own = report.utr.pace!.perYear;
    expect(own).toBeGreaterThan(PLANNING_PACE_CAP_PER_YEAR);
    expect(report.utr.planningPacePerYear).toBe(PLANNING_PACE_CAP_PER_YEAR);
    expect(report.utr.value).toBe(8.1);
    expect(report.utr.upside).toEqual({ value: 8.9, perYear: own });
    expect(formatPacePerYear(own)).toBe("+2.04 a year");
    expect(paceUpsideSentence(report.utr)).toBe(
      "At your current pace you'd reach 8.90, but we plan with 8.10. We plan with at most 1.5 UTR a year. That's our planning rule, not a measured average."
    );
    expect(report.utr.assumption).toBe(paceUpsideSentence(report.utr));
    expect(paceUpsideSentence(report.utr, "Avery")).toBe(
      "At Avery's current pace Avery would reach 8.90, but we plan with 8.10. We plan with at most 1.5 UTR a year. That's our planning rule, not a measured average."
    );
  });

  it("the two programs the uncapped pace flipped to Target are not Target", () => {
    // 8.3 and 8.6 floors sit between 8.1 (plan) and 8.9 (upside).
    expect(report.bandBySlug.get("flip-a")).not.toBe("target");
    expect(report.bandBySlug.get("flip-b")).not.toBe("target");
    expect(report.bandBySlug.get("mid")).toBe("target"); // 7.6 floor: within the plan
    // ...and the Reach / Out-of-range split plans with the cap too: no
    // logged trend is carried past 8.1 by June 2028, so neither is a Reach.
    expect(report.bandBySlug.get("flip-a")).toBe("out-of-range");
    expect(report.bandBySlug.get("flip-b")).toBe("out-of-range");
  });

  it("the onboarding diagnostic shows the same upside wording for its own answers", () => {
    const diag = diagnosticProjection({ todayUtr: s.currentUtr, sixMonthsAgoUtr: 4.5, ...subject(s) })!;
    expect(diag.value).toBe(8.1);
    expect(diag.pacePerYear).toBeCloseTo(2.6, 10);
    expect(diag.upside).toMatch(/^At your current pace you'd reach \d+\.\d\d, but we plan with 8\.10\. We plan with at most 1\.5 UTR a year\. That's our planning rule, not a measured average\.$/);
    expect(diag.note).toBe(diag.upside);
  });
});

describe("the steady and no-history shapes have no upside", () => {
  it("steady: own pace within the cap is the planning pace, said as 'your logged pace'", () => {
    const r = reportFor(SHAPES[1], CATALOG);
    expect(r.utr.pace!.perYear).toBeCloseTo(1, 10);
    expect(r.utr.upside).toBeNull();
    expect(paceUpsideSentence(r.utr)).toBeNull();
    expect(r.utr.assumption).toBe("At your logged pace (+1.00 a year since November 2025).");
  });

  it("no history: typical growth, which is within the cap", () => {
    const r = reportFor(SHAPES[2], CATALOG);
    expect(r.utr.source).toBe("typical-growth");
    expect(r.utr.upside).toBeNull();
    expect(r.utr.planningPacePerYear!).toBeLessThanOrEqual(PLANNING_PACE_CAP_PER_YEAR);
    expect(playerPacePerYear({ currentUtr: 6.5, history: [], now: NOW })).toBeNull();
    expect(recruitingTimeUtr({ ...subject(SHAPES[2]) })!.value).toBe(r.utr.value);
  });
});
