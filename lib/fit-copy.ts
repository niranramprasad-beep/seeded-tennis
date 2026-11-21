import type { SchoolLite } from "@/lib/types";
import type { BandCounts, FitReport, RecruitingTimeUtr } from "@/lib/fit";
import { PLANNING_PACE_CAP_PER_YEAR, formatPacePerYear, isUsableUtr, projectionTargetLabel } from "@/lib/fit";
import { schoolUtrRange, summerBeforeSeniorYear } from "@/lib/school-fit";
import { WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR } from "@/lib/what-if-utr";
import { formatPlayerUtr, formatUtrEstimate, formatUtrFor, hasRealUtr, plural, pluralNoun } from "@/lib/utils";

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
  // "No program is in range today", never "0 programs" (final-check A4).
  const today =
    n === 0 ? "Today, no program is in range." : `Today, ${plural(n, "program", "programs")} ${n === 1 ? "is" : "are"} in range.`;
  if (!headlineProjects(report)) return today;
  const pace = report.utr.planningPacePerYear as number;
  const perYear = formatPacePerYear(pace, { signed: false }).replace(/ a year$/, "");
  const who = audience === "parent" ? "your player gains" : "you gain";
  return `${today} If ${who} about ${perYear} UTR a year (${headlinePaceSource(report.utr, audience)}), that could be ${m} by ${projectionTargetLabel(report.utr.year)}.`;
}

/** Whether fitReportHeadline adds its "that could be {m} by summer …" half. */
function headlineProjects(report: Pick<FitReport, "recruitingInRange" | "utr">): boolean {
  const pace = report.utr.planningPacePerYear;
  return report.utr.isProjected && pace != null && pace > 0 && report.recruitingInRange > 0;
}

/**
 * The fit report's lead (final-check A4). fitReportHeadline, except when
 * nothing is in range today AND the headline would add no projection
 * (nothing by the summer either, or no projection at all): then the
 * homepage hero's zero sentence — the catalogue count, the closest
 * program and its gap, labelled an estimate (nothingInRangeSentence, the
 * same helper heroFitCta uses). It used to read "Today, 0 programs are in
 * range." over "By summer 2027: 0 Target and 0 Likely." and "0 today → 0".
 * `zero.utr` is TODAY's rating, as nothingInRangeSentence requires.
 */
export function fitReportLead(
  report: Pick<FitReport, "todayInRange" | "recruitingInRange" | "utr">,
  audience: "player" | "parent",
  zero: Parameters<typeof nothingInRangeSentence>[0]
): string {
  if (report.todayInRange === 0 && !headlineProjects(report)) {
    const sentence = nothingInRangeSentence(zero);
    if (sentence) return sentence;
  }
  return fitReportHeadline(report, audience);
}

export type FitTabBand = "reach" | "target" | "likely" | "out-of-range";

/**
 * The band tab the fit report opens on: the first non-empty one, in-range
 * bands first — Target, Likely, Reach, then Out of range — so it never opens
 * on an empty Target tab when every program is Out of range (A4).
 */
export function defaultFitTab(counts: Pick<BandCounts, "reach" | "target" | "likely" | "outOfRange">): FitTabBand {
  if (counts.target > 0) return "target";
  if (counts.likely > 0) return "likely";
  if (counts.reach > 0) return "reach";
  if (counts.outOfRange > 0) return "out-of-range";
  return "target";
}

/** What an empty band tab says, in words (A4) — what the band means and
 *  that no program in the list is in it at this rating. */
