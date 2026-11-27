import type { UtrEstimatePoint } from "@/lib/fit";
import { formatCheckpointUtr, formatPlayerUtr, formatUtrEstimate, hasRealUtr } from "@/lib/utils";
import { formatShortDate } from "@/lib/time";
import { monthYearLabel } from "@/components/seeded/ui/chart-axis";
import { CHART_LINE_NAMES } from "@/lib/chart-legend";

/**
 * Everything PlanTrajectoryChart plots, and what its readout says at a date —
 * pure, so the chart's lines, its dots and its words come from one place and
 * are unit-tested together (plan-trajectory-values.test.ts). The chart draws
 * its paths from seriesPaths() and its readout dots from readoutAt(); it
 * computes no series of its own.
 *
 * The readout's rule is "only what is really on the chart":
 *  - Logged: a REAL entry — the most recent log on or before the date, with
 *    its own date, its dot on that entry's point. Never an interpolated
 *    rating nobody entered, never after the last log, never after today.
 *  - Plan: the dashed line from the last log through the checkpoints. It
 *    stops at the last checkpoint, so the value does too — nothing
 *    extrapolates a plan the player never set. No goal → no line → nothing.
 *  - Planning estimate: lib/fit.ts projectionPath, the dotted line and its
 *    band, over the dates it covers.
 */

export interface ChartPoint {
  date: Date;
  utr: number;
  /** True for the profile's current UTR plotted at today because no dated
   *  entry exists: the date is where it is DRAWN, not when it was entered,
   *  so the readout never prints it. */
  undated?: boolean;
}

export interface Checkpoint extends ChartPoint {
  label: string;
}

export interface ChartSeries {
  /** Logged ratings, oldest first — the solid line. */
  logged: ChartPoint[];
  /** The last log: the "Now" dot and the dashed line's start. */
  now: ChartPoint;
  /** Roadmap checkpoints after `now`, oldest first — the diamonds. */
  checkpoints: Checkpoint[];
  /** The dashed line: `now`, then each checkpoint. Empty without checkpoints. */
  plan: ChartPoint[];
  /** projectionPath — the dotted estimate and its band. */
  estimate: UtrEstimatePoint[];
  today: Date;
}

/** The chart's data, or null when nothing is logged (the chart shows its
 *  empty state). `today` defaults to the current date. */
