import { describe, expect, it } from "vitest";
import {
  buildUtrChartSeries,
  buildUtrSummaryLine,
  computeUtrProjection,
  gradeStandingName,
  nextFallDate,
  type UtrDataPoint,
} from "./utr-projection";

function d(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

describe("computeUtrProjection", () => {
  it("returns null with fewer than 3 points", () => {
    expect(computeUtrProjection([])).toBeNull();
    expect(computeUtrProjection([{ date: d("2026-01-01"), utr: 7 }])).toBeNull();
    expect(
      computeUtrProjection([
        { date: d("2026-01-01"), utr: 7 },
        { date: d("2026-02-01"), utr: 7.5 },
      ])
    ).toBeNull();
  });

  it("fits an exact line through perfectly linear data", () => {
    // +0.1 UTR every 10 days, over 90 days.
    const points: UtrDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
      date: new Date(2026, 0, 1 + i * 10),
      utr: 7 + i * 0.1,
    }));
    const projection = computeUtrProjection(points)!;
    expect(projection).not.toBeNull();
    // Predict at the last known point should match it almost exactly.
    const last = points[points.length - 1];
    expect(projection.predict(last.date)).toBeCloseTo(last.utr, 1);
    // Predicting 90 days further should continue the same slope (+0.9).
    const future = new Date(last.date);
    future.setDate(future.getDate() + 90);
    expect(projection.predict(future)).toBeCloseTo(last.utr + 0.9, 0);
  });

  it("weights recent results more than old ones", () => {
    // Flat for a long stretch, then a sharp recent climb — the weighted
    // slope should lean toward the recent trend, not the flat average.
    const points: UtrDataPoint[] = [
      { date: d("2025-01-01"), utr: 7.0 },
      { date: d("2025-04-01"), utr: 7.0 },
      { date: d("2025-07-01"), utr: 7.0 },
      { date: d("2025-10-01"), utr: 7.0 },
      { date: d("2026-01-01"), utr: 7.5 },
      { date: d("2026-02-01"), utr: 8.0 },
    ];
    const projection = computeUtrProjection(points)!;
    // An unweighted (simple average) slope over the full span would be much
    // shallower than the recent climb; confirm the fit leans steep/recent.
    const naiveSlope =
      (points[points.length - 1].utr - points[0].utr) /
      ((points[points.length - 1].date.getTime() - points[0].date.getTime()) / 86_400_000);
    expect(projection.slope).toBeGreaterThan(naiveSlope);
  });

  it("widens the uncertainty band further into the future", () => {
    const points: UtrDataPoint[] = [
      { date: d("2026-01-01"), utr: 7.0 },
      { date: d("2026-02-01"), utr: 7.3 },
      { date: d("2026-03-01"), utr: 6.9 },
      { date: d("2026-04-01"), utr: 7.4 },
    ];
    const projection = computeUtrProjection(points)!;
    const soon = d("2026-05-01");
    const later = d("2027-01-01");
    const widthSoon = projection.upperBound(soon) - projection.lowerBound(soon);
    const widthLater = projection.upperBound(later) - projection.lowerBound(later);
    expect(widthLater).toBeGreaterThan(widthSoon);
  });

  it("never predicts past the realistic ceiling, even on a hot streak", () => {
    // +1.5 UTR every month for 4 months — a real, fast improvement — but
    // extrapolated 2 years out a raw linear fit would blow well past 18.
    const points: UtrDataPoint[] = [
      { date: d("2026-01-01"), utr: 4.0 },
      { date: d("2026-02-01"), utr: 5.5 },
      { date: d("2026-03-01"), utr: 7.0 },
      { date: d("2026-04-01"), utr: 8.5 },
    ];
    const projection = computeUtrProjection(points, { ceiling: 14, floor: 1 })!;
    const twoYearsOut = d("2028-04-01");
    expect(projection.predict(twoYearsOut)).toBeLessThan(14.5);
    expect(projection.upperBound(twoYearsOut)).toBeLessThan(14.5);
  });

  it("keeps predictions strictly linear (unaffected by the cap) while well under the ceiling", () => {
    const points: UtrDataPoint[] = [
      { date: d("2026-01-01"), utr: 7.0 },
      { date: d("2026-02-01"), utr: 7.2 },
      { date: d("2026-03-01"), utr: 7.4 },
    ];
    const uncapped = computeUtrProjection(points)!;
    const capped = computeUtrProjection(points, { ceiling: 14, floor: 1 })!;
    const soon = d("2026-05-01");
    expect(capped.predict(soon)).toBeCloseTo(uncapped.predict(soon), 5);
  });

  it("respects a custom (e.g. female) ceiling", () => {
    const points: UtrDataPoint[] = [
      { date: d("2026-01-01"), utr: 4.0 },
      { date: d("2026-02-01"), utr: 5.5 },
      { date: d("2026-03-01"), utr: 7.0 },
      { date: d("2026-04-01"), utr: 8.5 },
    ];
    const projection = computeUtrProjection(points, { ceiling: 12.5, floor: 1 })!;
    expect(projection.predict(d("2028-04-01"))).toBeLessThan(13);
  });
});

