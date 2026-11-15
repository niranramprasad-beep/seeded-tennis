import type { PlayerGender, SchoolLite } from "@/lib/types";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import {
  RECRUITING_GRADE,
  UTR_GROWTH_PER_YEAR,
  growthAssumptionLabel,
  type GrowthPace,
} from "@/lib/config/growth";
import { getCurrentGrade } from "@/lib/time";
import { classifySchoolFit, type SchoolFitBand } from "@/lib/school-fit";

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
    const today = classifySchoolFit(currentUtr, school);
    const projected = projection ? classifySchoolFit(projection.normal, school) : today;
    return {
      slug: school.slug,
      today,
      projected,
      projectedSlow: projection ? classifySchoolFit(projection.slow, school) : today,
      projectedFast: projection ? classifySchoolFit(projection.fast, school) : today,
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
    const band = classifySchoolFit(utr, school);
    if (band === "out-of-range") counts.outOfRange++;
    else counts[band]++;
  }
  return counts;
}
