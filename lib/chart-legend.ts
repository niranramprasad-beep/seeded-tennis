// ONE vocabulary for the two UTR charts (final-check A3, 2026-11-21).
//
// /today's "UTR vs plan" legend once named the same green dashes the
// estimate while /plan's named them the plan. Both charts now draw each line
// the same way and name it the same way, here:
//
//   solid green          → Your UTR  (the ratings the player logged)
//   green dashes + gold  → Plan      (checkpoints to the player's Plan UTR)
//   dotted green         → Estimate  (drawn only while no Plan UTR is set)
//
// 2026-11-27: the grey "estimate at your own pace" line is gone with the
// 1.5-a-year banners, and the legend is swatches, not a sentence.
// The readout on /plan's chart uses the same names (plan-trajectory-values.ts).

export const CHART_LINE_NAMES = {
  logged: "Your UTR",
  estimate: "Estimate",
  plan: "Plan",
} as const;

export interface ChartLegendInput {
  /** The dotted estimate line is drawn (only when no plan UTR is set). */
  estimate: boolean;
  /** The dashed plan line is drawn, to this Plan UTR (as printed). */
  planUtr: string | null;
}

export interface ChartLegendItem {
  key: "logged" | "plan" | "estimate";
  label: string;
}

/** The legend under both UTR charts — only lines that are drawn. */
export function chartLegendItems(input: ChartLegendInput): ChartLegendItem[] {
  const items: ChartLegendItem[] = [{ key: "logged", label: `${CHART_LINE_NAMES.logged} (logged)` }];
  if (input.planUtr) items.push({ key: "plan", label: `${CHART_LINE_NAMES.plan} to ${input.planUtr}` });
  if (input.estimate) items.push({ key: "estimate", label: `${CHART_LINE_NAMES.estimate} (no plan UTR set)` });
  return items;
}