export function buildChartSeries(input: {
  actualPoints: readonly ChartPoint[];
  /** lib/fit planCheckpoints — the quarterly line to the Plan UTR. */
  checkpoints: readonly { date: Date; utr: number; label: string }[];
  estimate: readonly UtrEstimatePoint[];
  today?: Date;
}): ChartSeries | null {
  const logged = input.actualPoints
    .filter((p) => hasRealUtr(p.utr))
    .map((p) => (p.undated ? { date: p.date, utr: p.utr, undated: true } : { date: p.date, utr: p.utr }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (logged.length === 0) return null;
  const now = logged[logged.length - 1];
  const checkpoints: Checkpoint[] = input.checkpoints
    .map((c) => ({ date: c.date, utr: c.utr, label: c.label }))
    .filter((c) => c.date.getTime() > now.date.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    logged,
    now,
    checkpoints,
    plan: checkpoints.length > 0 ? [now, ...checkpoints] : [],
    estimate: [...input.estimate],
    today: input.today ?? new Date(),
  };
}

export interface ChartGeometry {
  x: (t: number) => number;
  y: (utr: number) => number;
}

const pointsOf = (pts: readonly { date: Date }[], value: (i: number) => number, g: ChartGeometry) =>
  pts.map((p, i) => `${g.x(p.date.getTime())},${g.y(value(i))}`);

/** The SVG geometry of every line, from the same series the readout reads. */
export function seriesPaths(series: ChartSeries, g: ChartGeometry) {
  const { logged, plan, estimate } = series;
  return {
    logged: logged.length > 1 ? pointsOf(logged, (i) => logged[i].utr, g).join(" ") : null,
    plan: plan.length > 1 ? pointsOf(plan, (i) => plan[i].utr, g).join(" ") : null,
    estimate: estimate.length > 1 ? pointsOf(estimate, (i) => estimate[i].value, g).join(" ") : null,
    band:
      estimate.length > 1
        ? `M${pointsOf(estimate, (i) => estimate[i].high, g).join(" L")} L${pointsOf(
            [...estimate].reverse(),
            (i) => estimate[estimate.length - 1 - i].low,
            g
          ).join(" L")} Z`
        : null,
  };
}

/**
 * The SVG draws in a viewBox `viewBoxWidth` wide but CSS can scale it
 * (`max-w-full`), so a pointer's CSS-pixel offset must be scaled into
 * viewBox units or the crosshair drifts from the pointer.
 */
export function clientXToViewBoxX(clientX: number, rect: { left: number; width: number }, viewBoxWidth: number): number {
  if (!(rect.width > 0)) return clientX - rect.left;
  return (clientX - rect.left) * (viewBoxWidth / rect.width);
}

/** Linear interpolation along a polyline of [time, value] vertices, null
 *  outside the vertices' span. Vertices must be sorted by time. */
function along(vertices: ReadonlyArray<readonly [number, number]>, t: number): number | null {
  if (vertices.length === 0) return null;
  if (t < vertices[0][0] || t > vertices[vertices.length - 1][0]) return null;
  for (let i = 0; i < vertices.length - 1; i++) {
    const [ta, va] = vertices[i];
    const [tb, vb] = vertices[i + 1];
    if (t >= ta && t <= tb) {
      const span = tb - ta;
      return span === 0 ? vb : va + ((vb - va) * (t - ta)) / span;
    }
  }
  return vertices[vertices.length - 1][1];
}

export interface ChartValuesAt {
  /** The real entry in force at the date — never an interpolated value. */
  logged: ChartPoint | null;
  plan: number | null;
  estimate: { value: number; low: number; high: number } | null;
}

export function chartValuesAt(series: Pick<ChartSeries, "logged" | "plan" | "estimate" | "today">, t: number): ChartValuesAt {
  const { logged: logs, plan: planPts, estimate: est } = series;

  let logged: ChartPoint | null = null;
  // Up to today, the most recent real entry on or before the date is the
  // rating in force — including between the last log and today. Never after
  // today, and never an interpolated value.
  if (t <= series.today.getTime()) {
    for (const p of logs) {
      if (p.date.getTime() <= t) logged = p;
      else break;
    }
    if (logged && !hasRealUtr(logged.utr)) logged = null;
  }

  let plan: number | null = null;
  if (planPts.length > 1 && t > planPts[0].date.getTime()) {
    const v = along(
      planPts.map((p) => [p.date.getTime(), p.utr] as const),
      t
    );
    plan = hasRealUtr(v) ? v : null;
  }

  let estimate: ChartValuesAt["estimate"] = null;
  if (est.length > 1) {
    const value = along(est.map((p) => [p.date.getTime(), p.value] as const), t);
    const low = along(est.map((p) => [p.date.getTime(), p.low] as const), t);
    const high = along(est.map((p) => [p.date.getTime(), p.high] as const), t);
    if (hasRealUtr(value) && low != null && high != null) estimate = { value, low, high };
  }

  return { logged, plan, estimate };
}

export interface ReadoutRow {
  key: "logged" | "plan" | "estimate";
  label: string;
  text: string;
  /** Where the row's dot sits — on the row's own line. */
  dot: { cx: number; cy: number };
}

export interface Readout {
  date: string;
  rows: ReadoutRow[];
  /** One sentence for the aria-live region. */
  sentence: string;
}

/** A log's own date, always with its year: "Nov 21" for a 2025 entry sat
 *  beside a "Nov 21" that meant this year (final-check A12). */
function entryDate(d: Date): string {
  return `${formatShortDate(d)} '${String(d.getFullYear()).slice(2)}`;
}

/** What the readout says at `t`, and where each dot sits. */
export function readoutAt(series: ChartSeries, t: number, g: ChartGeometry, goalValue?: number | null): Readout {
  const at = chartValuesAt(series, t);
  const cursor = new Date(t);
  const cx = g.x(t);
  const rows: ReadoutRow[] = [];
  if (at.logged) {
    const e = at.logged;
    rows.push({
      key: "logged",
      label: CHART_LINE_NAMES.logged,
      text: e.undated ? `${formatPlayerUtr(e.utr)} · current` : `${formatPlayerUtr(e.utr)} · ${entryDate(e.date)}`,
      // On the ENTRY's own point on the solid line, not under the crosshair.
      dot: { cx: g.x(e.date.getTime()), cy: g.y(e.utr) },
    });
  }
  if (at.plan != null) {
    rows.push({ key: "plan", label: CHART_LINE_NAMES.plan, text: formatCheckpointUtr(at.plan, goalValue), dot: { cx, cy: g.y(at.plan) } });
  }
  if (at.estimate) {
    const e = at.estimate;
    const band = e.high - e.low >= 0.05 ? ` (${formatUtrEstimate(e.low)}–${formatUtrEstimate(e.high)})` : "";
    rows.push({
      key: "estimate",
      label: CHART_LINE_NAMES.estimate,
      text: `${formatUtrEstimate(e.value)}${band}`,
      dot: { cx, cy: g.y(e.value) },
    });
  }
  const date = monthYearLabel(cursor);
  const sentence = `${date}: ${rows.length ? rows.map((r) => `${r.label} ${r.text}`).join(", ") : "Not tracked"}`;
  return { date, rows, sentence };
}

/** `anchor` moved by whole calendar months, clamped to the target month's
 *  last day. Always step from the ORIGINAL anchor (Jan 31 + 2 → Mar 31), not
 *  from the last result, or the day drifts (Jan 31 → Feb 28 → Mar 28). */
export function stepMonths(anchor: number, months: number): number {
  const d = new Date(anchor);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

/** The cursor: a date the pointer chose, or an anchor plus a number of
 *  keyboard month steps from it. */
export type ChartCursor = { anchor: number; months: number } | null;

export function cursorTime(c: ChartCursor, bounds: { min: number; max: number }): number | null {
  if (!c) return null;
  return Math.min(Math.max(stepMonths(c.anchor, c.months), bounds.min), bounds.max);
}

/** The keyboard: Left/Right a month, Home/End the ends, Escape clears. The
 *  first arrow puts the cursor on `start` (the last log). Undefined = the
 *  key is not the chart's. */
export function cursorAfterKey(
  c: ChartCursor,
  key: string,
  bounds: { min: number; max: number },
  start: number
): ChartCursor | undefined {
  if (key === "Escape") return null;
  if (key === "Home") return { anchor: bounds.min, months: 0 };
  if (key === "End") return { anchor: bounds.max, months: 0 };
  if (key !== "ArrowLeft" && key !== "ArrowRight") return undefined;
  if (!c) return { anchor: start, months: 0 };
  const step = key === "ArrowRight" ? 1 : -1;
  const next = stepMonths(c.anchor, c.months + step);
  if (next > bounds.max) return { anchor: bounds.max, months: 0 };
  if (next < bounds.min) return { anchor: bounds.min, months: 0 };
  return { anchor: c.anchor, months: c.months + step };
}
