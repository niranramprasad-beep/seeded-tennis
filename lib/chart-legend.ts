// ONE vocabulary for the two UTR charts (final-check A3, 2026-11-21).
//
// /today's "UTR vs plan" legend said "Green dashes: the estimate we plan
// with" while /plan's said "Dashed: your plan's checkpoints. Dotted: your
// estimate" — the same green dashes meant the estimate on one screen and the
// plan on the other. Both charts now draw each line the same way and name it
// the same way, here:
//
//   solid green          → Logged             (the UTRs the player entered)
//   dotted green         → Planning estimate  (the rating the bands use)
//   green dashes + gold  → Your plan          (checkpoints to the player's goal)
//   grey dashes          → Estimate at your own pace (never used for bands)
//
// The readout on /plan's chart uses the same names (plan-trajectory-values.ts).

export const CHART_LINE_NAMES = {
  logged: "Logged",
  estimate: "Planning estimate",
  plan: "Your plan",
  upside: "Estimate at your own pace",
} as const;

export interface ChartLegendInput {
  /** The dotted planning-estimate line is drawn. */
  estimate: boolean;
  /** Its end label ("8.7"), when the chart reaches the summer before senior
   *  year and prints one. */
  estimateEnd?: string | null;
  /** How the plan shows: the dashed line through its checkpoints (/plan),
   *  the gold marker at the next checkpoint (/today), or not at all. */
  plan: "line" | "next-checkpoint" | null;
  /** The grey own-pace line is drawn. */
  upside: boolean;
}

/** The legend sentence under either chart — only lines that are drawn. */
export function chartLegendSentence(input: ChartLegendInput): string {
  const parts = [`Solid: ${CHART_LINE_NAMES.logged}, the UTRs you entered.`];
  if (input.estimate) {
    parts.push(
      `Dotted: ${CHART_LINE_NAMES.estimate}, what your bands use${input.estimateEnd ? ` (${input.estimateEnd} by the summer before senior year)` : ""}.`
    );
  }
  if (input.plan === "line") parts.push(`Dashed, with gold diamonds: ${CHART_LINE_NAMES.plan}, the checkpoints to your goal.`);
  if (input.plan === "next-checkpoint") parts.push(`Gold line: ${CHART_LINE_NAMES.plan}, its next checkpoint.`);
  if (input.upside) parts.push(`Grey dashes: ${CHART_LINE_NAMES.upside}, never used for bands.`);
  return parts.join(" ");
}
