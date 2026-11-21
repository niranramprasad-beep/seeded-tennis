// The fit engine — PROJECTION. Where a player's rating is headed by the
// summer before senior year: THE rule that decides which UTR judges fit
// (recruitingTimeUtr), and the paths and labels charts draw from it.
//
// Moved verbatim from lib/fit.ts on 2026-11-21 (the fit.ts split; every
// declaration below is byte-identical to the original, which
// lib/fit-split-purity.test.ts checks). Import from "@/lib/fit", never from
// this file: lib/fit.ts is the engine's public entry point, and
// lib/fit/engine-files.ts lists the files the guard tests treat as
// "lib/fit.ts". "This module" and "here" in the comments below mean the fit
// engine as a whole.

import type { PlayerGender } from "@/lib/types";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import {
  UTR_GROWTH_PER_YEAR,
  growthAssumptionLabel,
  type GrowthPace,
} from "@/lib/config/growth";
import { PLANNING_RULE_SENTENCE, summerBeforeSeniorYear } from "@/lib/school-fit";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { formatPlayerUtr, formatTargetUtr, formatUtrEstimate } from "@/lib/utils";
import {
  loggedPaceAssumption,
  loggedPaceFor,
  planningPacePerYear,
  type LoggedPace,
} from "@/lib/fit/pace";

// Where a player is headed by the time recruiting actually happens, and what
// that means for each school's band.
//
// ===========================================================================
// DETERMINISTIC. NO MODEL PRODUCES ANY NUMBER HERE.
// ===========================================================================
// Current UTR, a grade, and three constants. Given the same inputs this
// returns the same answer forever, and anyone can check it with a pen. A
// language model may write a sentence ABOUT these numbers; it may not
// produce one.
//
// WHY THIS EXISTS. The fit report showed a player's band from their UTR
// today. For a Class of 2031 player that is a 13-year-old's rating, and
// nearly every program came back "Reach" — which is true today and useless,
// because nobody recruits a 13-year-old on their 13-year-old rating. The
// question a family is actually asking is "where will I be when coaches
// look?". The projection target is THE SUMMER BEFORE SENIOR YEAR (June 1
// after junior year) — the same milestone the homepage, the what-if slider
// and every pace calculation already use. It was junior year until
// 2026-11-16, which made the fit report contradict the homepage's "by the
// summer before senior year". Top D1 programs often decide earlier, during
// junior year, and every screen that shows the projection says so
// (EARLY_DECISION_NOTE).
//
// WHY IT IS SEPARATE FROM lib/school-fit.ts. That module answers "given a
// UTR, what band is this school?" — it is the classifier, and it is already
// shared by six screens. This one answers "what UTR, and when?". Keeping
// them apart means the projection can change without touching banding, and
// the banding rules stay the single thing every screen agrees on.

