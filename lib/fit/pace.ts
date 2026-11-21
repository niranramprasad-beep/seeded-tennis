// The fit engine — PACE. The planning pace cap (PLANNING_PACE_CAP_PER_YEAR), the
// player's own logged pace (loggedPaceFor / playerPacePerYear), the wording
// beside it, and the rating check they rest on (isUsableUtr).
//
// Moved verbatim from lib/fit.ts on 2026-11-21 (the fit.ts split; every
// declaration below is byte-identical to the original, which
// lib/fit-split-purity.test.ts checks). Import from "@/lib/fit", never from
// this file: lib/fit.ts is the engine's public entry point, and
// lib/fit/engine-files.ts lists the files the guard tests treat as
// "lib/fit.ts". "This module" and "here" in the comments below mean the fit
// engine as a whole.

import {
  localMonthsBetween,
  monthYearLabel,
  parseLocalDate,
  shiftLocalMonths,
  startOfLocalDay,
} from "@/lib/time";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { formatPacePerYear } from "@/lib/utils";
import { PLANNING_RULE_SENTENCE } from "@/lib/school-fit";

export { formatPacePerYear };

/* ==========================================================================
 * THE PLANNING PACE CAP
 * ==========================================================================
 * The fastest pace a band, a fit chip, "closest schools", a school page or
 * the onboarding result will ever assume: 1.5 UTR a year. A player whose own
 * logged pace is faster is PLANNED at this; their own pace is shown beside it
 * as an upside ("At your current pace you'd reach 9.40. We plan with 8.10
 * instead. We plan with at most 1.5 UTR a year. That's our planning rule,
 * not a measured average."), and never moves a band.
 *
 * WHY. A real player (men's 5.80, Class of 2029) jumped from 4.50 to 5.65 in
 * four months and then held. Carrying that jump forward put them at 9.40 by
 * the summer before senior year and flipped two programs to Target — while a
 * warning on the same screen said the pace was faster than most players
 * manage (owner's production audit, 2026-11-19). A short hot streak is the
 * least reliable thing in a junior's history, and a band is what a family
 * spends a season chasing. So bands take min(own pace, this).
 *
 * WHY 1.5. It is the top of REALISTIC_UTR_IMPROVEMENT_PER_YEAR — not a new
 * number. Typical growth (UTR_GROWTH_PER_YEAR) sits inside it, and
 * lib/pace-cap.test.ts fails if either ever exceeds it. Seeded has no data
 * on how fast juniors improve, so the screens state 1.5 as OUR PLANNING
 * RULE (PLANNING_RULE_SENTENCE), never as what "most players" manage — that
 * sentence was removed 2026-11-21 (A-008) and lib/copy-honesty.test.ts
 * fails the build if it returns.
 *
 * ONE CONSTANT. Every rule that projects a rating reads it: recruitingTimeUtr
 * (bands, the onboarding diagnostic), projectedUtrOn, projectionReachDate,
 * and the Reach / Out-of-range split (buildFitReport passes it to
 * classifySchoolFit). Mutation-tested: changing it or removing the min()
 * fails lib/pace-cap.test.ts and lib/fit-pace-shapes.test.ts.
 */
export const PLANNING_PACE_CAP_PER_YEAR = 1.5;

/** The pace a projection is carried at: the player's own, never above the
 * cap. A falling pace stays negative — the projection then holds at today. */
export function planningPacePerYear(ownPerYear: number): number {
  return Math.min(ownPerYear, PLANNING_PACE_CAP_PER_YEAR);
}

/** "We plan with at most 1.5 UTR a year. That's our planning rule, not a
 * measured average." — defined in lib/school-fit.ts (its next-band message
 * says it too), re-exported here beside the cap it states. */
export { PLANNING_RULE_SENTENCE };

/* --------------------------------------------------------- logged pace */

/**
 * WHICH LOGGED RATING SETS A PLAYER'S PACE.
 *
 * A pace needs two ratings far enough apart to mean something and recent
 * enough to still describe the player. The onboarding diagnostic asks for
 * "about 6 months ago" and "about a year ago" and saves them as utr_entries
 * at exactly those local dates, so the window is built around those two:
 *
 *   5 months ≤ age ≤ 13 months     the rating can set the pace
 *   9 months ≤ age ≤ 13 months     "about a year ago": the one closest to 12
 *   5 months ≤ age <  9 months     "about 6 months ago", used only when there
 *                                   is no year-ago rating: closest to 6
 *
 * Ages are LOCAL CALENDAR months, by day, both edges inclusive: on Nov 18
 * 2026 a rating dated Oct 18 2025 (13 months) or Jun 18 2026 (5 months)
 * counts; Oct 17 2025 and Jun 19 2026 do not. The month of slack either side
 * of 6 and 12 lets an answer saved at sign-up keep setting the pace for a
 * month afterwards; outside the window the player falls back to the
 * typical-growth assumption until they log again.
 *
 * Ties (two ratings equally close) go to the more recent one, and two on the
 * same day to the later row — utr_entries loads in recorded order, so that
 * is the one entered last.
 */
export const LOGGED_PACE_MIN_MONTHS = 5;

export const LOGGED_PACE_MAX_MONTHS = 13;

/** At or above this age (up to LOGGED_PACE_MAX_MONTHS) a rating is "about a
 * year ago"; below it, "about 6 months ago". The midpoint of 6 and 12. */
export const LOGGED_PACE_YEAR_AGO_FROM_MONTHS = 9;

