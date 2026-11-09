// Seeded-only sort modes for the Schools table — layered on top of
// whatever order the parent SchoolsBrowser's existing `ranked` list already
// provides (that mechanism stays the single source of base sort/filter
// state, shared with Legacy; see seeded-schools-browser.tsx's file banner).
// These three new modes are Seeded-exclusive because they need the real
// fit-band math (classifySchoolFit) Legacy's UI has no use for, so they're
// owned here instead of pushed up into the shared parent.
import type { SchoolLite } from "@/lib/types";
import {
  classifySchoolFit,
  type SchoolFitBand,
  type SchoolFitProjectionInput,
} from "@/lib/school-fit";

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
 */
export function sortSchoolsForSeeded<T extends SchoolLite>(
  schools: T[],
  sort: SeededSchoolSort,
  utr: number,
  projection?: SchoolFitProjectionInput
): T[] {
  if (sort === "default") return schools;

  const withMeta = schools.map((school) => ({
    school,
    gap: gapToRelevantBoundary(utr, school),
    band: classifySchoolFit(utr, school, projection),
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
