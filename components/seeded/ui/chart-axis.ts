// Axis layout shared by the /today and /plan UTR charts. Presentation only —
// every value plotted comes from the player's logged ratings, the roadmap
// (lib/db/plan.ts) or lib/fit.ts's projectionPath.

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jun '27" — short enough to fit an axis at 320px. */
export function monthYearLabel(d: Date): string {
  return `${MONTH_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

/** Roughly how wide a label is in px at `fontSize`, for keeping labels
 *  inside the chart and apart from each other. Conservative (wide). */
export function approxTextWidth(text: string, fontSize: number): number {
  return Math.ceil(text.length * fontSize * 0.62);
}

/**
 * Month-aligned x ticks between two times, spaced so no two labels are
 * closer than `minGapPx`. Picks the smallest of 1/2/3/6/12-month steps that
 * fits, so a phone gets yearly ticks and a desktop quarterly ones.
 */
export function monthTicks(
  dateMin: number,
  dateMax: number,
  plotWidthPx: number,
  minGapPx = 64
): Date[] {
  const spanMonths = Math.max(1, (dateMax - dateMin) / (30.44 * 86_400_000));
  const maxTicks = Math.max(2, Math.floor(plotWidthPx / minGapPx));
  const step = [1, 2, 3, 6, 12, 24].find((s) => spanMonths / s <= maxTicks) ?? 24;
  const ticks: Date[] = [];
  const start = new Date(dateMin);
  let cursor = new Date(start.getFullYear(), start.getMonth() + (start.getDate() > 1 ? 1 : 0), 1);
  // Align to the step so labels read Jan/Apr/Jul/Oct rather than arbitrary months.
  while (cursor.getMonth() % step !== 0 && step <= 12) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  while (cursor.getTime() <= dateMax) {
    ticks.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
  }
  return ticks;
}

/** Whole-number y ticks inside [min, max], every 1 UTR (every 0.5 when the
 *  range is narrow, so there are always at least two gridlines). */
export function utrTicks(min: number, max: number): number[] {
  const step = max - min < 2 ? 0.5 : 1;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return ticks;
}
