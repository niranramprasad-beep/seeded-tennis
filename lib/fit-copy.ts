import type { SchoolLite } from "@/lib/types";
import type { BandCounts, FitReport } from "@/lib/fit";
import { formatPacePerYear, projectionTargetLabel } from "@/lib/fit";
import { schoolUtrRange } from "@/lib/school-fit";
import { formatPlayerUtr, formatUtrEstimate, hasRealUtr, plural } from "@/lib/utils";

// The words that sit next to the fit counts — the homepage calculator's
// button, the zero state when nothing is in range, the fit report's headline
// and the "above / below the team average" phrasing. Pure functions, so the
// tests (lib/honest-zero-state.test.ts) read exactly what a screen prints.
//
// WHY (owner's audit, 2026-11-21, A-001/A-002/A-006/A-007). The homepage
// card showed "0 / 0 / 0" with a button reading "See my — schools", the
// button's number counted Reach as well as Target and Likely in nobody's
// head but the code's, the fit report led with a projection instead of
// today, and "Gap to team average +0.3" left a family to work out which way
// the sign went.
//
// "IN RANGE" = Target + Likely, never Reach. That is FitReport.inRange's
// definition (lib/fit.ts) and every count here uses it, so the homepage
// button, the zero state and the fit report headline cannot disagree on what
// the phrase means.

/** Target + Likely — the one meaning of "in range" (FitReport.inRange). */
export function inRangeCount(counts: Pick<BandCounts, "target" | "likely">): number {
  return counts.target + counts.likely;
}

export interface ClosestProgram {
  slug: string;
  name: string;
  /** The program's estimated range floor minus the player's UTR, > 0. */
  gap: number;
}

/**
 * The program whose ESTIMATED range starts nearest above `utr`: the smallest
 * positive gap from the rating to the floor of the range the fit code uses
 * (schoolUtrRange().min, i.e. minCompetitiveUTR). Programs with no usable
 * range are skipped — a range is never invented to fill one in — and a
 * program whose floor is at or below the rating is already in range, so it
 * is not "closest". Ties go to the name first alphabetically, so the answer
 * does not depend on catalogue order. Null without a real UTR.
 */
export function closestProgramAbove(
  utr: number | null | undefined,
  schools: readonly Pick<SchoolLite, "slug" | "shortName" | "minCompetitiveUTR" | "avgRosterUTR">[]
): ClosestProgram | null {
  if (!hasRealUtr(utr)) return null;
  let best: ClosestProgram | null = null;
  for (const school of schools) {
    if (!Number.isFinite(school.minCompetitiveUTR) || !Number.isFinite(school.avgRosterUTR)) continue;
    if (school.minCompetitiveUTR <= 0 || school.avgRosterUTR <= 0) continue;
    const floor = schoolUtrRange(school).min;
    const gap = Math.round((floor - utr) * 100) / 100;
    if (gap <= 0) continue;
    if (!best || gap < best.gap || (gap === best.gap && school.shortName.localeCompare(best.name) < 0)) {
      best = { slug: school.slug, name: school.shortName, gap };
    }
  }
  return best;
}

/**
 * "None of our 24 programs are in range at 9.40 yet. Closest: Florida, about
 * +1.2 away (estimate)." Null without a real UTR — the no-UTR screens keep
 * their own honest prompt and never get this sentence.
 *
 * `utr` is TODAY's rating. When a screen's counts are the projected view the
 * sentence is still true: a projection is never below today's rating, so
 * nothing in range at the projection means nothing in range today.
 */
export function nothingInRangeSentence(input: {
  /** The programs the bands were judged over — the real catalogue count. */
  programCount: number;
  utr: number | null | undefined;
  closest: ClosestProgram | null;
}): string | null {
  const { programCount, utr, closest } = input;
  if (!hasRealUtr(utr)) return null;
  const none = `None of our ${plural(programCount, "program", "programs")} ${programCount === 1 ? "is" : "are"} in range at ${formatPlayerUtr(utr)} yet.`;
  if (!closest) return none;
  const gap = formatUtrEstimate(closest.gap);
  const away = gap === "0.0" ? "less than 0.1 away" : `about +${gap} away`;
  return `${none} Closest: ${closest.name}, ${away} (estimate).`;
}

/** "See my 3 Target and Likely schools" / "See my 1 Target or Likely school".
 * Only for a count of at least one — zero gets the zero state instead. */