export interface UtrProjection {
  /** Projected UTR at the summer before senior year, by pace. Equal to
   * `currentUtr` once that summer has begun. */
  slow: number;
  normal: number;
  fast: number;
  /** Calendar year of the summer before senior year — "summer 2030". */
  recruitingYear: number;
  /** Years of growth applied (fractional): from now to June 1 of the summer
   * before senior year. 0 once that summer has begun. */
  yearsOfGrowth: number;
  /** True when there is no growth window left — the projection IS today's
   * rating, and the UI must not dress it up as a forecast. */
  isAtOrPastRecruiting: boolean;
  /** Hit the per-gender realistic ceiling. The UI should say so rather than
   * showing a suspiciously round number with no explanation. */
  cappedByCeiling: boolean;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** The projection target: June 1 of the summer before senior year. */
export function projectionTargetDate(graduationYear: number): Date {
  return summerBeforeSeniorYear(graduationYear);
}

/** "summer 2030" — how every screen names the projection target. */
export function projectionTargetLabel(year: number): string {
  return `summer ${year}`;
}

/** Years (fractional) from now to the summer before senior year, floored at
 * zero. A junior in November gets about seven months of growth; a senior
 * whose summer has begun gets none. */
export function yearsUntilRecruiting(graduationYear: number, now: Date = new Date()): number {
  const ms = projectionTargetDate(graduationYear).getTime() - now.getTime();
  return Math.max(0, ms / MS_PER_YEAR);
}

/**
 * Projects a UTR forward to the summer before senior year at each pace.
 *
 * Returns `null` when there is no current UTR. Deliberately null rather than
 * a default: there is no honest projection from a number we do not have, and
 * a caller that forgets to handle it should break loudly rather than render
 * a guess. The fit report shows an empty state for this case.
 *
 * **Once the summer before senior year has begun, the current rating comes
 * back at every pace.** Projecting growth past the point coaches are
 * deciding would invent a better player than the one they are looking at.
 * A junior still gets the months up to that summer.
 */
export function projectUtrAtRecruiting(input: {
  currentUtr: number | null | undefined;
  graduationYear: number;
  gender: PlayerGender;
  now?: Date;
}): UtrProjection | null {
  const { currentUtr, graduationYear, gender } = input;
  if (currentUtr == null || !Number.isFinite(currentUtr) || currentUtr <= 0) return null;

  const now = input.now ?? new Date();
  const years = yearsUntilRecruiting(graduationYear, now);
  const recruitingYear = projectionTargetDate(graduationYear).getFullYear();
  const ceiling = REALISTIC_UTR_CEILING[gender];

  const at = (pace: GrowthPace) => {
    // Typical growth sits inside the cap (lib/pace-cap.test.ts); capping it
    // here as well means no projection can ever outrun it.
    const raw = currentUtr + planningPacePerYear(UTR_GROWTH_PER_YEAR[pace]) * years;
    // Round to one decimal: UTR is published to two, but a projection
    // carrying two implies a precision the assumption does not have.
    return Math.round(Math.min(ceiling, raw) * 10) / 10;
  };

  const fast = at("fast");

  return {
    slow: at("slow"),
    normal: at("normal"),
    fast,
    recruitingYear,
    yearsOfGrowth: years,
    isAtOrPastRecruiting: years === 0,
    cappedByCeiling: years > 0 && fast >= ceiling,
  };
}

/** The input every "where is this player headed" helper takes. `history`
 * is the player's REAL logged ratings (utr_entries rows, dates parsed as
 * local days — utrHistoryFromEntries); with a rating dated in the logged-
 * pace window it switches the projection from typical growth to the
 * player's own pace. See recruitingTimeUtr. */
export interface ProjectionSubject {
  currentUtr: number | null | undefined;
  graduationYear: number;
  gender: PlayerGender;
  now?: Date;
  history?: readonly UtrDataPoint[] | null;
}

/**
 * The projection between today and the summer before senior year, at one
 * date — what a chart draws between "today" and the projected end point.
 *
 * Same rule as recruitingTimeUtr, evaluated at `date` instead of at the
 * target, and NOT rounded: the end point a screen labels is the rounded
 * recruitingTimeUtr value; this only places the line under it.
 *  - With a logged pace (loggedPaceFor): today + min(pace, the planning cap)
 *    × years, capped at the realistic ceiling, never below today. `pace` is
 *    ignored — the player's own pace has no slow/fast spread, so every pace
 *    returns the same line.
 *  - Otherwise: current + typical growth × years at `pace`, capped.
 * `date` is clamped to [now, target], so the line never runs past the point
 * coaches decide. Null when there is no usable rating.
 */
export function projectedUtrOn(
  input: ProjectionSubject,
  date: Date,
  pace: GrowthPace = "normal"
): number | null {
  const { currentUtr, graduationYear, gender } = input;
  if (currentUtr == null || !Number.isFinite(currentUtr) || currentUtr <= 0) return null;
  const now = input.now ?? new Date();
  const target = projectionTargetDate(graduationYear).getTime();
  const t = Math.min(Math.max(date.getTime(), now.getTime()), Math.max(now.getTime(), target));
  const years = Math.max(0, (t - now.getTime()) / MS_PER_YEAR);
  const logged = loggedPaceFor({ currentUtr, history: input.history, now });
  if (logged) {
    return Math.max(
      currentUtr,
      Math.min(REALISTIC_UTR_CEILING[gender], currentUtr + planningPacePerYear(logged.perYear) * years)
    );
  }
  return Math.min(REALISTIC_UTR_CEILING[gender], currentUtr + planningPacePerYear(UTR_GROWTH_PER_YEAR[pace]) * years);
}

/**
 * When the projection (logged pace capped at PLANNING_PACE_CAP_PER_YEAR when
 * there is one, else typical normal pace — the same rule as
 * recruitingTimeUtr) first reaches `utr`, or null
 * when it does not by the summer before senior year (or the rating is
 * unusable, or the logged pace is flat or falling).
 *
 * Today's date when the player is already there. Answers "around which month
 * does the player reach where their target schools start?" without a
 * component doing the division itself.
 */
export function projectionReachDate(input: ProjectionSubject, utr: number): Date | null {
  const { currentUtr, graduationYear, gender } = input;
  if (currentUtr == null || !Number.isFinite(currentUtr) || currentUtr <= 0) return null;
  const now = input.now ?? new Date();
  if (currentUtr >= utr) return now;
  if (utr > REALISTIC_UTR_CEILING[gender]) return null;
  const logged = loggedPaceFor({ currentUtr, history: input.history, now });
  const perYear = planningPacePerYear(logged ? logged.perYear : UTR_GROWTH_PER_YEAR.normal);
  if (perYear <= 0) return null;
  const years = (utr - currentUtr) / perYear;
  const at = new Date(now.getTime() + years * MS_PER_YEAR);
  return at.getTime() <= projectionTargetDate(graduationYear).getTime() ? at : null;
}

/**
 * The fit report's estimate (`report.utr`), drawn as a path from today to
 * the summer before senior year — for the charts on /today and /plan.
 *
 * THIS DECIDES NOTHING. It takes the `RecruitingTimeUtr` the report already
 * chose (whatever rule `recruitingTimeUtr` applies) and draws straight
 * lines from today's rating to its low / value / high at the target date.
 * So the chart's end label, the ProjectionNote and the school page's Pace
 * row are one number by construction.
 *
 * WHY. Until 2026-11-18 each chart shaded its own regression through the
 * logged ratings while every other screen printed the report's estimate.
 * The school page showed both in one card: "Pace: 8.5 by Jun 1, 2028" above
 * "estimated UTR for summer 2028: 7.5" — two projections for one date (C8).
 *
 * Empty when there is no estimate or it is today's rating (the summer has
 * begun), so there is nothing projected to draw.
 */
export interface UtrEstimatePoint {
  date: Date;
  low: number;
  value: number;
  high: number;
}

export function projectionPath(input: {
  /** `report.utr` — never computed here. */
  estimate: RecruitingTimeUtr | null | undefined;
  currentUtr: number | null | undefined;
  graduationYear: number;
  now?: Date;
  /** Points including both ends. */
  steps?: number;
}): UtrEstimatePoint[] {
  const { estimate, currentUtr } = input;
  if (!estimate?.isProjected || currentUtr == null || !Number.isFinite(currentUtr) || currentUtr <= 0) return [];
  const now = input.now ?? new Date();
  const target = projectionTargetDate(input.graduationYear);
  const span = target.getTime() - now.getTime();
  if (span <= 0) return [];
  const steps = Math.max(2, input.steps ?? 12);
  const points: UtrEstimatePoint[] = [];
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1);
    const lerp = (end: number) => currentUtr + (end - currentUtr) * f;
    points.push({
      date: new Date(now.getTime() + span * f),
      low: lerp(estimate.low),
      value: lerp(estimate.value),
      high: lerp(estimate.high),
    });
  }
  // The end is exactly the report's numbers, not a float near them.
  points[points.length - 1] = { date: target, low: estimate.low, value: estimate.value, high: estimate.high };
  return points;
}

