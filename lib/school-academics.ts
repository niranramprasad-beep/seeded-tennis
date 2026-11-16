// A bucketing of the School catalog's `usNewsRanking` field — used for the
// Schools table's "Acad." column and the filter sidebar's "Academics"
// select. docs/DATA_QUALITY.md rates the field PARTIALLY RELIABLE: it is a
// U.S. News rank entered by hand with no edition year recorded. So every
// place that prints the number says that, via ACADEMIC_RANK_SOURCE_LABEL.
export type AcademicTier = "top25" | "top50" | "top100" | "unranked";

export const ACADEMIC_TIER_LABEL: Record<AcademicTier, string> = {
  top25: "Top 25",
  top50: "Top 50",
  top100: "Top 100",
  // Was "150+", printed for any rank over 100 — a school ranked 120 read as
  // "150+". The tier boundary is 100, so the label is too.
  unranked: "Over 100",
};

export function academicTier(usNewsRanking: number): AcademicTier {
  if (usNewsRanking <= 25) return "top25";
  if (usNewsRanking <= 50) return "top50";
  if (usNewsRanking <= 100) return "top100";
  return "unranked";
}

/** Next to any printed academic rank. The catalogue records the number but
 * not which U.S. News edition (or list) it came from. */
export const ACADEMIC_RANK_SOURCE_LABEL = "U.S. News rank as entered in our catalogue; edition year not recorded";

/** "U.S. News academic rank #18 (as entered in our catalogue; edition year
 * not recorded)." — the one sentence for the school page. */
export function academicRankSentence(usNewsRanking: number): string {
  return `U.S. News academic rank #${usNewsRanking} (as entered in our catalogue; edition year not recorded).`;
}
