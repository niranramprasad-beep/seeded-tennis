// THE ONLY PLACE UTR GROWTH ASSUMPTIONS LIVE.
//
// ===========================================================================
// THESE ARE ASSUMPTIONS, NOT DATA.
// ===========================================================================
// Seeded has no longitudinal UTR dataset. Nobody here has measured how fast
// a population of junior players improves, and the numbers below are not
// derived from one. They are a stated, conservative guess, and every surface
// that shows a number computed from them must say so — which is what
// GROWTH_ASSUMPTION_LABEL and GROWTH_ESTIMATE_CAPTION are for, and why
// `lib/fit.ts` returns the assumption alongside every projection rather than
// letting a caller show the number alone.
//
// This matters more here than almost anywhere else in the product. A
// projected UTR is the number a 14-year-old and their parent will use to
// decide which programs to spend a season chasing. Presenting a guess as a
// forecast would be the same failure as the invented coach emails (P0-3),
// just in a shape that is harder to notice.
//
// WHERE THE RANGE COMES FROM. `REALISTIC_UTR_IMPROVEMENT_PER_YEAR` in
// lib/school-fit.ts has been the product's stated realistic band (0.5–1.5
// per year) since the methodology page was written, and the what-if slider,
// the pace warning and the pre-auth fit report all already use it. These
// three points sit on that band rather than inventing a second one: a
// product with two different ideas about how fast players improve would
// contradict itself between screens.
//
// WHEN THERE IS REAL DATA. Replace these with measured percentiles, change
// GROWTH_ASSUMPTION_LABEL to say what they were measured from, and delete
// the "assumption" wording from the UI in the same commit — the discipline
// CLAUDE.md sets for the copy-honesty guards. Do not quietly tighten the
// numbers and leave the caption saying "estimate"; and do not leave them
// loose while the caption claims data.

import { REALISTIC_UTR_IMPROVEMENT_PER_YEAR } from "@/lib/school-fit";

export type GrowthPace = "slow" | "normal" | "fast";

/**
 * UTR points gained per year, by pace.
 *
 * `slow` and `fast` are the ends of the product's existing realistic band.
 * `normal` is its midpoint — deliberately the midpoint and not a separate
 * guess, so there is one band and one arithmetic rule rather than three
 * opinions.
 */
export const UTR_GROWTH_PER_YEAR: Record<GrowthPace, number> = {
  slow: REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min,
  normal:
    (REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min + REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max) / 2,
  fast: REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max,
};

// The projection target used to be RECRUITING_GRADE = 11 (junior year).
// It is now the summer before senior year — see projectionTargetDate() in
// lib/fit.ts — so the fit report agrees with the homepage, the what-if
// slider and every pace read, which already used that milestone.

/** "1.0 UTR a year" — the default growth assumption, in words. */
export const DEFAULT_GROWTH_LABEL = `${UTR_GROWTH_PER_YEAR.normal.toFixed(1)} UTR a year`;

/**
 * The assumption itself, in words, for the caption under a projection:
 * "Uses our default assumption of 1.0 UTR a year."
 *
 * It said "Assumes typical growth of 1.0 UTR per year." until 2026-11-21:
 * "typical" reads as a measured population figure, and Seeded has none (see
 * the banner above). It is OUR default, and says so. lib/copy-honesty.test.ts
 * fails the build if "typical growth" / "typical pace" returns.
 */
export function growthAssumptionLabel(pace: GrowthPace): string {
  const perYear = UTR_GROWTH_PER_YEAR[pace];
  if (pace === "normal") return `Uses our default assumption of ${DEFAULT_GROWTH_LABEL}.`;
  return `Uses a ${pace} assumption of ${perYear.toFixed(1)} UTR a year.`;
}

/** The sentence the brief asks for, verbatim, in one place so every screen
 * says it the same way. */
export const RECRUITING_TIMING_NOTE =
  "Projected to the summer before senior year — where you're headed, not just where you are.";

/** Said wherever the projection is shown: the target is the summer before
 * senior year, and the strongest programs do not wait for it. */
export const EARLY_DECISION_NOTE = "Top D1 programs often decide earlier, during junior year.";

/** Why the number is an estimate, said plainly. Used under the projection on
 * the fit report. */
export const GROWTH_ESTIMATE_CAPTION =
  "Seeded has no growth data for junior players yet, so this is an assumption, not a forecast.";