/**
 * The UPSIDE drawn as a path — the player's own pace, uncapped, from today
 * to the summer before senior year (`report.utr.upside`). Empty unless the
 * player's own pace is faster than PLANNING_PACE_CAP_PER_YEAR.
 *
 * A chart draws this as a dashed line labelled "Estimate", beside the plan
 * (projectionPath). It is never what a band, a goal or a checkpoint reads.
 */
export function upsideProjectionPath(input: {
  estimate: RecruitingTimeUtr | null | undefined;
  currentUtr: number | null | undefined;
  graduationYear: number;
  now?: Date;
  steps?: number;
}): UtrEstimatePoint[] {
  const up = input.estimate?.upside;
  if (!input.estimate || !up) return [];
  return projectionPath({
    ...input,
    estimate: { ...input.estimate, value: up.value, low: up.value, high: up.value },
  });
}

/**
 * The words at the right-hand end of a UTR chart — one place, so /today's
 * and /plan's charts print the report's numbers in the report's formats.
 *  - `plan`: the planning estimate (projectionPath's end), "8.1".
 *  - `upside`: "Estimate 9.40" — only with an upside path.
 */
export function chartEndLabels(
  plan: readonly UtrEstimatePoint[],
  upside: readonly UtrEstimatePoint[] = []
): { plan: string | null; upside: string | null } {
  const p = plan[plan.length - 1];
  const u = upside[upside.length - 1];
  return {
    plan: p ? formatUtrEstimate(p.value) : null,
    upside: u ? `Estimate ${formatTargetUtr(u.value)}` : null,
  };
}

/**
 * The value of that path on one date — the estimate at a chart's right edge
 * when the chart stops before the summer before senior year. Clamped to the
 * path's ends. Null when there is no estimate.
 */
