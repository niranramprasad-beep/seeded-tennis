// Pure math for the player homepage UTR graph. No React, no Supabase — just
// turning a list of real UTR entries into a trajectory a player can read.
// Never invents data: every "actual" point traces back to a real entry (or
// the player's own current UTR as the single "today" anchor when there's no
// history yet).

import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";

export interface UtrDataPoint {
  date: Date;
  utr: number;
  /**
   * Set ONLY by syntheticUtrHistoryFor() (lib/what-if-utr.ts): a point on an
   * assumed line, not a rating anyone logged. The mark travels with the
   * point, so a synthetic history spread into another input stays marked.
   * lib/fit.ts's loggedPaceFor() never takes a pace from a marked point —
   * otherwise the homepage's realistic-pace line would be shown to a
   * visitor as "your logged pace".
   */
  synthetic?: true;
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

// A raw linear fit through a hot recent streak extrapolates forever — with
// no ceiling, a real month-over-month jump can "predict" a UTR that doesn't
// exist on the actual scale (max 16.50). Default ceiling matches the higher
// of the two gender caps; callers that know the player's gender should pass
// the exact REALISTIC_UTR_CEILING value instead.
const DEFAULT_PROJECTION_CEILING = REALISTIC_UTR_CEILING.male;
const PROJECTION_FLOOR = 1.0;
// How far past the ceiling/floor the soft cap still allows, asymptotically —
// small enough that the number never reads as "impossible" again.
const SOFT_CAP_RANGE = 0.3;

/**
 * Lets values move freely inside [floor, ceiling], but values that would
 * cross either edge get compressed so they approach floor-SOFT_CAP_RANGE /
 * ceiling+SOFT_CAP_RANGE asymptotically instead of blowing past it. A hard
 * clamp would put a visible kink in the line right at the ceiling; this
 * keeps the curve smooth while still ruling out "impossible" numbers.
 */
function softCap(value: number, ceiling: number, floor: number): number {
  if (value > ceiling) {
    const excess = value - ceiling;
    return ceiling + SOFT_CAP_RANGE * (1 - Math.exp(-excess / SOFT_CAP_RANGE));
  }
  if (value < floor) {
    const deficit = floor - value;
    return floor - SOFT_CAP_RANGE * (1 - Math.exp(-deficit / SOFT_CAP_RANGE));
  }
  return value;
}

/**
 * Weighted linear regression over UTR history, where later entries count
 * more than earlier ones (linear rank weighting: the most recent point
 * counts `n` times as much as the first). Returns null with fewer than 3
 * points — a trend line from 1-2 points isn't a trend, it's a guess.
 */
export function computeUtrProjection(
  points: UtrDataPoint[],
  options?: { ceiling?: number; floor?: number }
): UtrProjection | null {
  if (points.length < MIN_POINTS_FOR_PROJECTION) return null;
  const ceiling = options?.ceiling ?? DEFAULT_PROJECTION_CEILING;
  const floor = options?.floor ?? PROJECTION_FLOOR;

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
  // Pure linear fit, uncapped — the soft cap is applied uniformly below so
  // predict/upperBound/lowerBound stay consistently ordered even once one of
  // them crosses the ceiling or floor.
  const rawPredict = (date: Date) => intercept + slope * toDays(date);
  const bandWidth = (date: Date) => {
    const daysAhead = Math.max(0, toDays(date) - lastDay);
    const monthsAhead = daysAhead / 30;
    return Math.max(bandFloor, residualStd) * Math.sqrt(1 + monthsAhead);
  };

  return {
    slope,
    predict: (date) => softCap(rawPredict(date), ceiling, floor),
    upperBound: (date) => softCap(rawPredict(date) + bandWidth(date), ceiling, floor),
    lowerBound: (date) => softCap(rawPredict(date) - bandWidth(date), ceiling, floor),
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
