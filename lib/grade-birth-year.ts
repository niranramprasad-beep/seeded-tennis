// Which birth years are realistic for a US grade in school — the profile
// forms (sign-up, Google sign-up, the /onboarding diagnostic) offer only
// these once a grade or class year is picked (web developer's review,
// 2026-11-22: "picking a grade filters the birth-year options").
//
// THE RULE. In the fall of the school year that starts in year Y, a student
// in grade G is typically G+5 or G+6 years old (kindergarten at 5, 1st grade
// at 6, … 12th grade at 17 or 18). So they were born in Y-G-6 .. Y-G-5.
// One year either side is still allowed — held back or red-shirted, an early
// starter, a late birthday, a reclassified athlete — so the offered range is
// Y-G-7 .. Y-G-4: four years.
//
// In class-year terms (a 12th grader in the school year starting Y graduates
// in June of Y+1 = gradYear): typical gradYear-19 .. gradYear-18, offered
// gradYear-20 .. gradYear-17.
//
// The school year comes from lib/time.ts (rolls over on August 1), and the
// grade → class year conversion is lib/time.ts's too; nothing here reads a
// clock of its own. lib/grade-birth-year.test.ts pins the rule.
//
// A birth year is WRITE-ONCE from the client (migrations 033/041) and it is
// what the under-13 consent rule runs on (lib/config/consent.ts), so a real
// year outside the range must still be enterable: every form that filters
// also offers "Show all years". Filtering is a convenience, never a gate.

import { getGradYearFromGrade } from "@/lib/time";

/** Years either side of the typical two-year window that are still offered. */
export const BIRTH_YEAR_SLACK_YEARS = 1;

export interface BirthYearRange {
  /** Oldest birth year offered (inclusive). */
  earliest: number;
  /** Newest birth year offered (inclusive). */
  latest: number;
}

/** The typical two birth years for a class (graduation) year, no slack:
 * a senior is 17 or 18 in the fall before graduating in June of gradYear. */
export function typicalBirthYearsForGradYear(gradYear: number): BirthYearRange {
  return { earliest: gradYear - 19, latest: gradYear - 18 };
}

/** The birth years offered for a class year: typical, one year either side. */
export function birthYearRangeForGradYear(gradYear: number): BirthYearRange {
  const typical = typicalBirthYearsForGradYear(gradYear);
  return {
    earliest: typical.earliest - BIRTH_YEAR_SLACK_YEARS,
    latest: typical.latest + BIRTH_YEAR_SLACK_YEARS,
  };
}

/** The birth years offered for `grade` in the school year in progress on
 * `now` (lib/time.ts decides which school year that is). */
export function birthYearRangeForGrade(grade: number, now: Date = new Date()): BirthYearRange {
  return birthYearRangeForGradYear(getGradYearFromGrade(grade, now));
}

export function isInBirthYearRange(birthYear: number, range: BirthYearRange): boolean {
  return birthYear >= range.earliest && birthYear <= range.latest;
}

/**
 * The years a birth-year <select> shows, newest first (like every other
 * birth-year list in the app).
 *
 * - No range (no grade picked yet, or a parent's own birth year): `all`.
 * - "Show all years" chosen: `all`.
 * - Otherwise: the range, limited to years `all` itself offers (so the
 *   filter can never offer a future year or one the form would refuse).
 */
export function birthYearChoices(
  all: readonly number[],
  range: BirthYearRange | null,
  showAll: boolean
): number[] {
  if (range == null || showAll) return [...all];
  return all.filter((y) => isInBirthYearRange(y, range));
}

/**
 * What happens to a birth year already picked when the grade (or class
 * year) changes. Chosen behaviour: CLEAR IT AND SAY SO — never silently
 * swap in a different year, and never leave a year the list no longer
 * shows sitting in the <select>.
 *
 * Kept as is when there is nothing to check (no year, no range), when it
 * fits the new range, or when the person chose "Show all years" (they
 * picked an unusual year on purpose; the gentle hint in
 * lib/signup-checks.ts covers that case).
 */
export function reconcileBirthYear(
  birthYear: number | null,
  range: BirthYearRange | null,
  showAll: boolean,
  gradeLabel: string
): { birthYear: number | null; notice: string | null } {
  if (birthYear == null || range == null || showAll || isInBirthYearRange(birthYear, range)) {
    return { birthYear, notice: null };
  }
  return { birthYear: null, notice: birthYearClearedNotice(birthYear, gradeLabel) };
}

/** The short message shown when a picked year was cleared. */
export function birthYearClearedNotice(birthYear: number, gradeLabel: string): string {
  return `${birthYear} isn't a usual birth year for ${gradeLabel}, so we cleared it. Pick the year again, or show all years.`;
}

/**
 * Settings → Profile: the birth year is already SAVED and cannot change
 * (write-once), so a class year outside its range is KEPT with a message,
 * never cleared and never blocked — the class year is the field they can
 * fix, and an unusual pair can be right. Null when they agree, or when
 * there is no birth year on file.
 */
export function savedBirthYearClassYearHint(
  birthYear: number | null | undefined,
  gradYear: number
): string | null {
  if (birthYear == null || !Number.isInteger(birthYear)) return null;
  if (isInBirthYearRange(birthYear, birthYearRangeForGradYear(gradYear))) return null;
  return `The class of ${gradYear} is unusual for someone born in ${birthYear}. Check the grad year. If it's right, save anyway.`;
}

/** The label on the control that lifts the filter. */
export const SHOW_ALL_BIRTH_YEARS_LABEL = "Show all years";
