import type { PlayerGender, SchoolLite } from "@/lib/types";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import {
  UTR_GROWTH_PER_YEAR,
  growthAssumptionLabel,
  type GrowthPace,
} from "@/lib/config/growth";
import { summerBeforeSeniorYear } from "@/lib/school-fit";
import { shiftLocalMonths } from "@/lib/time";
import { realisticPaceProjectionFor } from "@/lib/what-if-utr";
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
 *  - Before the summer before senior year → the normal-pace projection to
 *    that summer, with slow/fast as the range. A 13-year-old's rating is
 *    not the rating coaches will look at, and banding against it is the bug
 *    this exists to fix.
 *  - Once that summer has begun → today's rating, unchanged, at every pace.
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
 * `projectionInput` is the player's REAL logged history, used only to tell
 * a closeable Reach from a genuine Out-of-range — in the today view, the
 * recruiting view and the what-if alike, so one rating on one date always
 * gets one band. It never moves the rating itself.
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
  /**
   * The recruiting-time rating, already decided by this module — only ever
   * `diagnosticRecruitingUtr(diagnosticProjection(...))`, so the onboarding
   * diagnostic's report bands at the SAME number its "Projected UTR" card
   * shows. Absent → recruitingTimeUtr() decides, as everywhere else.
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
      }
    : input.recruitingUtr ?? recruitingTimeUtr(input);
  if (!utr) return null;

  const current = override ?? (input.currentUtr as number);
  const todayBasis = fitBasis(current, input.projectionInput);

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
  const recruitingBasis = fitBasis(utr.value, input.projectionInput);

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
 * about 12 months ago. That is the player's OWN pace, so the diagnostic
 * carries it forward instead of assuming typical growth:
 *
 *   year-ago rating given   pace = (today − year ago) / 12 per month
 *   else 6-month rating     pace = (today − 6 months ago) / 6 per month
 *   neither                 today's rating, and the note says so
 *
 * carried to June 1 of (grad year − 1), the summer before senior year —
 * projectionTargetDate(), the one target every screen uses.
 *
 * Three cases deliberately return TODAY'S rating rather than a forecast,
 * each with a sentence saying why: no past rating (no pace to carry), the
 * summer before senior year has already started (nothing left to project
 * into — the same rule as projectUtrAtRecruiting), and a rating that went
 * DOWN (a dip after an injury or a hard schedule is not a trend a
 * 13-year-old should be told to expect; extrapolating it would be a guess
 * presented as their pace).
 *
 * Caps are the ones buildFitReport's projection already uses: the
 * per-gender REALISTIC_UTR_CEILING, rounded to one decimal. The ceiling only
 * caps GROWTH — it never pulls a real rating that is already above it down.
 */

export type DiagnosticProjectionBasis =
  | "year-pace"
  | "six-month-pace"
  | "no-past-rating"
  | "rating-went-down"
  | "summer-started";

export interface DiagnosticProjection {
  /** The rating at the summer before senior year. Equal to `todayUtr`
   * unless `isEstimate`. */
  value: number;
  /** How to print `value`: one decimal for an estimate (a projection does
   * not have two decimals of precision), the player's own figure otherwise. */
  display: string;
  todayUtr: number;
  basis: DiagnosticProjectionBasis;
  /** True only when a pace was carried forward over a real window. */
  isEstimate: boolean;
  /** UTR per month that was carried forward; 0 when none was. */
  pacePerMonth: number;
  /** Months (fractional) from now to the target; 0 once it has begun. */
  monthsToTarget: number;
  /** "summer {targetYear}". Always grad year − 1. */
  targetYear: number;
  /** The one-line sentence that must sit beside the number. */
  note: string;
  cappedByCeiling: boolean;
}

/** A rating Postgres would accept (`between 1 and 16.5`, migration 006). */
export function isUsableUtr(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 16.5;
}

/** The player's own figure as they typed it: 8.25 → "8.25", 9 → "9.0". */
export function playerUtrText(v: number): string {
  return v.toFixed(2).replace(/(\.\d)0$/, "$1");
}

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
  const targetYear = projectionTargetDate(input.graduationYear).getFullYear();
  const monthsToTarget = yearsUntilRecruiting(input.graduationYear, now) * 12;
  const asToday = (basis: DiagnosticProjectionBasis, note: string): DiagnosticProjection => ({
    value: today,
    display: playerUtrText(today),
    todayUtr: today,
    basis,
    isEstimate: false,
    pacePerMonth: 0,
    monthsToTarget,
    targetYear,
    note,
    cappedByCeiling: false,
  });

  if (monthsToTarget === 0) {
    return asToday(
      "summer-started",
      "The summer before senior year has started, so this is today's UTR."
    );
  }

  let basis: DiagnosticProjectionBasis;
  let pacePerMonth: number;
  if (isUsableUtr(input.yearAgoUtr)) {
    basis = "year-pace";
    pacePerMonth = (today - input.yearAgoUtr) / 12;
  } else if (isUsableUtr(input.sixMonthsAgoUtr)) {
    basis = "six-month-pace";
    pacePerMonth = (today - input.sixMonthsAgoUtr) / 6;
  } else {
    return asToday("no-past-rating", "No past rating, so this is today's UTR.");
  }

  if (pacePerMonth < 0) {
    return asToday("rating-went-down", "The rating went down, so this stays at today's UTR.");
  }

  const cap = Math.max(REALISTIC_UTR_CEILING[input.gender], today);
  const raw = today + pacePerMonth * monthsToTarget;
  const capped = raw > cap;
  const value = Math.round(Math.min(cap, raw) * 10) / 10;
  const window = basis === "year-pace" ? "12 months" : "6 months";
  return {
    value,
    display: value.toFixed(1),
    todayUtr: today,
    basis,
    isEstimate: true,
    pacePerMonth,
    monthsToTarget,
    targetYear,
    note: capped
      ? `Pace from the last ${window}, capped near the top of college tennis.`
      : `Pace from the last ${window}, carried to June ${targetYear}.`,
    cappedByCeiling: capped,
  };
}

/** The diagnostic's projection in the shape buildFitReport judges fit by.
 * An estimate has no slow/fast spread (it is the player's own pace, not the
 * typical-growth assumption); today's rating is today's. */
export function diagnosticRecruitingUtr(p: DiagnosticProjection): RecruitingTimeUtr {
  return {
    value: p.value,
    basis: p.isEstimate ? "projected" : "current",
    low: p.value,
    high: p.value,
    assumption: p.isEstimate ? p.note : null,
    year: p.targetYear,
    isProjected: p.isEstimate,
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
  const six = input.sixMonthsAgoUtr;
  const year = input.yearAgoUtr;

  const projectionInput: SchoolFitProjectionInput =
    isUsableUtr(six) && isUsableUtr(year)
      ? {
          utrHistory: [
            { date: shiftLocalMonths(now, -12), utr: year },
            { date: shiftLocalMonths(now, -6), utr: six },
            { date: now, utr: today },
          ],
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
    recruitingUtr: diagnosticRecruitingUtr(projection),
    now,
  });
  return report ? { projection, report } : null;
}