describe("nextFallDate", () => {
  it("picks this year's Sept 1 when still ahead", () => {
    expect(nextFallDate(d("2026-03-15"))).toEqual(new Date(2026, 8, 1));
  });

  it("rolls to next year's Sept 1 once past it", () => {
    expect(nextFallDate(d("2026-10-01"))).toEqual(new Date(2027, 8, 1));
  });

  it("treats Sept 1 itself as already being fall of that year", () => {
    expect(nextFallDate(new Date(2026, 8, 1))).toEqual(new Date(2026, 8, 1));
  });
});

describe("gradeStandingName", () => {
  it("names the four high school years", () => {
    expect(gradeStandingName(9)).toBe("freshman");
    expect(gradeStandingName(10)).toBe("sophomore");
    expect(gradeStandingName(11)).toBe("junior");
    expect(gradeStandingName(12)).toBe("senior");
  });

  it("falls back gracefully outside that range", () => {
    expect(gradeStandingName(8)).toBe("8th-grade");
  });
});

describe("buildUtrSummaryLine", () => {
  it("returns null without a projection", () => {
    expect(
      buildUtrSummaryLine({ projection: null, graduationYear: 2029, targetUTR: 9 })
    ).toBeNull();
  });

  it("mentions the target and a grade standing", () => {
    const points: UtrDataPoint[] = [
      { date: d("2026-01-01"), utr: 7.0 },
      { date: d("2026-04-01"), utr: 7.4 },
      { date: d("2026-07-01"), utr: 7.8 },
    ];
    const projection = computeUtrProjection(points);
    const line = buildUtrSummaryLine({
      projection,
      graduationYear: 2029,
      targetUTR: 9.0,
      today: d("2026-08-01"),
    });
    expect(line).toContain("9.0");
    expect(line).toMatch(/freshman|sophomore|junior|senior/);
  });
});

describe("buildUtrChartSeries", () => {
  const actualEntries: UtrDataPoint[] = [
    { date: d("2025-01-01"), utr: 6.5 },
    { date: d("2025-06-01"), utr: 7.0 },
    { date: d("2026-01-01"), utr: 7.5 },
    { date: d("2026-06-01"), utr: 8.0 },
  ];
  const targetPoints: UtrDataPoint[] = [
    { date: d("2027-06-01"), utr: 9.0 },
    { date: d("2028-06-01"), utr: 10.5 },
  ];

  it("has no projection with fewer than 3 points in range", () => {
    const result = buildUtrChartSeries({
      actualEntries: actualEntries.slice(0, 2),
      targetPoints,
      range: "ALL",
      today: d("2026-07-01"),
    });
    expect(result.hasProjection).toBe(false);
    expect(result.rows.some((r) => r.projected != null)).toBe(false);
  });

  it("projects once there are 3+ points", () => {
    const result = buildUtrChartSeries({
      actualEntries,
      targetPoints,
      range: "ALL",
      today: d("2026-07-01"),
    });
    expect(result.hasProjection).toBe(true);
    expect(result.rows.some((r) => r.projected != null)).toBe(true);
  });

  it("zooms the whole chart (history AND forward lines) when a fixed range is picked", () => {
    const all = buildUtrChartSeries({
      actualEntries,
      targetPoints,
      range: "ALL",
      today: d("2026-07-01"),
    });
    const threeMonth = buildUtrChartSeries({
      actualEntries,
      targetPoints,
      range: "3M",
      today: d("2026-07-01"),
    });
    const allActualCount = all.rows.filter((r) => r.actual != null).length;
    const threeMonthActualCount = threeMonth.rows.filter((r) => r.actual != null).length;
    expect(threeMonthActualCount).toBeLessThan(allActualCount);
    // Projection still exists in both, but "3M" shouldn't extend the chart
    // two years into the future — the toggle should visibly change the zoom,
    // not just hide a few history dots on an otherwise-identical chart.
    expect(all.hasProjection).toBe(threeMonth.hasProjection);
    const allMaxDate = Math.max(...all.rows.map((r) => r.dateMs));
    const threeMonthMaxDate = Math.max(...threeMonth.rows.map((r) => r.dateMs));
    expect(threeMonthMaxDate).toBeLessThan(allMaxDate);
  });

  it("includes real roadmap target points within the horizon", () => {
    const result = buildUtrChartSeries({
      actualEntries,
      targetPoints,
      range: "ALL",
      today: d("2026-07-01"),
    });
    const targetValues = result.rows.filter((r) => r.target != null).map((r) => r.target);
    expect(targetValues).toContain(9.0);
  });

  it("never invents an actual point that wasn't logged", () => {
    const result = buildUtrChartSeries({
      actualEntries,
      targetPoints,
      range: "ALL",
      today: d("2026-07-01"),
    });
    const actualValues = result.rows.filter((r) => r.actual != null).map((r) => r.actual);
    expect(actualValues.sort()).toEqual([6.5, 7, 7.5, 8]);
  });

  it("caps the projected line at the player's gender ceiling", () => {
    const hotStreak: UtrDataPoint[] = [
      { date: d("2026-01-01"), utr: 4.0 },
      { date: d("2026-02-01"), utr: 5.5 },
      { date: d("2026-03-01"), utr: 7.0 },
      { date: d("2026-04-01"), utr: 8.5 },
    ];
    const result = buildUtrChartSeries({
      actualEntries: hotStreak,
      targetPoints: [],
      range: "ALL",
      gender: "female",
      today: d("2026-04-15"),
    });
    const projectedValues = result.rows
      .filter((r) => r.projected != null)
      .map((r) => r.projected as number);
    expect(Math.max(...projectedValues)).toBeLessThan(13);
  });
});
