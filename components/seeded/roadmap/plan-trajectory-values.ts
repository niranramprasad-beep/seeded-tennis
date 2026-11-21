import type { UtrEstimatePoint } from "@/lib/fit";
import { hasRealUtr } from "@/lib/utils";

/**
 * What PlanTrajectoryChart reads off its lines at one date — pure, so the
 * hover/drag/arrow-key readout is unit-tested (plan-trajectory-values.test.ts).
 *
 * The rule is "a dot only where its line is drawn":
 *  - Logged: the solid line, from the first log to the last, and never past
 *    today. A future date is never shown as logged (the readout used to clamp
 *    every date to the last log, so past "Now" its dot stuck at that value).
 *  - Plan: the dashed line from the last log through the checkpoints. It
 *    stops at the last checkpoint, so the value does too — nothing
 *    extrapolates a plan the player never set. No goal → no line → null.
 *  - Estimate: lib/fit.ts projectionPath, the dotted line and its band, over
 *    the dates it covers.
 */

export interface ChartPoint {
  date: Date;
  utr: number;
}

export interface ChartSeries {
  /** Logged ratings, oldest first — the solid line. */
  logged: readonly ChartPoint[];
  /** The dashed line: the last log, then each checkpoint. Empty without a goal. */
  plan: readonly ChartPoint[];
  /** projectionPath — the dotted estimate and its band. */
  estimate: readonly UtrEstimatePoint[];
  today: Date;
}

export interface ChartValuesAt {
  logged: number | null;
  plan: number | null;
  estimate: { value: number; low: number; high: number } | null;
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
  const first = vertices[0][0];
  const last = vertices[vertices.length - 1][0];
  if (t < first || t > last) return null;
  for (let i = 0; i < vertices.length - 1; i++) {
    const [ta, va] = vertices[i];
    const [tb, vb] = vertices[i + 1];
    if (t >= ta && t <= tb) {
      const span = tb - ta;
      return span === 0 ? vb : va + ((vb - va) * (t - ta)) / span;
    }
  }
  // A single vertex: only exactly on it.
  return vertices[vertices.length - 1][1];
}

export function chartValuesAt(series: ChartSeries, t: number): ChartValuesAt {
  const todayT = series.today.getTime();

  let logged: number | null = null;
  if (t <= todayT) {
    const v = along(
      series.logged.map((p) => [p.date.getTime(), p.utr] as const),
      t
    );
    logged = hasRealUtr(v) ? v : null;
  }

  let plan: number | null = null;
  if (series.plan.length > 1 && t > series.plan[0].date.getTime()) {
    const v = along(
      series.plan.map((p) => [p.date.getTime(), p.utr] as const),
      t
    );
    plan = hasRealUtr(v) ? v : null;
  }

  let estimate: ChartValuesAt["estimate"] = null;
  if (series.estimate.length > 1) {
    const pts = series.estimate;
    const value = along(pts.map((p) => [p.date.getTime(), p.value] as const), t);
    const low = along(pts.map((p) => [p.date.getTime(), p.low] as const), t);
    const high = along(pts.map((p) => [p.date.getTime(), p.high] as const), t);
    if (hasRealUtr(value) && low != null && high != null) estimate = { value, low, high };
  }

  return { logged, plan, estimate };
}

/** `t` moved by whole calendar months — the arrow keys' step. */
export function stepMonths(t: number, months: number): number {
  const d = new Date(t);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Clamp to the target month's last day (Jan 31 + 1 → Feb 28, not Mar 3).
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}
