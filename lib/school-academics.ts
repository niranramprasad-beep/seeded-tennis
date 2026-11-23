// A bucketing of the School catalog's `usNewsRanking` field — used for the
// Schools table's "Acad." column and the filter sidebar's "Academics"
// select. docs/DATA_QUALITY.md rates the field PARTIALLY RELIABLE: it is a
// U.S. News rank entered by hand with no edition year recorded. So every
// place that prints the number says that, via ACADEMIC_RANK_SOURCE_LABEL.
export type AcademicTier = "top25" | "top50" | "top100" | "unranked" | "notTracked";

export const ACADEMIC_TIER_LABEL: Record<AcademicTier, string> = {
  top25: "Top 25",
  top50: "Top 50",
  top100: "Top 100",
  // Was "150+", printed for any rank over 100 — a school ranked 120 read as
  // "150+". The tier boundary is 100, so the label is too.
  unranked: "Over 100",
  // A program from the owner's sheet: the catalogue has no US News rank for
  // it, and none is invented (2026-11-22).
  notTracked: "Not tracked",
};

export function academicTier(usNewsRanking: number | null): AcademicTier {
  if (usNewsRanking === null) return "notTracked";
  if (usNewsRanking <= 25) return "top25";
  if (usNewsRanking <= 50) return "top50";
  if (usNewsRanking <= 100) return "top100";
  return "unranked";
}

/** Next to any printed academic rank. The catalogue records the number but
 * not which U.S. News edition (or list) it came from. */
export const ACADEMIC_RANK_SOURCE_LABEL = "U.S. News academic rank, as entered in our catalogue";

/** "U.S. News academic rank #18." — the one sentence for the school page.
 *
 * It used to end "(as entered in our catalogue; edition year not
 * recorded)". Design system v2, rule 4 (Niran, 2026-11-16): "edition year
 * not recorded" -> say nothing. The number still says whose rank it is;
 * /methodology carries the caveat about the catalogue. */
export function academicRankSentence(usNewsRanking: number | null): string {
  if (usNewsRanking === null) return "U.S. News academic rank: not tracked.";
  return `U.S. News academic rank #${usNewsRanking}.`;
}
