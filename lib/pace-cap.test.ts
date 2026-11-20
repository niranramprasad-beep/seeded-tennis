import { describe, expect, it } from "vitest";
import {
  PLANNING_PACE_CAP_PER_YEAR,
  buildFitReport,
  planningPacePerYear,
  projectUtrAtRecruiting,
  projectedUtrOn,
  projectionReachDate,
  projectionTargetDate,
  recruitingTimeUtr,
  yearsUntilRecruiting,
} from "./fit";
import { UTR_GROWTH_PER_YEAR } from "./config/growth";
import { REALISTIC_UTR_IMPROVEMENT_PER_YEAR } from "./school-fit";
import type { SchoolLite } from "./types";
import type { UtrDataPoint } from "./utr-projection";

// THE PLANNING PACE CAP (PR D, D1; owner's decision 2026-11-19). Bands, fit
// chips, closest schools, school pages and the onboarding result plan with
// min(own pace, 1.5 a year). One constant, in lib/fit.ts.

const NOW = new Date(2026, 10, 19, 12);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const pt = (y: number, m: number, d: number, utr: number): UtrDataPoint => ({ date: day(y, m, d), utr });
// Class of 2030: about 2.5 years of runway from NOW.
const base = { currentUtr: 8, graduationYear: 2030, gender: "male" as const, now: NOW };
const YEARS = yearsUntilRecruiting(2030, NOW);
// A year-ago rating that sets an own pace of `perYear`.
const historyAt = (perYear: number) => [pt(2025, 11, 19, 8 - perYear)];

describe("the constant", () => {
  it("is 1.5 a year — the top of the band the product has always called realistic", () => {
    expect(PLANNING_PACE_CAP_PER_YEAR).toBe(1.5);
    expect(PLANNING_PACE_CAP_PER_YEAR).toBe(REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max);
  });

  it("typical growth sits inside it (if it ever did not, it is capped too)", () => {
    for (const pace of ["slow", "normal", "fast"] as const) {
      expect(UTR_GROWTH_PER_YEAR[pace], pace).toBeLessThanOrEqual(PLANNING_PACE_CAP_PER_YEAR);
    }
    // ...and the typical projection never grows faster than the cap.
    const typical = projectUtrAtRecruiting({ ...base })!;
    expect(typical.fast).toBeLessThanOrEqual(Math.round((8 + PLANNING_PACE_CAP_PER_YEAR * YEARS) * 10) / 10);
  });

  it("planningPacePerYear is min(own, cap) and leaves a falling pace alone", () => {
    expect(planningPacePerYear(2.4)).toBe(PLANNING_PACE_CAP_PER_YEAR);
    expect(planningPacePerYear(1.2)).toBe(1.2);
    expect(planningPacePerYear(-0.3)).toBe(-0.3);
  });
});

describe("recruitingTimeUtr plans with the cap", () => {
  const at = (perYear: number) => recruitingTimeUtr({ ...base, history: historyAt(perYear) })!;

  it("a pace above the cap projects exactly what the cap does, and keeps its upside", () => {
    const capped = at(1.5);
    for (const fast of [1.6, 2, 3]) {
      const r = at(fast);
      expect(r.value, `${fast}/yr`).toBe(capped.value);
      expect(r.planningPacePerYear).toBe(PLANNING_PACE_CAP_PER_YEAR);
      expect(r.upside?.perYear).toBeCloseTo(fast, 10);
      expect(r.upside!.value).toBe(Math.min(14, Math.round((8 + fast * YEARS) * 10) / 10)); // men's ceiling 14
      expect(r.upside!.value).toBeGreaterThan(r.value);
    }
    expect(capped.value).toBe(Math.round((8 + 1.5 * YEARS) * 10) / 10);
    expect(capped.upside).toBeNull(); // exactly at the cap: nothing faster to show
  });

  it("a pace within the cap is used as it is, with no upside", () => {
    const r = at(1.2);
    expect(r.value).toBe(Math.round((8 + 1.2 * YEARS) * 10) / 10);
    expect(r.upside).toBeNull();
  });

  it("a falling pace still holds at today's rating", () => {
    const r = at(-0.6);
    expect(r.value).toBe(8);
    expect(r.upside).toBeNull();
  });

  it("the ceiling rule stays: neither the plan nor the upside passes it", () => {
    const r = recruitingTimeUtr({ ...base, currentUtr: 13, history: [pt(2025, 11, 19, 10)] })!;
    expect(r.value).toBeLessThanOrEqual(14);
    expect(r.upside?.value ?? r.value).toBeLessThanOrEqual(14);
  });

  it("the chart line and the reach date use the same capped pace", () => {
    const subject = { ...base, history: historyAt(3) };
    const end = projectedUtrOn(subject, projectionTargetDate(2030))!;
    expect(end).toBeCloseTo(8 + PLANNING_PACE_CAP_PER_YEAR * YEARS, 10);
    // One point takes 1/1.5 of a year at the cap — not 1/3 at the own pace.
    const reach = projectionReachDate(subject, 9)!;
    const years = (reach.getTime() - NOW.getTime()) / (365.25 * 86_400_000);
    expect(years).toBeCloseTo(1 / PLANNING_PACE_CAP_PER_YEAR, 6);
  });
});

describe("the Reach / Out-of-range split plans with the cap too", () => {
  const sch = (slug: string, floor: number) =>
    ({ id: slug, slug, name: slug, shortName: slug, minCompetitiveUTR: floor, avgRosterUTR: floor + 1 }) as unknown as SchoolLite;
  // Three logged ratings on a hot streak: +3 a year.
  const hot = [pt(2025, 11, 19, 5), pt(2026, 5, 19, 6.5), pt(2026, 11, 19, 8)];

  it("a floor only the hot streak reaches is Out of range, not Reach", () => {
    const capPlan = 8 + PLANNING_PACE_CAP_PER_YEAR * YEARS; // ~11.8
    const between = sch("between", Math.round((capPlan + 1.5) * 10) / 10); // below the streak, above the cap
    const r = buildFitReport({
      ...base,
      schools: [between],
      view: "today",
      projectionInput: { utrHistory: hot, graduationYear: 2030, gender: "male", now: NOW },
    })!;
    expect(r.bandBySlug.get("between")).toBe("out-of-range");
    // A floor the capped pace does reach is still a closeable Reach today.
    const reachable = sch("reachable", Math.round((capPlan - 0.5) * 10) / 10);
    const r2 = buildFitReport({
      ...base,
      schools: [reachable],
      view: "today",
      projectionInput: { utrHistory: hot, graduationYear: 2030, gender: "male", now: NOW },
    })!;
    expect(r2.bandBySlug.get("reachable")).toBe("reach");
  });
});
