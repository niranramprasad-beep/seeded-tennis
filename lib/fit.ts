import type { PlayerGender, SchoolLite } from "@/lib/types";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import {
  RECRUITING_GRADE,
  UTR_GROWTH_PER_YEAR,
  growthAssumptionLabel,
  type GrowthPace,
} from "@/lib/config/growth";
import { getCurrentGrade } from "@/lib/time";
import { syntheticUtrHistoryFor } from "@/lib/what-if-utr";
import { summerBeforeSeniorYear } from "@/lib/school-fit";
import {
  classifySchoolFit,
  fitBasis,
  type SchoolFitBand,
  type SchoolFitProjectionInput,
} from "@/lib/school-fit";

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
// look?", and junior year is when they look.
//
// WHY IT IS SEPARATE FROM lib/school-fit.ts. That module answers "given a
// UTR, what band is this school?" — it is the classifier, and it is already
// shared by six screens. This one answers "what UTR, and when?". Keeping
// them apart means the projection can change without touching banding, and
// the banding rules stay the single thing every screen agrees on.

export interface UtrProjection {
  /** Projected UTR at recruiting time, by pace. Equal to `currentUtr` for a
   * player already at or past junior year. */
  slow: number;
  normal: number;
  fast: number;
  /** Calendar year junior year falls in. */
  recruitingYear: number;
  /** Years of growth applied. 0 once the player is a junior or older. */
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

/** Years between now and junior year, floored at zero. */
export function yearsUntilRecruiting(graduationYear: number, now: Date = new Date()): number {
  const grade = getCurrentGrade(graduationYear, now);
  return Math.max(0, RECRUITING_GRADE - grade);
}

/**
 * Projects a UTR forward to junior year at each pace.
 *
 * Returns `null` when there is no current UTR. Deliberately null rather than
 * a default: there is no honest projection from a number we do not have, and
 * a caller that forgets to handle it should break loudly rather than render
 * a guess. The fit report shows an empty state for this case.
 *
 * **A junior or senior gets their current rating back, at every pace.** They
 * are being recruited now; projecting growth onto them would invent a better
 * player than the one coaches are looking at, in the exact months when that
 * matters most.
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
  const recruitingYear = graduationYear - (13 - RECRUITING_GRADE);
  const ceiling = REALISTIC_UTR_CEILING[gender];

  const at = (pace: GrowthPace) => {
    const raw = currentUtr + UTR_GROWTH_PER_YEAR[pace] * years;
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

export interface RecruitingTimeUtr {
  /** The rating that judges fit. */
  value: number;
  /** Whether `value` is a projection or the rating the player holds now. */
  basis: FitBasisKind;
  /** Slow / fast ends of the assumption. Equal to `value` when basis is
   * "current" — a junior is not given a range they might grow into. */
  low: number;
  high: number;
  /** The sentence that must appear wherever `value` does. Null when the
   * number is simply the player's real rating and needs no caveat. */
  assumption: string | null;
  /** Calendar year `value` refers to. */
  year: number;
  /** True when a projection was applied, i.e. the player is pre-junior. */
  isProjected: boolean;
}

/**
 * THE ONLY PLACE THAT DECIDES WHICH UTR JUDGES FIT.
 *
 *  - Before junior year → the normal-pace projection to junior year, with
 *    slow/fast as the range. A 13-year-old's rating is not the rating
 *    coaches will look at, and banding against it is the bug this exists
 *    to fix.
 *  - Junior or senior → today's rating, unchanged, at every pace. They are
 *    being recruited now; projecting growth onto them invents a better
 *    player than the one coaches are watching, in the months when that
 *    matters most.
 *  - No usable rating → null. Not a default, not a zero: callers must
 *    render an honest prompt, and one that forgets should break loudly.
 */
export function recruitingTimeUtr(input: {
  currentUtr: number | null | undefined;
  graduationYear: number;
  gender: PlayerGender;
  now?: Date;
}): RecruitingTimeUtr | null {
  const projection = projectUtrAtRecruiting(input);
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
  /** Counts in each view, so a screen can show "today vs junior year"
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
 * `projectionInput` is the player's REAL logged history, used only to tell
 * a closeable Reach from a genuine Out-of-range. It is deliberately NOT
 * applied to the recruiting-time view: that rating has already moved, and
 * feeding the trend in again would apply growth twice.
 */
export function buildFitReport(input: {
  currentUtr: number | null | undefined;
  graduationYear: number;
  gender: PlayerGender;
  schools: Pick<SchoolLite, "slug" | "minCompetitiveUTR" | "avgRosterUTR">[];
  view?: FitView;
  /** Real history, for the Reach / Out-of-range split at today's rating. */
  projectionInput?: SchoolFitProjectionInput;
  /**
   * A rating the player has explicitly chosen — the what-if slider's "what
   * if I were X by senior summer". It is ALREADY a future number, so it is
   * used exactly as given with no projection applied: running it through
   * recruitingTimeUtr would add growth to a figure that already contains
   * growth, and the slider would quietly overshoot.
   */
  overrideUtr?: number | null;
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
      }
    : recruitingTimeUtr(input);
  if (!utr) return null;

  const current = override ?? (input.currentUtr as number);
  const todayBasis = fitBasis(current, input.projectionInput);

  // The recruiting basis gets a FLAT projection at the projected rating,
  // not no projection at all.
  //
  // Passing nothing meant "below the team floor" fell through to Reach for
  // every school, so a Class of 2029 player's Reach count jumped from 2 in
  // the Today view to 31 in the junior-year view — reading as "29 more
  // programs come within reach", when what actually happened is that the
  // view stopped being able to tell Reach from Out-of-range. Found by
  // walking persona (b), not by a test.
  //
  // The curve continues at the SLOW end of the realistic band from junior
  // year to the summer before senior year, which is the window
  // classifySchoolFit measures a Reach against.
  //
  // Flat was the first attempt and it was too blunt: it made Reach
  // impossible in the junior-year view, so toggling persona (a) showed
  // Reach going 37 → 0, which reads as "I lost all my reaches" rather than
  // "those became targets". The residual window is real — players do keep
  // improving through junior year — and taking the conservative end of the
  // band keeps it a floor rather than a promise.
  const residualYears = Math.max(
    0,
    (summerBeforeSeniorYear(input.graduationYear).getTime() - (input.now ?? new Date()).getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
  );
  const recruitingBasis = fitBasis(utr.value, {
    utrHistory: syntheticUtrHistoryFor({
      currentUTR: utr.value,
      targetUTR: utr.value + UTR_GROWTH_PER_YEAR.slow * Math.min(residualYears, 1.5),
      graduationYear: input.graduationYear,
      now: input.now,
    }),
    graduationYear: input.graduationYear,
    gender: input.gender,
    now: input.now,
  });

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
