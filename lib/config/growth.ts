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

/** The grade recruiting is modelled as happening in. Junior year = the grade
 * before senior, i.e. graduation year − 2. The NCAA's D1 contact period opens
 * June 15 after sophomore year and off-campus contact August 1 of junior
 * year (lib/config/recruiting.ts), so junior year is when a player's rating
 * is the one coaches are actually looking at. */
export const RECRUITING_GRADE = 11;

/** Shown wherever a projected number appears. Short enough to sit in a chip. */
export const GROWTH_ESTIMATE_CHIP = "Estimate";

/** The assumption itself, in words, for the caption under a projection. */
export function growthAssumptionLabel(pace: GrowthPace): string {
  const perYear = UTR_GROWTH_PER_YEAR[pace];
  const name = pace === "normal" ? "typical" : pace;
  return `Assumes ${name} growth of ${perYear.toFixed(1)} UTR per year.`;
}

/** The sentence the brief asks for, verbatim, in one place so every screen
 * says it the same way. */
export const RECRUITING_TIMING_NOTE =
  "Recruiting usually happens junior year — this shows where you're headed, not just where you are.";

/** Why the number is an estimate, said plainly. Used under the projection on
 * the fit report. */
export const GROWTH_ESTIMATE_CAPTION =
  "Seeded has no growth data for junior players yet, so this is an assumption, not a forecast.";
