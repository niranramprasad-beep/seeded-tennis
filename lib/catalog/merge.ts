// The spreadsheet sync (Herdy's 2026-11-21 action item): one school catalog
// built from the legacy TypeScript list AND the owner's sheet, imported into
// programs / team_ranges / program_details (migrations 048, 053).
//
// Before this, /schools banded every school on the legacy list's UNVERIFIED
// estimates and showed the sheet's real numbers in a separate preview section
// with no band — and for the 22 teams on both, it hid the real numbers and
// showed the estimate. Measured 2026-11-22: UNC women's estimate was
// 10.9/12.1, the sheet's quartile range 9.77/10.43; Vanderbilt men 11.4/12.6
// vs 12.94/13.34. Players were being banded against the wrong numbers.
//
// Rules, each tested in merge.test.ts:
//   1. Only a program bandableTeamRange() accepts (current, sourced, valid,
//      not stale) changes anything. An unrated program stays out of the
//      catalog and out of every band; the preview section still lists it.
//   2. A legacy school that is the same team (legacyMatchFor) keeps its slug,
//      name, location and US News rank — saved targets keep working — and
//      takes the sheet's floor and middle, with `utrRange` carrying the source.
//   3. Any other rated program joins the catalog under its own slug, with
//      the location from Program Info or null ("Not tracked"), and no US
//      News rank (null: the sheet has none, and none is invented).
//   4. Nothing is guessed: the floor is the range's low (lower quartile) and
//      the middle its middle (median), exactly as bandableRange() hands
//      classifySchoolFit — one fit-band path.

import type { Division, School } from "@/lib/types";
import { legacyMatchFor } from "./legacy-match";
import { bandableTeamRange, RANGE_SOURCE_TYPE_LABEL, type ImportedProgram, type TeamRange } from "./programs";

/** Presentation only, never shown as a fact about a school: no component
 * reads these today (2026-11-22), and they keep the School shape whole. */
const NEUTRAL_COLORS = { primaryColor: "#4B5563", secondaryColor: "#E5E7EB", textColor: "#FFFFFF" } as const;

const CATALOG_DIVISIONS: readonly Division[] = ["D1", "D2", "D3"];

/** "University of Alabama" -> "Alabama", "Auburn University" -> "Auburn",
 * "University of Texas (Austin)" -> "Texas". A shortening of the school's
 * own name, never a nickname. */
export function shortSchoolName(name: string): string {
  const s = name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^University of\s+/i, "")
    .replace(/\s+University$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return s || name;
}

function utrRangeOf(range: TeamRange): NonNullable<School["utrRange"]> {
  return {
    low: range.low,
    middle: range.middle,
    high: range.high,
    source: `${RANGE_SOURCE_TYPE_LABEL[range.sourceType]}: ${range.source}`,
    sourceUrl: range.sourceUrl,
    sourceDate: range.sourceDate,
  };
}

function detailsOf(p: ImportedProgram): School["details"] {
  if (!p.details) return undefined;
  const { city: _city, state: _state, ...rest } = p.details;
  return rest;
}

export interface MergeResult {
  schools: School[];
  /** Imported slugs now in `schools` (merged into a legacy row or added). */
  mergedProgramSlugs: Set<string>;
}

export function mergeCatalog(legacy: readonly School[], imported: readonly ImportedProgram[], now: Date): MergeResult {
  const bySlug = new Map(legacy.map((s) => [s.slug, { ...s }]));
  const added: School[] = [];
  const merged = new Set<string>();

  for (const p of imported) {
    const range = bandableTeamRange(p, now);
    if (!range) continue; // rule 1
    const match = legacyMatchFor(p, legacy);
    if (match) {
      // rule 2
      const row = bySlug.get(match.slug)!;
      row.minCompetitiveUTR = range.low;
      row.avgRosterUTR = range.middle;
      row.utrRange = utrRangeOf(range);
      row.details = detailsOf(p) ?? row.details;
      row.rosterUrl = p.rosterUrl;
      merged.add(p.slug);
      continue;
    }
    if (!CATALOG_DIVISIONS.includes(p.division as Division)) continue;
    if (bySlug.has(p.slug)) continue; // a slug clash would shadow a legacy page; never expected
    // rule 3
    added.push({
      id: p.slug,
      slug: p.slug,
      name: p.school,
      shortName: shortSchoolName(p.school),
      city: p.details?.city ?? null,
      state: p.details?.state ?? null,
      conference: p.conference,
      division: p.division as Division,
      gender: p.gender,
      ...NEUTRAL_COLORS,
      avgRosterUTR: range.middle,
      minCompetitiveUTR: range.low,
      usNewsRanking: null,
      utrRange: utrRangeOf(range),
      details: detailsOf(p),
      rosterUrl: p.rosterUrl,
    });
    merged.add(p.slug);
  }

  return { schools: [...legacy.map((s) => bySlug.get(s.slug)!), ...added], mergedProgramSlugs: merged };
}
