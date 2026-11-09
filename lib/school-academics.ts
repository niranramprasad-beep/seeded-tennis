// A real bucketing of the School catalog's actual `usNewsRanking` field —
// used for the Schools table's "Acad." column and the filter sidebar's
// "Academics" select. Not fabricated: every school already carries a real
// usNewsRanking (see lib/data/schools*.ts); this just labels the tier.
export type AcademicTier = "top25" | "top50" | "top100" | "unranked";

export const ACADEMIC_TIER_LABEL: Record<AcademicTier, string> = {
  top25: "Top 25",
  top50: "Top 50",
  top100: "Top 100",
  unranked: "150+",
};

export function academicTier(usNewsRanking: number): AcademicTier {
  if (usNewsRanking <= 25) return "top25";
  if (usNewsRanking <= 50) return "top50";
  if (usNewsRanking <= 100) return "top100";
  return "unranked";
}
