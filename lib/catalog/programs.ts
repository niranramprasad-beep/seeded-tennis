// Imported programs (migration 048): the shape the UI reads, and the rules
// for what may be said about them. Pure; the loader is lib/db/programs.ts.
//
// Three rules, each enforced here so no component has to remember them:
//
// 1. A program with no usable team range has NO level. It reads "Level not
//    rated yet" and bandableRange() returns null, so it can never be handed
//    to classifySchoolFit — never Target, never Likely, never a band at all.
//    (CLAUDE.md: "Never pass undefined as the projection"; the same spirit
//    applies to the school side: no invented floor, no invented middle.)
// 2. A range is shown only with its source and date, and a range older than
//    RANGE_STALE_AFTER_DAYS is shown greyed and kept out of bands
//    (DATA_QUALITY.md: stale = show, don't compute).
// 3. The final-year count always carries the roster season it came from and
//    the date the roster was read. A 2025-26 roster says so plainly — its
//    final-year players have already finished.

import type { SchoolLite } from "@/lib/types";
import { currentSeasonStartYear, finalYearClass } from "./class-year";
import type { CatalogDivision, CatalogGender } from "./roster-import";

export type RangeSourceType = "licensed_feed" | "coach_submitted" | "hand_curated";

export const RANGE_SOURCE_TYPES: readonly RangeSourceType[] = ["licensed_feed", "coach_submitted", "hand_curated"];

export const RANGE_SOURCE_TYPE_LABEL: Record<RangeSourceType, string> = {
  licensed_feed: "Licensed data feed",
  coach_submitted: "Submitted by the program's coach",
  hand_curated: "Hand-curated from public sources",
};

/** CATALOG_EXPANSION.md: "A range older than about 12 months shows as stale." */
export const RANGE_STALE_AFTER_DAYS = 365;

export const LEVEL_NOT_RATED = "Level not rated yet";

export interface TeamRange {
  low: number;
  middle: number;
  high: number;
  sourceType: RangeSourceType;
  source: string;
  sourceUrl: string | null;
  /** yyyy-mm-dd */
  sourceDate: string;
  /** ISO timestamp, tie-break between two ranges with the same sourceDate. */
  createdAt: string;
}

export interface ImportedProgram {
  id: string;
  slug: string;
  school: string;
  gender: CatalogGender;
  division: CatalogDivision;
  conference: string;
  rosterUrl: string | null;
  seasonShown: string;
  seasonStartYear: number;
  playersListed: number;
  unknownClassCount: number;
  /** yyyy-mm-dd the roster was read. */
  sourceDate: string;
  sourceUrl: string | null;
  classCounts: { classYear: number; players: number }[];
  /** Every range on record, any order. currentRange() picks. */
  ranges: TeamRange[];
}

/* ---------------------------------------------------------------- dates */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-19" -> "Nov 19, 2026". String parts only: no Date, no time
 * zone, so New York and Auckland print the same day. */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** Whole days from a yyyy-mm-dd date to a local "today". UTC arithmetic on
 * the calendar parts only, so DST and the machine's zone cannot move it. */
export function daysSince(iso: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return Number.POSITIVE_INFINITY;
  const then = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - then) / 86_400_000);
}

/* --------------------------------------------------------------- ranges */

/** The newest range on record (by its source date, then entry time). */
export function currentRange(program: Pick<ImportedProgram, "ranges">): TeamRange | null {
  if (program.ranges.length === 0) return null;
  return [...program.ranges].sort(
    (a, b) => b.sourceDate.localeCompare(a.sourceDate) || b.createdAt.localeCompare(a.createdAt)
  )[0];
}

export function rangeIsStale(range: TeamRange, now: Date): boolean {
  return daysSince(range.sourceDate, now) > RANGE_STALE_AFTER_DAYS;
}

