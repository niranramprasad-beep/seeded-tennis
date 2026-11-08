// Buckets a school into a Reach/Target/Likely fit band for a given player
// UTR — the one place this math happens (see lib/time.ts for the equivalent
// pattern around grade math). Shared by the homepage's live fit-calculator
// preview and the onboarding fit report; both should always agree.
//
// Each school only carries two real UTR fields: `minCompetitiveUTR` (the
// floor you need to be rosterable — confirmed via lib/data/schools*.ts to
// sit ~1.1–1.3 below `avgRosterUTR` across the whole catalog) and
// `avgRosterUTR` (the team average). There's no stored min/max range, so:
//   - Reach:  below the floor. You're not yet competitive for this roster.
//   - Target: at or above the floor, but at or below the team average.
//     You'd be rosterable, not a clear standout.
//   - Likely: above the team average. Comfortably ahead of the pack.
import type { SchoolLite } from "@/lib/types";
import type { FitBand } from "@/components/seeded/ui/fit-badge";

export function classifySchoolFit(
  playerUtr: number,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">
): Exclude<FitBand, "out-of-range" | "unverified"> {
  if (playerUtr < school.minCompetitiveUTR) return "reach";
  if (playerUtr < school.avgRosterUTR) return "target";
  return "likely";
}

export interface FitCounts {
  reach: number;
  target: number;
  likely: number;
}

export function countSchoolFits(
  playerUtr: number,
  schools: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">[]
): FitCounts {
  const counts: FitCounts = { reach: 0, target: 0, likely: 0 };
  for (const school of schools) {
    counts[classifySchoolFit(playerUtr, school)]++;
  }
  return counts;
}

/** The displayed "team range" for a RangeBar row — derived from the same two
 * real fields, mirroring the gap below the average to above it (there's no
 * stored upper bound, so this is the most defensible symmetric estimate
 * from data we actually have, not an invented constant). */
export function schoolUtrRange(
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">
): { min: number; max: number } {
  const spread = school.avgRosterUTR - school.minCompetitiveUTR;
  return { min: school.minCompetitiveUTR, max: school.avgRosterUTR + spread };
}

// Fixed reference scale so every RangeBar on a page is visually comparable
// to every other one (not auto-scaled per row) — covers the full catalog's
// real range (~8.1–14.3) with margin on both ends.
export const SCHOOL_UTR_SCALE = { min: 6, max: 15 };

export function utrToPct(utr: number): number {
  const { min, max } = SCHOOL_UTR_SCALE;
  return Math.min(100, Math.max(0, ((utr - min) / (max - min)) * 100));
}
