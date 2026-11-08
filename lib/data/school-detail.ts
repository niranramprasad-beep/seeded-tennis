import type { School } from "@/lib/types";

// getSchoolProfile() (roster, recent matches, standings, recruiting classes,
// coach bio, campus stats) used to synthesize all of this deterministically
// per school.slug rather than sourcing it for real — removed per the Seeded
// redesign's "never show made-up data" rule. The school detail pages now show
// EmptyState for all of it until Phase 4 (SchoolProfile.dc.html) wires up a
// real data source. combinedScore is kept — it's a real formula over real
// fields (US News ranking + average roster UTR), used across the schools
// list/browser pages, not fabricated per-school content.

// Blend of academics (US News) and tennis level (avg roster UTR), 0-100.
// Exported for the leaderboard's "combined score" sort. 14.5 ≈ the strongest
// college roster average on the real UTR scale, so it anchors the tennis axis.
export function combinedScore(school: School): number {
  const academic = Math.max(0, 100 - school.usNewsRanking * 0.62);
  const tennis = Math.min(100, (school.avgRosterUTR / 14.5) * 100);
  return Math.round(academic * 0.5 + tennis * 0.5);
}
