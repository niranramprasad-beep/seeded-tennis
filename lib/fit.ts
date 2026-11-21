import type { PlayerGender, SchoolLite } from "@/lib/types";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import {
  UTR_GROWTH_PER_YEAR,
  growthAssumptionLabel,
  type GrowthPace,
} from "@/lib/config/growth";
import { summerBeforeSeniorYear } from "@/lib/school-fit";
import {
  toLocalDateString,
  localMonthsBetween,
  monthYearLabel,
  parseLocalDate,
  shiftLocalMonths,
  startOfLocalDay,
} from "@/lib/time";
import { realisticPaceProjectionFor } from "@/lib/what-if-utr";
import type { UtrDataPoint } from "@/lib/utr-projection";
import { formatPacePerYear, formatPlayerUtr, formatTargetUtr, formatUtrEstimate } from "@/lib/utils";
import {
  PLANNING_RULE_SENTENCE,
  classifySchoolFit,
  fitBasis,
  type ClosestSchoolResult,
  type GoalPace,
  type SchoolFitBand,
  type SchoolFitProjectionInput,
} from "@/lib/school-fit";

export { formatPacePerYear };

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

export interface SchoolBandComparison {
  slug: string;
  /** Band from the rating the player has right now. */
  today: SchoolFitBand;
  /** Band at the projected rating, normal pace. The headline number. */
  projected: SchoolFitBand;
  /** Shown on expand. */
  projectedSlow: SchoolFitBand;
  projectedFast: SchoolFitBand;
  /** True when the projection moves this school into a better band — the
   * thing worth drawing attention to. */
  improves: boolean;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

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

/* ==========================================================================
 * THE PLAN GOAL
 * ==========================================================================
 * /plan's goal used to be the floor of the HARDEST target school (Duke,
 * 12.0, for a 5.95 player). So the goal, every checkpoint on /plan and the
 * "Next checkpoint" chip on /today jumped whenever a target was added
 * (8.90 → 9.0 → 9.50 in one session), and the default plan asked for
 * 3.9 UTR a year — a pace almost nobody manages, presented as "your plan".
 *
 * C11 (2026-11-18) then made the goal default to the fit report's estimate.
 * That was reversed on 2026-11-19 (PR D, D1): an estimate is where Seeded
 * thinks a player is headed, not something the player decided to aim for,
 * and with a fast logged pace it put a goal on screen that the pace warning
 * beside it called unrealistic. Now a goal exists ONLY when the player set
 * one. No goal → null, and /plan shows "Set a goal". Adding a target never
 * moves a goal, and this function computes no projection of its own.
 */
export interface PlanGoal {
  /** The goal the player chose. */
  value: number;
  /** The fit report's planning estimate (`report.utr.value`), offered as a
   * realistic goal the player can pick. Null without a projection. */
  estimate: number | null;
}

export function resolvePlanGoal(input: {
  /** The goal the player saved, if any (lib/db/settings.ts). */
  chosenGoalUtr: number | null | undefined;
  /** `report.utr` — the fit report's rating for the summer before senior
   * year. Offered, never defaulted to. */
  estimate: RecruitingTimeUtr | null | undefined;
}): PlanGoal | null {
  const chosen = input.chosenGoalUtr;
  if (chosen == null || !Number.isFinite(chosen) || chosen <= 0) return null;
  const est = input.estimate?.isProjected ? input.estimate.value : null;
  return { value: chosen, estimate: est };
}

/**
 * How close to the planning cap a goal's required pace may sit and still be
 * called "a stretch" rather than warned about: |required − cap| ≤ this, in
 * UTR a year (A-022, 2026-11-21). 1.45–1.55 is the stretch band.
 */
export const PACE_STRETCH_MARGIN_PER_YEAR = 0.05;

export type PlanGoalPaceSeverity = "warning" | "stretch" | null;

/**
 * THE rule for the pace banner under a goal — /plan and /today both render
 * GoalPaceWarning, which asks this, so the two screens cannot disagree.
 *
 * Only for a goal the PLAYER SET (there is no other kind now):
 *  - "warning" (red): it needs more than the cap + the stretch margin
 *    (above 1.55 a year), or there is no time left to close it;
 *  - "stretch" (amber): it needs within PACE_STRETCH_MARGIN_PER_YEAR of the
 *    cap (1.45–1.55 a year) — right at the limit the bands plan with, which
 *    is a stretch, not a red flag;
 *  - null: anything slower, or no goal.
 * Compared in hundredths: requiredPaceUtrPerYear is rounded to two decimals
 * (computeGoalPace), and 1.55 − 1.5 is not ≤ 0.05 in floating point.
 */
export function planGoalPaceSeverity(goal: PlanGoal | null, pace: GoalPace | null): PlanGoalPaceSeverity {
  if (!goal || !pace) return null;
  if (pace.paceRead === "no-time-left") return "warning";
  if (pace.requiredPaceUtrPerYear == null) return null;
  const req = Math.round(pace.requiredPaceUtrPerYear * 100);
  const cap = Math.round(PLANNING_PACE_CAP_PER_YEAR * 100);
  const margin = Math.round(PACE_STRETCH_MARGIN_PER_YEAR * 100);
  if (req > cap + margin) return "warning";
  if (req >= cap - margin) return "stretch";
  return null;
}

/** The red warning only — a goal needing more than the cap plus the stretch
 * margin, or with no time left. See planGoalPaceSeverity. */
export function planGoalNeedsPaceWarning(goal: PlanGoal | null, pace: GoalPace | null): boolean {
  return planGoalPaceSeverity(goal, pace) === "warning";
}

/** "We plan with at most 1.5 UTR a year. That's our planning rule, not a
 * measured average." — defined in lib/school-fit.ts (its next-band message
 * says it too), re-exported here beside the cap it states. */
export { PLANNING_RULE_SENTENCE };

/** The amber banner's words for a goal in the stretch band (A-022). */
export const PACE_STRETCH_NOTE = `That's a stretch: right at our ${PLANNING_PACE_CAP_PER_YEAR}-a-year planning limit.`;

/**
 * Why a goal the player typed can't be saved, or null when it can. A goal is
 * a rating not reached yet: one at or below today's rating would put every
 * checkpoint behind the player (docs/DECISIONS.md, 2026-11-18). With no real
 * rating (null / the 0 sentinel) any 1–16.5 goal is accepted.
 */
export function planGoalInputError(value: number, currentUtr: number | null | undefined): string | null {
  if (!Number.isFinite(value) || value < 1 || value > 16.5) return "Enter a UTR between 1.00 and 16.50.";
  if (currentUtr != null && currentUtr > 0 && Math.round(value * 100) <= Math.round(currentUtr * 100)) {
    return `Your goal needs to be above your current UTR, ${formatPlayerUtr(currentUtr)}.`;
  }
  return null;
}

/* ==========================================================================
 * REALISTIC TARGETS (/plan's "Show realistic targets")
 * ==========================================================================
 * A target is realistic when the ONE estimate — the rating this module
 * projects to the summer before senior year — reaches its competitive
 * floor: the report's recruiting-time band is Target or Likely. A Reach is
 * by definition below the floor even at that estimate, and Out of range is
 * below it on the player's own logged pace too. For a player whose summer
 * has begun the recruiting band IS today's band.
 *
 * Read from the report built WITHOUT the what-if override: dragging the
 * slider must not change which targets are "realistic" for the player they
 * actually are.
 */
export function isRealisticTarget(report: FitReport | null, slug: string): boolean {
  const row = report?.rows.find((r) => r.slug === slug);
  return row != null && (row.recruitingBand === "target" || row.recruitingBand === "likely");
}

/** The caption to render under a projected number. Always paired with it —
 * the number alone is the thing this module exists to avoid. */
export function projectionAssumptionLabel(pace: GrowthPace = "normal"): string {
  return growthAssumptionLabel(pace);
}

/**
 * Band today vs band at the projection, per school.
 *
 * `classifySchoolFit` is called with NO projection argument on purpose. Its
 * third parameter answers a different question — "is this below-floor gap
 * closeable on this player's real trend?" — and feeding it the trajectory
 * here would apply growth twice: once to move the rating, once again inside
 * the Reach/Out-of-range split. The rating passed in has already moved.
 */
export function compareSchoolBands(
  schools: Pick<SchoolLite, "slug" | "minCompetitiveUTR" | "avgRosterUTR">[],
  currentUtr: number,
  projection: UtrProjection | null
): SchoolBandComparison[] {
  const BAND_RANK: Record<SchoolFitBand, number> = {
    "out-of-range": 0,
    reach: 1,
    target: 2,
    likely: 3,
  };

  return schools.map((school) => {
    const today = classifySchoolFit(fitBasis(currentUtr), school);
    const projected = projection ? classifySchoolFit(fitBasis(projection.normal), school) : today;
    return {
      slug: school.slug,
      today,
      projected,
      projectedSlow: projection ? classifySchoolFit(fitBasis(projection.slow), school) : today,
      projectedFast: projection ? classifySchoolFit(fitBasis(projection.fast), school) : today,
      improves: BAND_RANK[projected] > BAND_RANK[today],
    };
  });
}

export interface BandCounts {
  likely: number;
  target: number;
  reach: number;
  outOfRange: number;
}

/** Band totals at a given rating. Used to show the before/after the
 * trajectory makes — "2 targets today, 19 by junior year". */
export function countBands(
  schools: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">[],
  utr: number
): BandCounts {
  const counts: BandCounts = { likely: 0, target: 0, reach: 0, outOfRange: 0 };
  for (const school of schools) {
    const band = classifySchoolFit(fitBasis(utr), school);
    if (band === "out-of-range") counts.outOfRange++;
    else counts[band]++;
  }
  return counts;
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
export type FitView = "recruiting" | "today";

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
  return `${at} ${formatTargetUtr(utr.upside.value)}. We plan with ${formatPlayerUtr(utr.value)} instead. ${PLANNING_RULE_SENTENCE}`;
}

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

export interface FitRow {
  slug: string;
  /** Band in the selected view — what the row renders. */
  band: SchoolFitBand;
  /** Band at today's rating. */
  todayBand: SchoolFitBand;
  /** Band at the recruiting-time rating. */
  recruitingBand: SchoolFitBand;
  /** The two views disagree for this school, so the row should say so. */
  differs: boolean;
}

export interface FitReport {
  /** The rating that produced every number below. */
  utr: RecruitingTimeUtr;
  view: FitView;
  /** Counts for the SELECTED view. Headline, tabs and rows all read these,
   * which is the whole point: they cannot disagree. */
  counts: BandCounts;
  /**
   * "Programs in range" = target + likely. NOT including reach.
   *
   * This is the product's existing meaning — the trajectory panel has
   * always read `likely + target` — and it is the honest one: a Reach is
   * by definition a program you are not yet competitive for, so counting
   * it as "in range" would inflate every number a family reads. Defined
   * once here so the headline, the panel and the tabs cannot drift apart
   * on what the phrase means, which is the drift this whole module exists
   * to stop.
   */
  inRange: number;
  rows: FitRow[];
  bandBySlug: ReadonlyMap<string, SchoolFitBand>;
  /** Counts in each view, so a screen can show "today vs summer 2030"
   * without computing anything itself. */
  todayCounts: BandCounts;
  recruitingCounts: BandCounts;
  todayInRange: number;
  recruitingInRange: number;
  /** True only when a projection applies AND the two views actually differ.
   * A toggle that changes nothing is worse than no toggle. */
  canToggle: boolean;
}

function inRangeOf(c: BandCounts): number {
  return c.target + c.likely;
}

function sameCounts(a: BandCounts, b: BandCounts): boolean {
  return (
    a.likely === b.likely &&
    a.target === b.target &&
    a.reach === b.reach &&
    a.outOfRange === b.outOfRange
  );
}

/**
 * THE ONLY PLACE THAT TURNS A RATING INTO BANDS.
 *
 * Returns null when there is no usable rating — every surface renders its
 * honest prompt for that case and shows no bands at all.
 *
 * `projectionInput` is the player's logged history. It does two jobs:
 *  - it tells a closeable Reach from a genuine Out-of-range — in the today
 *    view, the recruiting view and the what-if alike, so one rating on one
 *    date always gets one band;
 *  - its `utrHistory` is handed to recruitingTimeUtr, so a player with a
 *    logged rating 5–13 months old is projected at THEIR pace (rule 2), the
 *    same number the onboarding diagnostic showed them before sign-up.
 *    Synthetic points (the homepage's realistic-pace line) are marked and
 *    never read as a pace, so a pre-auth visitor still gets typical growth.
 */
export function buildFitReport(input: {
  currentUtr: number | null | undefined;
  graduationYear: number;
  gender: PlayerGender;
  schools: Pick<SchoolLite, "slug" | "minCompetitiveUTR" | "avgRosterUTR">[];
  view?: FitView;
  /** Logged history: the Reach / Out-of-range split, and the pace rule. */
  projectionInput?: SchoolFitProjectionInput;
  /**
   * A rating the player has explicitly chosen — the what-if slider's "what
   * if I were X by senior summer". It is ALREADY a future number, so it is
   * used exactly as given with no projection applied: running it through
   * recruitingTimeUtr would add growth to a figure that already contains
   * growth, and the slider would quietly overshoot.
   */
  overrideUtr?: number | null;
  /**
   * The recruiting-time rating, already decided by recruitingTimeUtr() —
   * only ever `diagnosticProjection(...).recruiting`. The diagnostic needs
   * it because, with ONE past rating, its Reach/Out-of-range split runs on
   * the pre-auth realistic-pace line (P1-FIT-4) while the rating must still
   * come from the real answer. Absent → recruitingTimeUtr() decides from
   * `projectionInput`, as everywhere else.
   */
  recruitingUtr?: RecruitingTimeUtr | null;
  now?: Date;
}): FitReport | null {
  const override =
    input.overrideUtr != null && Number.isFinite(input.overrideUtr) && input.overrideUtr > 0
      ? input.overrideUtr
      : null;

  const utr: RecruitingTimeUtr | null = override
    ? {
        value: override,
        basis: "current",
        low: override,
        high: override,
        assumption: null,
        year: input.graduationYear - 2,
        isProjected: false,
        source: "current",
        pace: null,
        planningPacePerYear: null,
        upside: null,
        cappedByCeiling: false,
      }
    : input.recruitingUtr ??
      recruitingTimeUtr({
        currentUtr: input.currentUtr,
        graduationYear: input.graduationYear,
        gender: input.gender,
        now: input.now,
        history: input.projectionInput?.utrHistory,
      });
  if (!utr) return null;

  const current = override ?? (input.currentUtr as number);
  // The Reach / Out-of-range split is a band too, so it plans with the same
  // cap as the rating: the trend through the logged ratings is never carried
  // faster than PLANNING_PACE_CAP_PER_YEAR from the latest one
  // (classifySchoolFit). A hot streak shows as the upside, not as Reach.
  const splitInput: SchoolFitProjectionInput | undefined = input.projectionInput
    ? { ...input.projectionInput, paceCapPerYear: PLANNING_PACE_CAP_PER_YEAR }
    : undefined;
  const todayBasis = fitBasis(current, splitInput);

  // ONE rule for Reach vs Out of range, in every view and in the what-if:
  // the pace in the player's REAL logged ratings, evaluated at the summer
  // before senior year (classifySchoolFit), exactly as /methodology states
  // it. Fewer than three logged ratings → Reach, because a gap cannot be
  // shown to be too big. The rating decides Likely/Target/below-floor; the
  // history only splits below-floor, at the same date — so nothing grows
  // twice.
  //
  // Until 2026-11-16 the recruiting view instead grew the projected rating
  // a further 1.5 years at slow pace — a leftover from when the projection
  // stopped at junior year. With the target at the summer before senior
  // year that was growth past the point coaches decide, and it banded the
  // same rating on the same date two ways: persona (a)'s default view said
  // Reach 10 · Out of range 3, and typing the identical 12.2 into the
  // what-if said Reach 0 · Out of range 13 (independent verifier, H1).
  const recruitingBasis = fitBasis(utr.value, splitInput);

  const todayCounts: BandCounts = { likely: 0, target: 0, reach: 0, outOfRange: 0 };
  const recruitingCounts: BandCounts = { likely: 0, target: 0, reach: 0, outOfRange: 0 };
  const rows: FitRow[] = [];
  const bandBySlug = new Map<string, SchoolFitBand>();

  const bump = (c: BandCounts, b: SchoolFitBand) => {
    if (b === "out-of-range") c.outOfRange++;
    else c[b]++;
  };

  for (const school of input.schools) {
    const todayBand = classifySchoolFit(todayBasis, school);
    const recruitingBand = utr.isProjected
      ? classifySchoolFit(recruitingBasis, school)
      : todayBand;
    bump(todayCounts, todayBand);
    bump(recruitingCounts, recruitingBand);
    rows.push({ slug: school.slug, band: todayBand, todayBand, recruitingBand, differs: todayBand !== recruitingBand });
  }

  const differ = utr.isProjected && !sameCounts(todayCounts, recruitingCounts);
  // Pre-junior players default to the recruiting view: it is the question
  // they are actually asking, and "every program is a Reach" is a true,
  // useless answer about a 13-year-old.
  const view: FitView = input.view ?? (utr.isProjected ? "recruiting" : "today");
  const counts = view === "recruiting" ? recruitingCounts : todayCounts;

  for (const row of rows) {
    row.band = view === "recruiting" ? row.recruitingBand : row.todayBand;
    bandBySlug.set(row.slug, row.band);
  }

  return {
    utr,
    view,
    counts,
    inRange: inRangeOf(counts),
    rows,
    bandBySlug,
    todayCounts,
    recruitingCounts,
    todayInRange: inRangeOf(todayCounts),
    recruitingInRange: inRangeOf(recruitingCounts),
    canToggle: differ,
  };
}

/* ==========================================================================
 * THE ONBOARDING DIAGNOSTIC'S PROJECTION
 * ==========================================================================
 * /onboarding asks for today's UTR and, optionally, what it was about 6 and
 * about 12 months ago. Those answers become dated ratings — at the same
 * local dates sign-up saves them to utr_entries (pastRatingDate in
 * lib/onboarding/diagnostic.ts) — and go through recruitingTimeUtr(), the
 * one rule the app uses:
 *
 *   year-ago rating given   their pace, (today − year ago) / 12 per month
 *   else 6-month rating     their pace, (today − 6 months ago) / 6
 *   neither                 the typical-growth estimate, labelled as such
 *   summer already begun    today's rating
 *
 * carried to June 1 of (grad year − 1). A rating that went down is held at
 * today's. Because it is the same function with the same dated inputs, the
 * summer number on the diagnostic's card is the number the signed-in app
 * shows after sign-up (lib/fit-onboarding-consistency.test.ts).
 *
 * Until 2026-11-18 the diagnostic had its own rule and showed TODAY's rating
 * when no past rating was given; the app then showed the typical-growth
 * estimate. See docs/DECISIONS.md, "One projection rule for onboarding and
 * the app".
 */

export type DiagnosticProjectionBasis = "logged-pace" | "typical-growth" | "summer-started";

export interface DiagnosticProjection {
  /** The rating at the summer before senior year — `recruiting.value`. */
  value: number;
  /** How to print `value`: one decimal for a projection (it does not have
   * two decimals of precision), the player's own figure when it IS today's
   * rating. */
  display: string;
  todayUtr: number;
  basis: DiagnosticProjectionBasis;
  /** True whenever the number is a projection rather than today's rating. */
  isEstimate: boolean;
  /** The player's own pace from a past answer, UTR a year (playerPacePerYear;
   * print it with formatPacePerYear). 0 when none was. The projection uses
   * min(this, PLANNING_PACE_CAP_PER_YEAR). */
  pacePerYear: number;
  /** The upside sentence when the answers' pace is above the cap — also the
   * `note`, so the card says it once. Null otherwise. */
  upside: string | null;
  /** Months (fractional) from now to the target; 0 once it has begun. */
  monthsToTarget: number;
  /** "summer {targetYear}". Always grad year − 1. */
  targetYear: number;
  /** The one-line sentence that must sit beside the number. */
  note: string;
  cappedByCeiling: boolean;
  /** The recruitingTimeUtr() result this was read from — what the fit
   * report bands at. */
  recruiting: RecruitingTimeUtr;
}

/** A rating Postgres would accept (`between 1 and 16.5`, migration 006). */
export function isUsableUtr(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 16.5;
}

/** The note when the summer before senior year has already begun. */
export const SUMMER_STARTED_NOTE = "The summer before senior year has started, so this is today's UTR.";

/**
 * The diagnostic's past answers as dated ratings: local midnight of the day
 * 12 and 6 months before `now` — the dates sign-up writes them at. Oldest
 * first; an answer that is not a usable rating is left out.
 */
function diagnosticPastRatings(input: {
  sixMonthsAgoUtr?: number | null;
  yearAgoUtr?: number | null;
  now: Date;
}): UtrDataPoint[] {
  const at = (monthsAgo: number) => parseLocalDate(toLocalDateString(shiftLocalMonths(input.now, -monthsAgo)));
  const out: UtrDataPoint[] = [];
  if (isUsableUtr(input.yearAgoUtr)) out.push({ date: at(12), utr: input.yearAgoUtr });
  if (isUsableUtr(input.sixMonthsAgoUtr)) out.push({ date: at(6), utr: input.sixMonthsAgoUtr });
  return out;
}

/** The diagnostic's projection: recruitingTimeUtr() over its answers, in the
 * shape its card prints. Null without a usable rating today. */
export function diagnosticProjection(input: {
  todayUtr: number | null | undefined;
  sixMonthsAgoUtr?: number | null;
  yearAgoUtr?: number | null;
  graduationYear: number;
  gender: PlayerGender;
  now?: Date;
}): DiagnosticProjection | null {
  const today = input.todayUtr;
  if (!isUsableUtr(today)) return null;
  const now = input.now ?? new Date();
  const recruiting = recruitingTimeUtr({
    currentUtr: today,
    graduationYear: input.graduationYear,
    gender: input.gender,
    now,
    history: diagnosticPastRatings({ ...input, now }),
  });
  if (!recruiting) return null;

  const basis: DiagnosticProjectionBasis =
    recruiting.source === "current" ? "summer-started" : recruiting.source;
  return {
    value: recruiting.value,
    display: recruiting.value === today ? formatPlayerUtr(today) : formatUtrEstimate(recruiting.value),
    todayUtr: today,
    basis,
    isEstimate: recruiting.isProjected,
    pacePerYear: recruiting.pace?.perYear ?? 0,
    upside: paceUpsideSentence(recruiting),
    monthsToTarget: yearsUntilRecruiting(input.graduationYear, now) * 12,
    targetYear: recruiting.year,
    note: recruiting.assumption ?? SUMMER_STARTED_NOTE,
    cappedByCeiling: recruiting.cappedByCeiling,
    recruiting,
  };
}

/**
 * The onboarding diagnostic's whole fit report: its projection, and the
 * bands judged at exactly that number.
 *
 * Reach vs Out of range uses the three real answered ratings when all three
 * exist (today, ~6 and ~12 months ago — the "three logged ratings"
 * /methodology asks for). With fewer it falls back to the realistic-pace
 * line every pre-auth surface already uses (P1-FIT-4), rather than calling
 * every below-floor school a Reach.
 */
export function buildDiagnosticFitReport(input: {
  todayUtr: number | null | undefined;
  sixMonthsAgoUtr?: number | null;
  yearAgoUtr?: number | null;
  graduationYear: number;
  gender: PlayerGender;
  schools: Pick<SchoolLite, "slug" | "minCompetitiveUTR" | "avgRosterUTR">[];
  view?: FitView;
  now?: Date;
}): { projection: DiagnosticProjection; report: FitReport } | null {
  const now = input.now ?? new Date();
  const projection = diagnosticProjection({ ...input, now });
  if (!projection) return null;
  const today = projection.todayUtr;
  const past = diagnosticPastRatings({ ...input, now });

  const projectionInput: SchoolFitProjectionInput =
    past.length === 2
      ? {
          utrHistory: [...past, { date: now, utr: today }],
          graduationYear: input.graduationYear,
          gender: input.gender,
          now,
        }
      : realisticPaceProjectionFor({
          currentUTR: today,
          graduationYear: input.graduationYear,
          gender: input.gender,
          now,
        });

  const report = buildFitReport({
    currentUtr: today,
    graduationYear: input.graduationYear,
    gender: input.gender,
    schools: input.schools,
    view: input.view,
    projectionInput,
    recruitingUtr: projection.recruiting,
    now,
  });
  return report ? { projection, report } : null;
}

/**
 * "Closest schools to you" on /plan — read off the fit report, never
 * classified again. Ranked by the real gap from the rating that judged the
 * bands (`report.utr.value`: the planning estimate before the summer before
 * senior year, today's rating after) to each team's estimated average, ties
 * broken by distance to the floor; each row carries the report's own band.
 *
 * It used to rank and band against TODAY's rating with an uncapped trend
 * (closestSchoolsByUtrGap), so its chips could disagree with the same
 * school's chip on /schools. `catalog` must be the schools the report was
 * built over; a school the report has no band for is left out.
 */
export function closestSchoolsFromReport(
  report: FitReport | null | undefined,
  catalog: readonly SchoolLite[],
  limit = 5
): ClosestSchoolResult[] {
  if (!report) return [];
  const utr = report.utr.value;
  const out: ClosestSchoolResult[] = [];
  for (const school of catalog) {
    const band = report.bandBySlug.get(school.slug);
    if (!band) continue;
    out.push({ school, gap: Math.round((school.avgRosterUTR - utr) * 100) / 100, band });
  }
  return out
    .sort(
      (a, b) =>
        Math.abs(a.gap) - Math.abs(b.gap) ||
        Math.abs(a.school.minCompetitiveUTR - utr) - Math.abs(b.school.minCompetitiveUTR - utr)
    )
    .slice(0, limit);
}
