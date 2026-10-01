// Pure math for the player homepage UTR graph. No React, no Supabase — just
// turning a list of real UTR entries into a trajectory a player can read.
// Never invents data: every "actual" point traces back to a real entry (or
// the player's own current UTR as the single "today" anchor when there's no
// history yet).

import { getCurrentGrade } from "@/lib/time";

export interface UtrDataPoint {
  date: Date;
  utr: number;
}

export interface UtrProjection {
  /** UTR change per day, from the weighted fit. */
  slope: number;
  /** Projected UTR on `date`. */
  predict: (date: Date) => number;
  /** Upper edge of the uncertainty band on `date` — widens the further out you ask. */
  upperBound: (date: Date) => number;
  /** Lower edge of the uncertainty band on `date`. */
  lowerBound: (date: Date) => number;
}

const MIN_POINTS_FOR_PROJECTION = 3;
const MS_PER_DAY = 86_400_000;

/**
 * Weighted linear regression over UTR history, where later entries count
 * more than earlier ones (linear rank weighting: the most recent point
 * counts `n` times as much as the first). Returns null with fewer than 3
 * points — a trend line from 1-2 points isn't a trend, it's a guess.
 */
export function computeUtrProjection(points: UtrDataPoint[]): UtrProjection | null {
  if (points.length < MIN_POINTS_FOR_PROJECTION) return null;

  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime());
  const t0 = sorted[0].date.getTime();
  const n = sorted.length;
  const xs = sorted.map((p) => (p.date.getTime() - t0) / MS_PER_DAY);
  const ys = sorted.map((p) => p.utr);
  // Recent results count more: rank 1..n, most recent weighted heaviest.
  const weights = xs.map((_, i) => i + 1);
  const sumW = weights.reduce((a, b) => a + b, 0);

  const meanX = xs.reduce((a, x, i) => a + weights[i] * x, 0) / sumW;
  const meanY = ys.reduce((a, y, i) => a + weights[i] * y, 0) / sumW;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += weights[i] * (xs[i] - meanX) * (ys[i] - meanY);
    den += weights[i] * (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  let weightedResidualSq = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * xs[i];
    weightedResidualSq += weights[i] * (ys[i] - predicted) ** 2;
  }
  const residualStd = Math.sqrt(weightedResidualSq / sumW);
  // A floor on the band so a too-tidy history (near-zero residual) doesn't
  // render as a false-confidence hairline — recruiting-grade uncertainty.
  const bandFloor = 0.15;

  const toDays = (date: Date) => (date.getTime() - t0) / MS_PER_DAY;
  const lastDay = xs[n - 1];
  const predict = (date: Date) => intercept + slope * toDays(date);
  const bandWidth = (date: Date) => {
    const daysAhead = Math.max(0, toDays(date) - lastDay);
    const monthsAhead = daysAhead / 30;
    return Math.max(bandFloor, residualStd) * Math.sqrt(1 + monthsAhead);
  };

  return {
    slope,
    predict,
    upperBound: (date) => predict(date) + bandWidth(date),
    lowerBound: (date) => predict(date) - bandWidth(date),
  };
}

/** "you'll reach 8.2 by fall of junior year" — the nearest upcoming September 1st. */
export function nextFallDate(today: Date = new Date()): Date {
  const fallThisYear = new Date(today.getFullYear(), 8, 1); // Sept 1
  return today <= fallThisYear ? fallThisYear : new Date(today.getFullYear() + 1, 8, 1);
}

const GRADE_STANDING: Record<number, string> = {
  9: "freshman",
  10: "sophomore",
  11: "junior",
  12: "senior",
};

/** "freshman", "sophomore", ... falls back to "Nth-grade" outside that range. */
export function gradeStandingName(grade: number): string {
  return GRADE_STANDING[grade] ?? `${grade}th-grade`;
}

/** "At your current pace, you'll reach 8.2 by fall of junior year. Your target is 9.0." */
export function buildUtrSummaryLine(input: {
  projection: UtrProjection | null;
  graduationYear: number;
  targetUTR: number;
  today?: Date;
}): string | null {
  if (!input.projection) return null;
  const today = input.today ?? new Date();
  const milestoneDate = nextFallDate(today);
  const standing = gradeStandingName(getCurrentGrade(input.graduationYear, milestoneDate));
  const predicted = Math.round(input.projection.predict(milestoneDate) * 10) / 10;
  return `At your current pace, you'll reach ${predicted.toFixed(1)} by fall of ${standing} year. Your target is ${input.targetUTR.toFixed(1)}.`;
}

