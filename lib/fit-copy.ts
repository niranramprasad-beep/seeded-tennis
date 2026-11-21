import type { SchoolLite } from "@/lib/types";
import type { BandCounts, FitReport, RecruitingTimeUtr } from "@/lib/fit";
import { PLANNING_PACE_CAP_PER_YEAR, formatPacePerYear, isUsableUtr, projectionTargetLabel } from "@/lib/fit";
import { schoolUtrRange } from "@/lib/school-fit";
import { formatPlayerUtr, formatUtrEstimate, hasRealUtr, plural, pluralNoun } from "@/lib/utils";

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
 * A distance between a rating and a team line, printed precisely enough that
 * a non-zero distance never prints as zero: one decimal from 0.1 up (the team
 * numbers are estimates), two decimals below 0.1 ("0.04"), and "less than
 * 0.01" below that. Callers decide "at" separately, by exact comparison.
 */
export function formatUtrDistance(distance: number): string {
  const d = Math.abs(distance);
  if (d < 0.005) return "less than 0.01";
  if (Math.round(d * 100) < 10) return d.toFixed(2);
  return formatUtrEstimate(d);
}

/**
 * "None of our 24 women's programs are in range at 9.40 yet. Closest:
 * Florida, about +1.2 away (estimate)." Null without a real UTR — the no-UTR
 * screens keep their own honest prompt and never get this sentence.
 *
 * `utr` is TODAY's rating, and the screens using this count today's bands.
 */
