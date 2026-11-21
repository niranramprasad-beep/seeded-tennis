// The fit engine — BANDS. The only place a rating becomes bands
// (buildFitReport), and what screens read off the report.
//
// Moved verbatim from lib/fit.ts on 2026-11-21 (the fit.ts split; every
// declaration below is byte-identical to the original, which
// lib/fit-split-purity.test.ts checks). Import from "@/lib/fit", never from
// this file: lib/fit.ts is the engine's public entry point, and
// lib/fit/engine-files.ts lists the files the guard tests treat as
// "lib/fit.ts". "This module" and "here" in the comments below mean the fit
// engine as a whole.

import type { PlayerGender, SchoolLite } from "@/lib/types";
import {
  classifySchoolFit,
  fitBasis,
  type ClosestSchoolResult,
  type SchoolFitBand,
  type SchoolFitProjectionInput,
} from "@/lib/school-fit";
import { PLANNING_PACE_CAP_PER_YEAR } from "@/lib/fit/pace";
import {
  recruitingTimeUtr,
  type RecruitingTimeUtr,
  type UtrProjection,
} from "@/lib/fit/projection";

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

export type FitView = "recruiting" | "today";

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