function validRange(r: TeamRange): boolean {
  return (
    [r.low, r.middle, r.high].every((v) => Number.isFinite(v) && v >= 1 && v <= 16.5) &&
    r.low <= r.middle &&
    r.middle <= r.high &&
    r.source.trim().length >= 3 &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.sourceDate)
  );
}

/**
 * THE GATE. The only way an imported program reaches fit math. Returns the
 * two reference points classifySchoolFit reads, from a current, sourced,
 * non-stale range — or null, and the caller must leave the program out of
 * every band and every count.
 */
export function bandableRange(
  program: Pick<ImportedProgram, "ranges">,
  now: Date
): Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR"> | null {
  const range = currentRange(program);
  if (!range || !validRange(range) || rangeIsStale(range, now)) return null;
  return { minCompetitiveUTR: range.low, avgRosterUTR: range.middle };
}

function utr(v: number): string {
  return v.toFixed(2);
}

export interface RangeDisplay {
  /** "Level not rated yet", or "Team UTR 5.50–7.20 · middle 6.40". */
  headline: string;
  /** "Hand-curated from public sources: <source>, Nov 19, 2026" or null. */
  sourceLine: string | null;
  sourceUrl: string | null;
  stale: boolean;
  rated: boolean;
}

export function rangeDisplay(program: Pick<ImportedProgram, "ranges">, now: Date): RangeDisplay {
  const range = currentRange(program);
  if (!range || !validRange(range)) {
    return { headline: LEVEL_NOT_RATED, sourceLine: null, sourceUrl: null, stale: false, rated: false };
  }
  const stale = rangeIsStale(range, now);
  return {
    headline: `Team UTR ${utr(range.low)}–${utr(range.high)} · middle ${utr(range.middle)}`,
    sourceLine:
      `${RANGE_SOURCE_TYPE_LABEL[range.sourceType]}: ${range.source}, ${formatIsoDate(range.sourceDate)}` +
      (stale ? " — over a year old, so not used for fit" : ""),
    sourceUrl: range.sourceUrl,
    stale,
    rated: !stale,
  };
}

/* ---------------------------------------------------------- final year */

export function finalYearCountFor(program: Pick<ImportedProgram, "classCounts" | "seasonStartYear">): number {
  const finalClass = finalYearClass(program.seasonStartYear);
  return program.classCounts.find((c) => c.classYear === finalClass)?.players ?? 0;
}

/** True when the roster is from an earlier season than the one under way. */
export function rosterIsFromEarlierSeason(program: Pick<ImportedProgram, "seasonStartYear">, now: Date): boolean {
  return program.seasonStartYear < currentSeasonStartYear(now);
}

export interface FinalYearDisplay {
  /** "4 seniors on the 2025-26 roster, checked Nov 19, 2026" or "Not tracked". */
  text: string;
  /** Extra plain-language caveats (earlier season, unreadable class labels). */
  notes: string[];
  tracked: boolean;
}

/**
 * The final-year line. "Seniors" here means every player in their final
 * season on that roster — seniors, graduate students and 5th-years — which
 * the /schools section's intro says. Never "open spots", never a forecast.
 */
export function finalYearDisplay(program: ImportedProgram, now: Date): FinalYearDisplay {
  if (program.playersListed === 0) {
    return { text: "Not tracked", notes: ["The roster listed no players when it was read."], tracked: false };
  }
  const n = finalYearCountFor(program);
  const who = n === 1 ? "senior" : "seniors";
  const text = `${n} ${who} on the ${program.seasonShown} roster, checked ${formatIsoDate(program.sourceDate)}`;
  const notes: string[] = [];
  if (rosterIsFromEarlierSeason(program, now)) {
    notes.push(
      `This is the ${program.seasonShown} roster, not the current season's. Its seniors have already finished.`
    );
  }
  if (program.unknownClassCount > 0) {
    const k = program.unknownClassCount;
    notes.push(
      `${k} of ${program.playersListed} listed player${program.playersListed === 1 ? "" : "s"} had a class year we could not read, so the count may be low.`
    );
  }
  return { text, notes, tracked: true };
}