export function estimateOnDate(
  path: UtrEstimatePoint[],
  date: Date
): UtrEstimatePoint | null {
  if (path.length === 0) return null;
  const t = date.getTime();
  if (t <= path[0].date.getTime()) return path[0];
  const last = path[path.length - 1];
  if (t >= last.date.getTime()) return last;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (t <= b.date.getTime()) {
      const f = (t - a.date.getTime()) / (b.date.getTime() - a.date.getTime());
      const lerp = (x: number, y: number) => x + (y - x) * f;
      return { date, low: lerp(a.low, b.low), value: lerp(a.value, b.value), high: lerp(a.high, b.high) };
    }
  }
  return last;
}

/** The caption to render under a projected number. Always paired with it —
 * the number alone is the thing this module exists to avoid. */
export function projectionAssumptionLabel(pace: GrowthPace = "normal"): string {
  return growthAssumptionLabel(pace);
}

/* ==========================================================================
 * ONE RATING, ONE REPORT
 * ==========================================================================
 * Everything above answers "where is this player headed?". Everything below
 * is the single place that turns that into what a screen shows.
 *
 * WHY. The pre-auth fit report, for Men's UTR 8.7 Class of 2031, told a
 * family four things at once:
 *
 *   trajectory panel  "By junior year (2029) 11.7 · in range 0 today → 20"
 *   headline          "You're a realistic target for 0 programs"
 *   tabs              "Reach 37 · Target 0 · Likely 0"
 *   every row         compared 8.7 against the team's range
 *
 * Each number was correct on its own terms. The panel asked "what about
 * junior year?"; the headline, tabs and rows asked "what about today?" —
 * and nothing on the screen said they were different questions. A parent
 * reads that as a product that cannot count.
 *
 * The cause was two parallel systems: countBands() here and
 * countSchoolFits() in school-fit.ts, each reachable from any component
 * with whatever rating that component happened to have. So the rating is
 * now a decision this module makes (recruitingTimeUtr), the bands are a
 * result this module returns (buildFitReport), and classifySchoolFit takes
 * a branded basis only this module mints — a component that tries to
 * classify for itself does not compile.
 */

export type FitBasisKind = "projected" | "current";

/** Which rule produced a RecruitingTimeUtr. */
export type RecruitingUtrSource =
  /** Today's rating: the summer before senior year has begun, or the what-if
   *  slider's explicit choice. */
  | "current"
  /** The player's own pace, from a logged rating 5–13 months old. */
  | "logged-pace"
  /** No qualifying logged rating: the typical-growth assumption. */
  | "typical-growth";

export interface RecruitingTimeUtr {
  /** The rating that judges fit. */
  value: number;
  /** Whether `value` is a projection or the rating the player holds now. */
  basis: FitBasisKind;
  /** Slow / fast ends of the assumption. Equal to `value` when basis is
   * "current", and for a logged pace — the player's own pace is one line,
   * and a range around it would be invented. */
  low: number;
  high: number;
  /** The sentence that must appear wherever `value` does. Null when the
   * number is simply the player's real rating and needs no caveat. */
  assumption: string | null;
  /** Calendar year `value` refers to. */
  year: number;
  /** True when a projection was applied, i.e. the player is pre-senior. */
  isProjected: boolean;
  source: RecruitingUtrSource;
  /** The player's own logged pace, when `source` is "logged-pace" — the
   * number shown as "your pace". NOT necessarily the pace `value` was carried
   * at: see `planningPacePerYear`. */
  pace: LoggedPace | null;
  /** UTR a year `value` was actually projected at: min(own pace,
   * PLANNING_PACE_CAP_PER_YEAR) for a logged pace, typical growth otherwise.
   * Null when `value` is today's rating. */
  planningPacePerYear: number | null;
  /** Where the player's OWN pace, uncapped, would put them — present only
   * when that pace is faster than the cap and the result is above `value`.
   * Shown beside the plan as an estimate; it never judges a band. */
  upside: PaceUpside | null;
  /** Growth was cut at the per-gender realistic ceiling. */
  cappedByCeiling: boolean;
}

export interface PaceUpside {
  /** The rating at the summer before senior year at the player's own pace,
   * rounded to one decimal and capped at the realistic ceiling like `value`. */
  value: number;
  /** The player's own pace, UTR a year (> PLANNING_PACE_CAP_PER_YEAR). */
  perYear: number;
}

/**
 * "At your current pace you'd reach 9.40. We plan with 8.10 instead. We plan
 * with at most 1.5 UTR a year. That's our planning rule, not a measured
 * average." — THE sentence beside a capped
 * projection, on every screen that shows one. Null when there is no upside
 * (the player's own pace is within the cap, or there is no logged pace).
 * Two decimals for both numbers (owner's wording, 2026-11-19).
 *
 * `who` is the player's first name on a parent's screen.
 */
