// The ONLY place grade/date math happens. Grade is never stored — it's
// always derived from graduationYear and today's date. Nothing scatters
// this math across components; import from here instead.

import { monthsBetween } from "@/lib/utils";
import {
  CONTACT_PERIOD_OPEN_DAY,
  CONTACT_PERIOD_OPEN_MONTH,
  CONTACT_PERIOD_OPENS_BEFORE_GRADE,
  DEFAULT_COMMIT_BEFORE_GRADE,
  DEFAULT_COMMIT_DAY,
  DEFAULT_COMMIT_MONTH,
  SCHOOL_YEAR_ROLLOVER_DAY,
  SCHOOL_YEAR_ROLLOVER_MONTH,
} from "@/lib/config/recruiting";

const SENIOR_GRADE = 12;
const GRADUATED_GRADE = SENIOR_GRADE + 1;
// "Summer before grade 13" means summer before college/freshman year — the
// calendar year a player graduating in gradYear actually starts college.
const COLLEGE_GRADE = GRADUATED_GRADE;

/** The ending year of the school year in progress on `date`.
 * The school year rolls over on August 1 — e.g. Sept 2026 is school year "2027". */
export function getCurrentSchoolYear(date: Date = new Date()): number {
  const rolloverMonthIndex = SCHOOL_YEAR_ROLLOVER_MONTH - 1; // JS months are 0-indexed
  const pastRollover =
    date.getMonth() > rolloverMonthIndex ||
    (date.getMonth() === rolloverMonthIndex && date.getDate() >= SCHOOL_YEAR_ROLLOVER_DAY);
  return pastRollover ? date.getFullYear() + 1 : date.getFullYear();
}

/** The grade a player graduating in `gradYear` is in right now.
 * 12 is senior year; 13+ means they've already graduated. */
export function getCurrentGrade(gradYear: number, date: Date = new Date()): number {
  const schoolYear = getCurrentSchoolYear(date);
  return SENIOR_GRADE - (gradYear - schoolYear);
}

/** True once a player's graduation year has fully passed. */
export function hasGraduated(gradYear: number, date: Date = new Date()): boolean {
  return getCurrentGrade(gradYear, date) >= GRADUATED_GRADE;
}

/** Inverse of getCurrentGrade — the graduation year implied by being in
 * `grade` on `date`. Used only to migrate legacy grade-only data; never
 * call this for anything else, since grade itself is never stored. */
export function getGradYearFromGrade(grade: number, date: Date = new Date()): number {
  return getCurrentSchoolYear(date) + (SENIOR_GRADE - grade);
}

/** The calendar year "the summer before grade N" falls in, for a player
 * graduating in gradYear. N = 13 means the summer before college. This is
 * the one shared formula behind roadmap checkpoints, the default commit
 * date, and the NCAA contact-open date. */
export function getSummerBeforeGradeYear(gradYear: number, grade: number): number {
  return gradYear - COLLEGE_GRADE + grade;
}

/** Months remaining until graduation (the school-year rollover of gradYear). Never negative. */
export function getMonthsUntilGraduation(gradYear: number, date: Date = new Date()): number {
  const rolloverMonthIndex = SCHOOL_YEAR_ROLLOVER_MONTH - 1;
  const graduationDate = new Date(gradYear, rolloverMonthIndex, SCHOOL_YEAR_ROLLOVER_DAY);
  return monthsBetween(date, graduationDate);
}

/** Default verbal-commitment target date: September 1 of senior year, as an ISO date string. */
export function getDefaultCommitDate(gradYear: number): string {
  const commitYear = getSummerBeforeGradeYear(gradYear, DEFAULT_COMMIT_BEFORE_GRADE);
  const month = String(DEFAULT_COMMIT_MONTH).padStart(2, "0");
  const day = String(DEFAULT_COMMIT_DAY).padStart(2, "0");
  return `${commitYear}-${month}-${day}`;
}

export type RecruitingPhase = "foundation" | "active-contact" | "commitment" | "graduated";

function getContactOpenDate(gradYear: number): Date {
  const openYear = getSummerBeforeGradeYear(gradYear, CONTACT_PERIOD_OPENS_BEFORE_GRADE);
  return new Date(openYear, CONTACT_PERIOD_OPEN_MONTH - 1, CONTACT_PERIOD_OPEN_DAY);
}

/** Where a player stands in the recruiting calendar right now. */
export function getRecruitingPhase(gradYear: number, date: Date = new Date()): RecruitingPhase {
  const grade = getCurrentGrade(gradYear, date);
  if (grade >= GRADUATED_GRADE) return "graduated";
  if (grade >= SENIOR_GRADE) return "commitment";
  if (date >= getContactOpenDate(gradYear)) return "active-contact";
  return "foundation";
}

/** "10th", "11th", etc. — the one place grade-ordinal formatting lives. */
export function ordinalGrade(grade: number): string {
  const map: Record<number, string> = { 9: "9th", 10: "10th", 11: "11th", 12: "12th" };
  return map[grade] ?? `${grade}th`;
}

/** Parses a plain "YYYY-MM-DD" string as local midnight. `new Date(isoDate)`
 * parses date-only strings as UTC midnight, which displays as the previous
 * day in any timezone behind UTC — this avoids that off-by-one. */
export function parseLocalDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00`);
}

/** The one date display format for the app: "Oct 3, 2026". Accepts a
 * plain date string, a full timestamp string, or a Date. */
export function formatDate(input: Date | string): string {
  const date =
    typeof input === "string"
      ? /^\d{4}-\d{2}-\d{2}$/.test(input)
        ? parseLocalDate(input)
        : new Date(input)
      : input;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Today's date (or `date`'s) as "YYYY-MM-DD" in the browser's local
 * timezone. `new Date().toISOString().slice(0, 10)` is the common mistake
 * here — toISOString() is always UTC, so in the evening in any US timezone
 * it silently returns tomorrow's date. */
export function localDateKey(date: Date = new Date()): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

/**
 * Resolves a player's graduationYear from a raw profile row, migrating
 * legacy rows that only stored `grade`. If `graduation_year` is present it
 * wins outright. Otherwise the grade is converted as of `created_at` (when
 * that grade was entered), falling back to now if even that is missing.
 * Never derives from "now" when a created_at is available — that would
 * silently misdate a grade entered a year or two ago.
 */
export function resolveGraduationYear(row: {
  graduation_year?: number | string | null;
  grade?: number | string | null;
  created_at?: string | null;
}): number | null {
  if (row.graduation_year != null) return Number(row.graduation_year);
  if (row.grade == null) return null;
  const enteredAt = row.created_at ? new Date(row.created_at) : new Date();
  return getGradYearFromGrade(Number(row.grade), enteredAt);
}