export function inRangeButtonLabel(inRange: number): string {
  return inRange === 1
    ? "See my 1 Target or Likely school"
    : `See my ${inRange} Target and Likely schools`;
}

export const SEE_ALL_PROGRAMS = { label: "See all programs", href: "/schools" } as const;

export type HeroFitCta =
  /** No real UTR typed: no counts, a plain button, and a prompt. */
  | { kind: "no-utr"; showCounts: false; label: string; note: string }
  /** At least one Target or Likely program. */
  | { kind: "button"; showCounts: true; label: string }
  /** Nothing in range: the zero sentence and a link to every program. The
   *  band tiles show only when some count is non-zero (never 0 / 0 / 0). */
  | { kind: "zero"; showCounts: boolean; sentence: string; link: typeof SEE_ALL_PROGRAMS };

/**
 * What the homepage calculator shows under its inputs (A-001, A-002): the
 * Reach / Target / Likely tiles or not, and the button or the zero state.
 * `counts` are the report's counts for the view the tiles show; `schools`
 * are the programs those counts were judged over.
 */
export function heroFitCta(input: {
  counts: BandCounts | null | undefined;
  utr: number | null | undefined;
  schools: readonly Pick<SchoolLite, "slug" | "shortName" | "minCompetitiveUTR" | "avgRosterUTR">[];
}): HeroFitCta {
  const { counts, utr, schools } = input;
  if (!counts || !hasRealUtr(utr)) {
    return { kind: "no-utr", showCounts: false, label: "See my schools", note: "Add a UTR to see your counts." };
  }
  const inRange = inRangeCount(counts);
  if (inRange > 0) return { kind: "button", showCounts: true, label: inRangeButtonLabel(inRange) };
  const sentence = nothingInRangeSentence({
    programCount: schools.length,
    utr,
    closest: closestProgramAbove(utr, schools),
  }) as string;
  return {
    kind: "zero",
    showCounts: counts.reach + counts.target + counts.likely > 0,
    sentence,
    link: SEE_ALL_PROGRAMS,
  };
}

/**
 * The fit report's headline (A-006): today first, then what the planning
 * pace could make it by the summer before senior year.
 *
 *   "Today, 2 programs are in range. If you gain about 1.00 UTR a year (our
 *    assumption), that could be 6 by summer 2028."
 *
 * Both counts are labelled with their date, so neither is read as the other
 * whichever view the tabs below show. `{pace}` is report.utr
 * .planningPacePerYear — min(own pace, PLANNING_PACE_CAP_PER_YEAR), or
 * typical growth — and the projected count is report.recruitingInRange, the
 * same projection the bands use; nothing is projected here.
 *
 * Only the first sentence when there is no projection (the summer has
 * begun), when the planning pace is flat or falling (the projection holds at
 * today), or when the projected count is 0 too (the zero state below says
 * what is closest instead of "that could be 0").
 */
export function fitReportHeadline(
  report: Pick<FitReport, "todayInRange" | "recruitingInRange" | "utr">,
  audience: "player" | "parent"
): string {
  const n = report.todayInRange;
  const m = report.recruitingInRange;
  const today = `Today, ${plural(n, "program", "programs")} ${n === 1 ? "is" : "are"} in range.`;
  const pace = report.utr.planningPacePerYear;
  if (!report.utr.isProjected || pace == null || pace <= 0 || m === 0) return today;
  const perYear = formatPacePerYear(pace, { signed: false }).replace(/ a year$/, "");
  const who = audience === "parent" ? "your player gains" : "you gain";
  return `${today} If ${who} about ${perYear} UTR a year (our assumption), that could be ${m} by ${projectionTargetLabel(report.utr.year)}.`;
}

/**
 * Where a rating sits against a team line, in words (A-007):
 * "0.3 below the team average", "0.3 above the team average", "at the team
 * average". `gapBelow` is fitGaps()'s sign — line minus rating, positive
 * when the player is BELOW the line. Equal at the printed precision (one
 * decimal, the team numbers are estimates) reads "at".
 */
export function teamLineRelation(gapBelow: number, line: "average" | "floor"): string {
  const size = formatUtrEstimate(Math.abs(gapBelow));
  if (size === "0.0") return `at the team ${line}`;
  return `${size} ${gapBelow > 0 ? "below" : "above"} the team ${line}`;
}