const YEAR_AGO_TARGET_MONTHS = 12;

const SIX_MONTHS_TARGET_MONTHS = 6;

export interface LoggedPace {
  /** UTR per month: (today's rating − `from.utr`) / `months`. Negative when
   * the rating went down — the projection then holds at today's. */
  perMonth: number;
  /** `perMonth` × 12 — THE pace number every screen prints, through
   * formatPacePerYear ("+1.45 a year"). */
  perYear: number;
  /** The logged rating the pace is measured from. */
  from: UtrDataPoint;
  /** Local calendar months from `from.date` to today (localMonthsBetween). */
  months: number;
}

/**
 * The player's own pace from their logged history, or null when no REAL
 * rating falls in the window above. Synthetic points (lib/what-if-utr.ts
 * marks them) and ratings Postgres would refuse are never used.
 */
export function loggedPaceFor(input: {
  currentUtr: number;
  history?: readonly UtrDataPoint[] | null;
  now: Date;
}): LoggedPace | null {
  const { currentUtr, history, now } = input;
  if (!history?.length || !isUsableUtr(currentUtr)) return null;
  const dayOf = (monthsAgo: number) => startOfLocalDay(shiftLocalMonths(now, -monthsAgo)).getTime();
  const oldest = dayOf(LOGGED_PACE_MAX_MONTHS);
  const newest = dayOf(LOGGED_PACE_MIN_MONTHS);
  const yearAgoFrom = dayOf(LOGGED_PACE_YEAR_AGO_FROM_MONTHS);

  let year: { point: UtrDataPoint; months: number } | null = null;
  let six: { point: UtrDataPoint; months: number } | null = null;
  const closer = (months: number, best: { months: number } | null, target: number) =>
    // `<=`: history is oldest first, so a later point wins a tie.
    !best || Math.abs(months - target) <= Math.abs(best.months - target);

  for (const point of history) {
    if (point.synthetic || !isUsableUtr(point.utr) || !Number.isFinite(point.date?.getTime())) continue;
    const day = startOfLocalDay(point.date).getTime();
    if (day < oldest || day > newest) continue;
    const months = localMonthsBetween(point.date, now);
    if (day <= yearAgoFrom) {
      if (closer(months, year, YEAR_AGO_TARGET_MONTHS)) year = { point, months };
    } else if (closer(months, six, SIX_MONTHS_TARGET_MONTHS)) {
      six = { point, months };
    }
  }
  const chosen = year ?? six;
  if (!chosen) return null;
  const perMonth = (currentUtr - chosen.point.utr) / chosen.months;
  return {
    perMonth,
    perYear: perMonth * 12,
    from: chosen.point,
    months: chosen.months,
  };
}

/**
 * THE player's pace, UTR a year — the one pace number /plan, /schools,
 * /today, the school page and onboarding print (always through
 * formatPacePerYear). It is loggedPaceFor's window, annualised: the same
 * logged rating that sets the projection sets this. Null when no logged
 * rating is 5–13 months old — a screen then says "Not tracked" rather than
 * deriving a pace some other way (the old "+1.45 last 6 months" tile did).
 */
export function playerPacePerYear(input: {
  currentUtr: number | null | undefined;
  history?: readonly UtrDataPoint[] | null;
  now?: Date;
}): number | null {
  if (!isUsableUtr(input.currentUtr)) return null;
  return loggedPaceFor({ currentUtr: input.currentUtr, history: input.history, now: input.now ?? new Date() })?.perYear ?? null;
}

/**
 * THE sentence that sits beside a logged-pace projection within the cap.
 * Every screen gets it from here (RecruitingTimeUtr.assumption), so no
 * component builds pace wording of its own. A pace above the cap gets
 * paceUpsideSentence instead.
 *
 *   rising    "At your logged pace (+1.20 a year since May 2026)."
 *   capped    "At your logged pace (+1.40 a year since May 2026), capped
 *              near the top of college tennis."
 *   falling   "Your rating has gone down since May 2026 (−0.10 a year), so
 *              this stays at today's UTR."
 *
 * `whose` is "your" for the player; a parent's screen passes "Avery's".
 */
export function loggedPaceAssumption(
  pace: Pick<LoggedPace, "perYear" | "from">,
  options: { capped?: boolean; whose?: string } = {}
): string {
  const whose = options.whose ?? "your";
  const since = monthYearLabel(pace.from.date);
  const rate = formatPacePerYear(pace.perYear);
  if (pace.perYear < 0) {
    const Whose = whose.charAt(0).toUpperCase() + whose.slice(1);
    return `${Whose} rating has gone down since ${since} (${rate}), so this stays at today's UTR.`;
  }
  return `At ${whose} logged pace (${rate} since ${since})${
    options.capped ? ", capped near the top of college tennis" : ""
  }.`;
}

/**
 * utr_entries rows as the history every projection reads. `recordedAt` is a
 * Postgres `date` ("YYYY-MM-DD") and is parsed as a LOCAL day:
 * `new Date("2026-05-18")` is UTC midnight — May 17 in every US time zone —
 * and would move a rating across the logged-pace window's edge.
 */
export function utrHistoryFromEntries(
  entries: readonly { utr: number; recordedAt: string }[]
): UtrDataPoint[] {
  return entries.map((e) => ({ date: parseLocalDate(e.recordedAt), utr: e.utr }));
}

/** A rating Postgres would accept (`between 1 and 16.5`, migration 006). */
export function isUsableUtr(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 16.5;
}
