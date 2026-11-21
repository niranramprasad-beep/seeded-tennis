// Where the summer before senior year stands on a given date, and the words
// for it. ONE helper, so every screen says the same tense (final-check B20,
// 2026-11-21): for the class of 2027 in November 2026 the onboarding result
// said "We'll measure you at summer 2026" (future tense, past date), the fit
// report said that summer "has started", and the school page said "has
// begun" while the same panel said "has already passed".
//
// Wording only. Which rating a band is judged on does not change here: from
// June 1 of that summer on it is today's rating (lib/fit/projection.ts,
// recruitingTimeUtr), whichever phase the words below name.
//
// The phases:
//   upcoming — before June 1 of the summer (projectionTargetDate / lib/school-fit
//              summerBeforeSeniorYear);
//   underway — June 1 up to the school-year rollover (August 1, the same
//              date lib/time uses to start the next school year);
//   passed   — from the rollover on: senior year has started.

import { SCHOOL_YEAR_ROLLOVER_DAY, SCHOOL_YEAR_ROLLOVER_MONTH } from "@/lib/config/recruiting";

export type SeniorSummerPhase = "upcoming" | "underway" | "passed";

/** The calendar year of the summer before senior year for a class year. */
export function seniorSummerYear(graduationYear: number): number {
  return graduationYear - 1;
}

/** Where that summer stands on `now`. `summerYear` is the summer's own
 * calendar year (graduation year − 1; RecruitingTimeUtr.year). */
export function seniorSummerPhase(summerYear: number, now: Date = new Date()): SeniorSummerPhase {
  const start = new Date(summerYear, 5, 1); // June 1, local
  const end = new Date(summerYear, SCHOOL_YEAR_ROLLOVER_MONTH - 1, SCHOOL_YEAR_ROLLOVER_DAY);
  if (now.getTime() < start.getTime()) return "upcoming";
  if (now.getTime() < end.getTime()) return "underway";
  return "passed";
}

/** "has started" / "has passed" — for a sentence about a summer that is no
 * longer ahead. "is ahead" for one that is (callers normally only ask once
 * it has begun). */
export function seniorSummerVerb(phase: SeniorSummerPhase): string {
  return phase === "upcoming" ? "is ahead" : phase === "underway" ? "has started" : "has passed";
}

/** The fit report's note once the projection is today's rating. */
export function seniorSummerTodayNote(summerYear: number, now: Date = new Date()): string {
  const phase = seniorSummerPhase(summerYear, now);
  if (phase === "upcoming") return "This is today's UTR.";
  return `The summer before senior year ${seniorSummerVerb(phase)}, so this is today's UTR.`;
}

/** The onboarding result's heading: future tense only while the summer is
 * ahead. `who` is "you" or "your player". */
export function seniorSummerMeasureSentence(who: string, summerYear: number, now: Date = new Date()): string {
  const phase = seniorSummerPhase(summerYear, now);
  const label = `summer ${summerYear}`;
  if (phase === "upcoming") return `We'll measure ${who} at ${label}, the summer before senior year.`;
  const Label = `Summer ${summerYear}`;
  return `${Label}, the summer before senior year, ${seniorSummerVerb(phase)}, so we measure ${who} at today's rating.`;
}