export function nothingInRangeSentence(input: {
  /** The programs the bands were judged over — the real catalogue count. */
  programCount: number;
  /** "women's" / "men's" when that list is one gender's programs. */
  programLabel?: string | null;
  utr: number | null | undefined;
  closest: ClosestProgram | null;
}): string | null {
  const { programCount, programLabel, utr, closest } = input;
  if (!hasRealUtr(utr)) return null;
  const noun = programLabel ? `${programLabel} ${pluralNoun(programCount, "program", "programs")}` : pluralNoun(programCount, "program", "programs");
  const none = `None of our ${programCount} ${noun} ${programCount === 1 ? "is" : "are"} in range at ${formatPlayerUtr(utr)} yet.`;
  if (!closest) return none;
  const gap = formatUtrDistance(closest.gap);
  const away = gap === "less than 0.01" ? "less than 0.01 away" : `about +${gap} away`;
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

/** What the card says when the typed number is not a UTR at all. */
export const UTR_RANGE_NOTE = "UTRs run from 1.00 to 16.50. Enter one in that range to see your counts.";

export type HeroFitCta = (
  /** No usable UTR typed: no counts, a plain button, and a prompt. */
  | { kind: "no-utr"; showCounts: false; label: string; note: string }
  /** At least one Target or Likely program TODAY. */
  | { kind: "button"; showCounts: true; label: string }
  /** Nothing in range today: the zero sentence and a link to every program.
   *  The band tiles show only when some count is non-zero (never 0 / 0 / 0). */
  | { kind: "zero"; showCounts: boolean; sentence: string; link: typeof SEE_ALL_PROGRAMS }
) & {
  /** "By summer 2028, est.: 8 Target and Likely." — only when the projected
   *  count is higher than today's. Null otherwise. */
  projectedNote: string | null;
};

/**
 * What the homepage calculator shows under its inputs (A-001, A-002, and the
 * verifier's "lead with today" on the card): today's Reach / Target / Likely
 * tiles or not, today's button or the zero state, and a small labelled
 * estimate line when the summer projection has more programs in range.
 *
 * `counts` are TODAY's counts (report.todayCounts) — the fit report the button
 * opens leads with today too (A-006). `projected` is the report's summer
 * count and year, or null when nothing is projected.
 */
export function heroFitCta(input: {
  counts: BandCounts | null | undefined;
  projected?: { inRange: number; year: number } | null;
  utr: number | null | undefined;
  schools: readonly Pick<SchoolLite, "slug" | "shortName" | "minCompetitiveUTR" | "avgRosterUTR">[];
  programLabel?: string | null;
}): HeroFitCta {
  const { counts, utr, schools, projected } = input;
  if (hasRealUtr(utr) && !isUsableUtr(utr)) {
    return { kind: "no-utr", showCounts: false, label: "See my schools", note: UTR_RANGE_NOTE, projectedNote: null };
  }
  if (!counts || !hasRealUtr(utr)) {
    return { kind: "no-utr", showCounts: false, label: "See my schools", note: "Add a UTR to see your counts.", projectedNote: null };
  }
  const inRange = inRangeCount(counts);
  const projectedNote =
    projected && projected.inRange > inRange
      ? `By ${projectionTargetLabel(projected.year)}, est.: ${projected.inRange} Target and Likely.`
      : null;
  if (inRange > 0) return { kind: "button", showCounts: true, label: inRangeButtonLabel(inRange), projectedNote };
  const sentence = nothingInRangeSentence({
    programCount: schools.length,
    programLabel: input.programLabel,
    utr,
    closest: closestProgramAbove(utr, schools),
  }) as string;
  return {
    kind: "zero",
    showCounts: counts.reach + counts.target + counts.likely > 0,
    sentence,
    link: SEE_ALL_PROGRAMS,
    projectedNote,
  };
}

/**
 * Where the headline's pace comes from, said in its parenthesis:
 *  - the player's own logged pace, under the cap → "your pace so far", or
 *    "your player's pace so far" on a parent's screen (the pace is the
 *    player's, never the reader's);
 *  - their own pace was faster and is capped at 1.5 → "our planning limit";
 *  - no logged pace, the default growth assumption → "our default assumption".
 */
export function headlinePaceSource(
  utr: Pick<RecruitingTimeUtr, "source" | "pace">,
  audience: "player" | "parent"
): string {
  if (utr.source === "logged-pace") {
    if (utr.pace && utr.pace.perYear > PLANNING_PACE_CAP_PER_YEAR) return "our planning limit";
    return audience === "parent" ? "your player's pace so far" : "your pace so far";
  }
  return "our default assumption";
}

/**
 * The fit report's headline (A-006): today first, then what the planning
 * pace could make it by the summer before senior year.
 *
 *   "Today, 2 programs are in range. If you gain about 1.00 UTR a year (our
 *    default assumption), that could be 6 by summer 2028."
 *
 * Both counts are labelled with their date, so neither is read as the other
 * whichever view the tabs below show. `{pace}` is report.utr
 * .planningPacePerYear — min(own pace, PLANNING_PACE_CAP_PER_YEAR), or the
 * default assumption — and the parenthesis says which (headlinePaceSource).
 * The projected count is report.recruitingInRange, the same projection the
 * bands use; nothing is projected here.
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
  return `${today} If ${who} about ${perYear} UTR a year (${headlinePaceSource(report.utr, audience)}), that could be ${m} by ${projectionTargetLabel(report.utr.year)}.`;
}

/**
 * Where a rating sits against a team line, in words (A-007):
 * "0.3 below the team average", "0.04 above the team floor", "at the team
 * average".
 *
 * Takes the two numbers, not a signed gap, so no call site can flip the
 * sign. "at" ONLY when they are equal — the same `>=` comparison
 * classifySchoolFit makes, so the band chip beside it ("Below the floor",
 * "Between floor and average", "At or above team average") always agrees:
 * rating < line ⇔ "below". (Equality allows 1e-9 of floating-point noise, far
 * under any rating's precision — a drawn average is (min + max) / 2.)
 */
export function teamLineRelation(rating: number, line: number, which: "average" | "floor"): string {
  const diff = line - rating;
  if (Math.abs(diff) < 1e-9) return `at the team ${which}`;
  return `${formatUtrDistance(diff)} ${diff > 0 ? "below" : "above"} the team ${which}`;
}