export type UtrRangeOption = "3M" | "6M" | "1Y" | "ALL";

export interface UtrChartRow {
  dateMs: number;
  actual?: number;
  target?: number;
  projected?: number;
  projLower?: number;
  projUpper?: number;
}

export interface BuildUtrSeriesInput {
  /** Real logged UTR history. Never includes invented points. */
  actualEntries: UtrDataPoint[];
  /** Real roadmap checkpoints (from buildRoadmap), used for the target line. */
  targetPoints: UtrDataPoint[];
  range: UtrRangeOption;
  today?: Date;
}

export interface BuiltUtrSeries {
  rows: UtrChartRow[];
  hasProjection: boolean;
  projection: UtrProjection | null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rangeStartDate(
  range: UtrRangeOption,
  sortedActual: UtrDataPoint[],
  today: Date
): Date {
  if (range === "3M") return addMonths(today, -3);
  if (range === "6M") return addMonths(today, -6);
  if (range === "1Y") return addMonths(today, -12);
  // ALL: the earliest real data point, or today if there's no history yet.
  return sortedActual[0]?.date ?? today;
}

// How far forward the projected/target lines reach. A fixed range (3M/6M/1Y)
// zooms the whole chart symmetrically — "3M" means a 3-month window in both
// directions, the way a stock-chart range toggle works, so the toggle
// actually changes what's on screen. "All" keeps the old behavior: reach
// forward to the roadmap's last checkpoint, clamped to 6-24 months out.
function projectionHorizon(
  range: UtrRangeOption,
  today: Date,
  targetPoints: UtrDataPoint[]
): Date {
  if (range === "3M") return addMonths(today, 3);
  if (range === "6M") return addMonths(today, 6);
  if (range === "1Y") return addMonths(today, 12);
  const maxHorizon = addMonths(today, 24);
  const minHorizon = addMonths(today, 6);
  const lastTarget = targetPoints[targetPoints.length - 1]?.date;
  if (!lastTarget) return maxHorizon;
  if (lastTarget < minHorizon) return minHorizon;
  if (lastTarget > maxHorizon) return maxHorizon;
  return lastTarget;
}

function monthlyStepsBetween(start: Date, end: Date): Date[] {
  const steps: Date[] = [];
  let cursor = addMonths(start, 1);
  while (cursor < end) {
    steps.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  steps.push(end);
  return steps;
}

/**
 * Builds a single merged row set for the chart: actual history (clipped to
 * the selected range), a projected line seeded at the last real point (so it
 * connects visually, never floats), and the roadmap's target line. Every
 * value traces back to either a real entry, the player's own current UTR, or
 * an explicit derivation (projection/roadmap) — nothing is fabricated.
 */
export function buildUtrChartSeries(input: BuildUtrSeriesInput): BuiltUtrSeries {
  const today = input.today ?? new Date();
  const sortedActual = [...input.actualEntries].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const start = rangeStartDate(input.range, sortedActual, today);
  const projection = computeUtrProjection(sortedActual);
  const horizon = projectionHorizon(input.range, today, input.targetPoints);

  const rows = new Map<number, UtrChartRow>();
  const upsert = (date: Date, patch: Partial<UtrChartRow>) => {
    const key = startOfDay(date).getTime();
    rows.set(key, { ...(rows.get(key) ?? { dateMs: key }), ...patch });
  };

  sortedActual
    .filter((p) => p.date >= start)
    .forEach((p) => upsert(p.date, { actual: round1(p.utr) }));

  const lastActual = sortedActual[sortedActual.length - 1];
  if (projection && lastActual) {
    // Seed the dashed line at the same point the solid line ends, so there's
    // no visual gap between "actual" and "projected".
    upsert(lastActual.date, {
      projected: round1(lastActual.utr),
      projLower: round1(lastActual.utr),
      projUpper: round1(lastActual.utr),
    });
    monthlyStepsBetween(lastActual.date, horizon).forEach((date) =>
      upsert(date, {
        projected: round1(projection.predict(date)),
        projLower: round1(projection.lowerBound(date)),
        projUpper: round1(projection.upperBound(date)),
      })
    );
  }

  input.targetPoints
    .filter((p) => p.date >= start && p.date <= horizon)
    .forEach((p) => upsert(p.date, { target: round1(p.utr) }));

  return {
    rows: Array.from(rows.values()).sort((a, b) => a.dateMs - b.dateMs),
    hasProjection: Boolean(projection),
    projection,
  };
}
