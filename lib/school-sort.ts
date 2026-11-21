// Sort modes for the Schools table — layered on top of whatever order the
// parent SchoolsBrowser's `ranked` list already provides (that stays the
// single source of base sort/filter state; see seeded-schools-browser.tsx's
// file banner). These modes need the real fit-band math
// (classifySchoolFit), so they're owned here instead of in the parent.
import type { SchoolLite } from "@/lib/types";
import { classifySchoolFit, fitBasis, type SchoolFitBand } from "@/lib/school-fit";

export type SeededSchoolSort = "default" | "gap" | "fit" | "academics";

export const SEEDED_SORT_LABEL: Record<SeededSchoolSort, string> = {
  default: "Default",
  gap: "Gap (closest first)",
  fit: "Fit (band order)",
  academics: "Academics",
};

// Likely first, then Target, then Reach, then Out-of-range last — the same
// order the fit bands read best-to-worst everywhere else in the app.
const FIT_BAND_ORDER: Record<SchoolFitBand, number> = {
  likely: 0,
  target: 1,
  reach: 2,
  "out-of-range": 3,
};

/**
 * Distance from `utr` to whichever real boundary actually decides this
 * school's band right now — the team floor below it, the team median
 * otherwise. Always >= 0; smaller means "closer to moving up a band."
 */
export function gapToRelevantBoundary(
  utr: number,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">
): number {
  if (utr >= school.avgRosterUTR) return utr - school.avgRosterUTR;
  if (utr >= school.minCompetitiveUTR) return school.avgRosterUTR - utr;
  return school.minCompetitiveUTR - utr;
}

/**
 * Re-sorts an already-filtered school list for one of the three Seeded-only
 * modes. "default" returns the input array unchanged (the base order the
 * parent already computed). Stable with respect to the input order for
 * ties (Array.prototype.sort is stable in every engine this app ships to).
 *
 * `bandFor` is the fit report's band for a school (report.bandBySlug) —
 * /schools passes it so "Fit (band order)" orders by the very chips on the
 * rows, which plan with the capped pace (lib/fit.ts). It used to classify
 * again here on today's rating with an uncapped trend, so the order could
 * disagree with the chips. Without it, a below-floor school is a Reach.
 */
export function sortSchoolsForSeeded<T extends SchoolLite>(
  schools: T[],
  sort: SeededSchoolSort,
  utr: number,
  bandFor?: (school: T) => SchoolFitBand | null
): T[] {
  if (sort === "default") return schools;

  const withMeta = schools.map((school) => ({
    school,
    gap: gapToRelevantBoundary(utr, school),
    band: bandFor?.(school) ?? classifySchoolFit(fitBasis(utr), school),
  }));

  if (sort === "gap") {
    withMeta.sort((a, b) => a.gap - b.gap);
  } else if (sort === "fit") {
    withMeta.sort(
      (a, b) => FIT_BAND_ORDER[a.band] - FIT_BAND_ORDER[b.band] || a.gap - b.gap
    );
  } else {
    withMeta.sort((a, b) => a.school.usNewsRanking - b.school.usNewsRanking);
  }

  return withMeta.map((row) => row.school);
}