export function emptyBandSentence(band: FitTabBand): string {
  switch (band) {
    case "target":
      return "No program has this rating between its estimated floor and its estimated average.";
    case "likely":
      return "No program has this rating at or above its estimated average.";
    case "reach":
      return "No program is a Reach: none has an estimated floor above this rating that the pace we plan with reaches by the summer before senior year.";
    case "out-of-range":
      return "No program is Out of range: every estimated floor above this rating is one the pace we plan with reaches by the summer before senior year.";
  }
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

// ---------------------------------------------------------------------
// WHICH RATING A NUMBER IS (final-check A1/A2, 2026-11-21)
//
// The same school showed "You 8.20 · 2.3 below the team average" on Plan and
// "8.7 · 1.8 below average" on its own page and on the Schools list: one was
// today's rating, the other the summer estimate, and neither said so. And the
// Schools "Why this band" panel printed a what-if value as "You're 8.99
// today". Every rating printed next to a team line now carries its basis,
// in one vocabulary, from here:
//   - "today"                                  — the rating the player logged
//   - "by summer 2027, estimate"               — the fit report's projection
//   - "by summer 2027, what-if at +1.50 a year" — the what-if slider's choice
// The year is always the projection's own (report.utr.year, or the summer
// before senior year for a what-if) — never a hardcoded one.
// ---------------------------------------------------------------------

export type WhatIfBasisPace = "mine" | "plus1.5" | "custom";

export type RatingBasis =
  | { kind: "today" }
  | { kind: "estimate"; year: number }
  /** `year` null once the summer before senior year has begun (the what-if
   *  is then about now, as the what-if panel says). */
  | { kind: "what-if"; year: number | null; pace: WhatIfBasisPace | null; pacePerYear?: number | null };

/** The basis of a fit report's rating: the estimate when it is projected,
 *  today's rating otherwise. */
export function basisOfReportUtr(utr: Pick<RecruitingTimeUtr, "isProjected" | "year">): RatingBasis {
  return utr.isProjected ? { kind: "estimate", year: utr.year } : { kind: "today" };
}

/** "today" · "by summer 2027, estimate" · "by summer 2027, what-if at +1.50 a year". */
export function ratingBasisLabel(basis: RatingBasis): string {
  if (basis.kind === "today") return "today";
  if (basis.kind === "estimate") return `by ${projectionTargetLabel(basis.year)}, estimate`;
  // No year left (the summer before senior year has begun): the what-if is
  // about now, and a pace "a year" has nothing to run over (verifier LOW).
  if (basis.year == null) return "now, what-if";
  const when = `by ${projectionTargetLabel(basis.year)}`;
  const how =
    basis.pace === "plus1.5" && basis.pacePerYear != null
      ? ` at ${formatPacePerYear(basis.pacePerYear)}`
      : basis.pace === "mine"
        ? " at your pace"
        : "";
  return `${when}, what-if${how}`;
}

/** A rating printed the way its basis is: a logged or what-if rating at two
 *  decimals, an estimate at one (lib/utils.ts, C10). */
export function formatRatingForBasis(value: number, basis: RatingBasis): string {
  return basis.kind === "estimate" ? formatUtrEstimate(value) : formatPlayerUtr(value);
}

/** "You 8.20 today" · "Bailey 8.7 by summer 2027, estimate". Null without a
 *  real rating — the caller shows "Not tracked" or its own prompt. */
export function ratingWithBasis(value: number | null | undefined, basis: RatingBasis, who = "You"): string | null {
  if (!hasRealUtr(value)) return null;
  // It starts a sentence or a caption: "Your player 8.7 …", never "your player".
  return `${capitalizeFirst(who)} ${formatRatingForBasis(value, basis)} ${ratingBasisLabel(basis)}`;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "You 8.20 today: 2.3 below the team average" — a gap sentence that says
 * which rating it measured. `lines` picks which team lines, in order. Null
 * without a real rating.
 */
export function teamGapSentence(
  value: number | null | undefined,
  basis: RatingBasis,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">,
  opts: { who?: string; lines?: readonly ("floor" | "average")[] } = {}
): string | null {
  const head = ratingWithBasis(value, basis, opts.who ?? "You");
  if (head == null || !hasRealUtr(value)) return null;
  const lines = opts.lines ?? (["floor", "average"] as const);
  const parts = lines.map((which) =>
    teamLineRelation(value, which === "floor" ? school.minCompetitiveUTR : school.avgRosterUTR, which)
  );
  return `${head}: ${parts.join(" · ")}`;
}

/**
 * The basis of the what-if slider's value, or null while the slider is
 * untouched (the page then shows the report's own rating, basisOfReportUtr).
 * The year is the summer before senior year — the date the what-if panel's
 * own question names ("What if my UTR is 8.99 by June 2027?").
 */
export function whatIfBasis(
  whatIf: { isAtRealCurrent: boolean; activePaceMode: WhatIfBasisPace | null },
  graduationYear: number,
  now: Date = new Date()
): RatingBasis | null {
  if (whatIf.isAtRealCurrent) return null;
  const milestone = summerBeforeSeniorYear(graduationYear);
  return {
    kind: "what-if",
    year: now.getTime() >= milestone.getTime() ? null : milestone.getFullYear(),
    pace: whatIf.activePaceMode,
    pacePerYear: whatIf.activePaceMode === "plus1.5" ? WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR : null,
  };
}

// ---------------------------------------------------------------------
// THE RATING EACH FIT SCREEN JUDGES AND PRINTS (verifier MEDIUM 1)
//
// The A1/A2 wiring used to be assembled on each screen — `whatIfBasis(…) ??
// basisOfReportUtr(…)` in two places, `teamGapSentence(todayUtr, …)` in
// another — and a source regex was all that held it. Nine mutations of that
// wiring survived, the original A1 bug among them. Every screen now asks
// these pure functions, and lib/final-check-a.test.ts tests them with the
// what-if / estimate / today / sentinel cases.
// ---------------------------------------------------------------------

/** The rating the bands on a screen were judged on, and which one it is. */
export interface JudgingRating {
  utr: number;
  basis: RatingBasis;
}

/**
 * THE judging rating for a fit screen: the fit report's value, labelled as
 * the what-if when the slider was moved (the report then holds the slider's
 * value as an override and would otherwise call it today's), else as the
 * estimate or today. Null without a report or a real rating.
 *
 * `whatIf` is null where there is no slider for this reader (a parent).
 */
export function judgingRatingFor(input: {
  report: { utr: Pick<RecruitingTimeUtr, "value" | "isProjected" | "year"> } | null | undefined;
  whatIf: { isAtRealCurrent: boolean; activePaceMode: WhatIfBasisPace | null } | null;
  graduationYear: number;
  now?: Date;
}): JudgingRating | null {
  const utr = input.report?.utr;
  if (!utr || !hasRealUtr(utr.value)) return null;
  const fromWhatIf = input.whatIf ? whatIfBasis(input.whatIf, input.graduationYear, input.now) : null;
  return { utr: utr.value, basis: fromWhatIf ?? basisOfReportUtr(utr) };
}

/** Today's real rating or null — the ONLY number "today" may print. */
export function todayRatingFor(currentUtr: number | null | undefined): number | null {
  return hasRealUtr(currentUtr) ? currentUtr : null;
}

/**
 * The gap lines under a "Why this band" summary (/schools' expanded row):
 * the judging rating's gap, then today's gap when the judging rating is not
 * today's — and, when a what-if was dragged BELOW today's rating, one
 * sentence saying so, so the band and "You're 8.20 today" do not read as a
 * contradiction (verifier LOW).
 */
export function whyBandGapLines(
  judging: JudgingRating | null,
  todayUtr: number | null,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">,
  who = "You"
): string[] {
  const lines: string[] = [];
  if (judging) {
    const head = teamGapSentence(judging.utr, judging.basis, school, { who });
    if (head) lines.push(head);
  }
  if (todayUtr != null && hasRealUtr(todayUtr) && judging?.basis.kind !== "today") {
    const today = teamGapSentence(todayUtr, { kind: "today" }, school, { who });
    if (today) lines.push(today);
  }
  if (judging?.basis.kind === "what-if" && todayUtr != null && hasRealUtr(todayUtr) && judging.utr < todayUtr) {
    lines.push(
      `This what-if (${formatPlayerUtr(judging.utr)}) is below today's ${formatPlayerUtr(todayUtr)}, so the band above is for a lower rating than you have now.`
    );
  }
  return lines;
}

/** One target row's gap on /plan: the line the band turns on, measured from
 *  the judging rating and labelled with it. */
export function targetRowGapSentence(
  judging: JudgingRating | null,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">,
  band: string | null | undefined
): string {
  const sentence =
    judging && band && band !== "unverified"
      ? teamGapSentence(judging.utr, judging.basis, school, {
          lines: band === "likely" || band === "target" ? ["average"] : ["floor"],
        })
      : null;
  return sentence ? `${sentence}.` : "Log a UTR to see your gap.";
}

/** The school page's UTR row: the judging gap, today's rating when the
 *  judging one is not today's, and the chip's basis suffix. */
export function schoolPageUtrRow(
  judging: JudgingRating,
  todayUtr: number | null,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">,
  who = "You"
): { description: string; chipSuffix: string } {
  const head = teamGapSentence(judging.utr, judging.basis, school, { who });
  const today =
    judging.basis.kind !== "today" && todayUtr != null ? ratingWithBasis(todayUtr, { kind: "today" }, who) : null;
  return {
    description: `${head ?? ""}.${today ? ` ${today}.` : ""}`,
    chipSuffix: judging.basis.kind === "today" ? "" : ` ${ratingBasisLabel(judging.basis)}`,
  };
}

/** "You 8.7 by summer 2027, estimate · team 9.1–11.5" — a range bar's
 *  caption. */
export function rangeCaption(judging: JudgingRating, who: string, range: { min: number; max: number }): string {
  return `${ratingWithBasis(judging.utr, judging.basis, who)} · team ${formatUtrEstimate(range.min)}–${formatUtrEstimate(range.max)}`;
}

/** "your 8.5 by summer 2027, estimate" — the rating /plan's Closest schools
 *  measures from, mid-sentence. Null without one. */
export function closestSchoolsMeasuredFrom(judging: JudgingRating | null): string | null {
  if (!judging) return null;
  return `your ${formatRatingForBasis(judging.utr, judging.basis)} ${ratingBasisLabel(judging.basis)}`;
}

/** The range bar tooltip's second line: "You 8.7 by summer 2027, estimate ·
 *  1.8 below the team average". */
export function rangeBarYouLine(input: {
  youLabel: string;
  you: number;
  youIsEstimate: boolean;
  youBasis: string | null | undefined;
  median: number;
}): string {
  const basis = input.youBasis ? ` ${input.youBasis}` : "";
  return `${input.youLabel} ${formatUtrFor(input.you, input.youIsEstimate)}${basis} · ${teamLineRelation(input.you, input.median, "average")}`;
}