export function paceUpsideSentence(utr: RecruitingTimeUtr | null | undefined, who?: string | null): string | null {
  if (!utr?.upside) return null;
  const at = who ? `At ${who}'s current pace ${who} would reach` : "At your current pace you'd reach";
  return `${at} ${formatTargetUtr(utr.upside.value)}, but we plan with ${formatPlayerUtr(utr.value)}. ${PLANNING_RULE_SENTENCE}`;
}

/**
 * THE ONLY PLACE THAT DECIDES WHICH UTR JUDGES FIT. One rule, used by every
 * signed-in screen (buildFitReport → useFitReport) AND by the onboarding
 * diagnostic (diagnosticProjection), so the summer number a player reads
 * before sign-up is the number the app shows after it (docs/DECISIONS.md,
 * 2026-11-18, "One projection rule for onboarding and the app").
 *
 *  1. The summer before senior year has begun → today's rating, unchanged.
 *     Projecting past the point coaches decide would invent a better player.
 *  2. A REAL logged rating 5–13 months old (loggedPaceFor) → THEIR pace,
 *     but never faster than PLANNING_PACE_CAP_PER_YEAR (1.5 a year):
 *     min((today − past) / months × 12, cap), carried to
 *     projectionTargetDate(), capped at the per-gender REALISTIC_UTR_CEILING
 *     and rounded to one decimal as the typical-growth projection is — and
 *     never below today's rating, so a falling trend is held at today. One
 *     value; no slow/fast range. When their own pace is faster than the cap,
 *     where it would take them is returned as `upside` — shown, never banded.
 *  3. Otherwise → the typical-growth projection (normal pace, slow/fast as
 *     the range). A 13-year-old with no history is still not banded on their
 *     13-year-old rating — the bug this function first existed to fix.
 *
 *  No usable rating → null. Not a default, not a zero: callers must render
 *  an honest prompt, and one that forgets should break loudly.
 */
export function recruitingTimeUtr(input: ProjectionSubject): RecruitingTimeUtr | null {
  const now = input.now ?? new Date();
  const projection = projectUtrAtRecruiting({ ...input, now });
  if (!projection) return null;

  const current = input.currentUtr as number;
  if (projection.isAtOrPastRecruiting) {
    return {
      value: current,
      basis: "current",
      low: current,
      high: current,
      assumption: null,
      year: projection.recruitingYear,
      isProjected: false,
      source: "current",
      pace: null,
      planningPacePerYear: null,
      upside: null,
      cappedByCeiling: false,
    };
  }

  const pace = loggedPaceFor({ currentUtr: current, history: input.history, now });
  if (pace) {
    const ceiling = REALISTIC_UTR_CEILING[input.gender];
    const years = projection.yearsOfGrowth;
    // The ceiling caps GROWTH; it never pulls a real rating down.
    const carry = (perYear: number) => {
      const raw = current + perYear * years;
      return {
        value: Math.max(current, Math.round(Math.min(ceiling, raw) * 10) / 10),
        hitCeiling: raw > Math.max(ceiling, current),
      };
    };
    const planned = planningPacePerYear(pace.perYear);
    const plan = carry(planned);
    const own = pace.perYear > planned ? carry(pace.perYear) : null;
    const upside: PaceUpside | null =
      own && own.value > plan.value ? { value: own.value, perYear: pace.perYear } : null;
    const partial: RecruitingTimeUtr = {
      value: plan.value,
      basis: "projected",
      low: plan.value,
      high: plan.value,
      assumption: null,
      year: projection.recruitingYear,
      isProjected: true,
      source: "logged-pace",
      pace,
      planningPacePerYear: planned,
      upside,
      cappedByCeiling: plan.hitCeiling,
    };
    return {
      ...partial,
      assumption: upside
        ? (paceUpsideSentence(partial) as string)
        : loggedPaceAssumption(pace, { capped: plan.hitCeiling || (own?.hitCeiling ?? false) }),
    };
  }

  return {
    value: projection.normal,
    basis: "projected",
    low: projection.slow,
    high: projection.fast,
    assumption: projectionAssumptionLabel("normal"),
    year: projection.recruitingYear,
    isProjected: true,
    source: "typical-growth",
    pace: null,
    planningPacePerYear: planningPacePerYear(UTR_GROWTH_PER_YEAR.normal),
    upside: null,
    cappedByCeiling: projection.cappedByCeiling,
  };
}
