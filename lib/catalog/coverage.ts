// "How many Target/Likely programs would a sample player see?" for the
// phase-1 import report. Bands come from countBands() in lib/fit.ts — the
// one fit path — and imported programs reach it ONLY through
// bandableRange(), so an unrated program is never counted in any band.
//
// The sample players are a plain rating with no history (today's rating,
// no projection) — the question is "what does the catalog hold at this
// level", not "where is this player headed".

import { countBands } from "@/lib/fit";
import type { SchoolLite } from "@/lib/types";
import { bandableRange, type ImportedProgram } from "./programs";

const COVERAGE_SAMPLE_UTRS = [5, 7, 9] as const;
const COVERAGE_GENDERS = ["men", "women"] as const;

export interface CoverageRow {
  utr: number;
  gender: "men" | "women";
  /** Imported programs of this gender with a current, sourced range. */
  ratedPrograms: number;
  /** Imported programs of this gender with no usable range (excluded). */
  unratedPrograms: number;
  target: number;
  likely: number;
}

export function coverageTable(
  programs: Pick<ImportedProgram, "gender" | "ranges">[],
  now: Date,
  utrs: readonly number[] = COVERAGE_SAMPLE_UTRS
): CoverageRow[] {
  const rows: CoverageRow[] = [];
  for (const gender of COVERAGE_GENDERS) {
    const ofGender = programs.filter((p) => p.gender === gender);
    const bandable = ofGender
      .map((p) => bandableRange(p, now))
      .filter((r): r is Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR"> => r !== null);
    for (const utr of utrs) {
      const counts = countBands(bandable, utr);
      rows.push({
        utr,
        gender,
        ratedPrograms: bandable.length,
        unratedPrograms: ofGender.length - bandable.length,
        target: counts.target,
        likely: counts.likely,
      });
    }
  }
  return rows;
}

/** Same question for the existing 68-program TypeScript catalog, whose
 * ranges are all "Unverified estimate" (UTR_RANGE_SOURCE_LABEL). Shown
 * beside the imported numbers for context, labelled as such. */
export function legacyCoverageTable(
  schools: Pick<SchoolLite, "gender" | "minCompetitiveUTR" | "avgRosterUTR">[],
  utrs: readonly number[] = COVERAGE_SAMPLE_UTRS
): { utr: number; gender: "men" | "women"; programs: number; target: number; likely: number }[] {
  const rows = [];
  for (const gender of COVERAGE_GENDERS) {
    const ofGender = schools.filter((s) => s.gender === gender);
    for (const utr of utrs) {
      const counts = countBands(ofGender, utr);
      rows.push({ utr, gender, programs: ofGender.length, target: counts.target, likely: counts.likely });
    }
  }
  return rows;
}
