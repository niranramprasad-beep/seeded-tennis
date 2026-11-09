// Buckets a school into a fit band for a given player — the one place this
// math happens (see lib/time.ts for the equivalent pattern around grade
// math). Shared by the homepage's live fit-calculator preview, onboarding's
// fit report, the Schools browser, School Profile, and Today's action list;
// all of them should always agree.
//
// ---------------------------------------------------------------------
// WHAT'S REAL vs APPROXIMATED (read this before changing the thresholds)
// ---------------------------------------------------------------------
// The real methodology (see /methodology) is a 4-band model: Likely / Target
// / Reach / Out-of-range, where Reach-vs-Out-of-range is decided by
// projecting the player's REAL UTR history forward (lib/utr-projection.ts's
// weighted regression) to the summer before senior year, and checking
// whether that projection would close the gap to the team's floor.
//
// Fully real today:
//   - The Likely/Target boundary (team median) and Target/Reach-or-below
//     boundary (team floor) — both read straight from each school's real
//     `avgRosterUTR` / `minCompetitiveUTR`.
//   - The Reach vs Out-of-range split, WHEN the caller supplies real UTR
//     history (>=3 logged entries) and a grad year: this runs the same
//     regression /today and /plan already chart, projected to the real
//     "summer before senior year" date (lib/time.ts's
//     getSummerBeforeGradeYear, June 1 convention — see
//     plan-trajectory-chart.tsx).
//
// Approximated / honestly incomplete, because the school data model
// (lib/types.ts's School/SchoolLite) only carries TWO real UTR reference
// points per school — `minCompetitiveUTR` and `avgRosterUTR` — not a real
// per-player roster:
//   - There is no real "high" value. `schoolUtrRange()` below mirrors the
//     gap below the average to above it as the most defensible symmetric
//     estimate from data we actually have — it is NOT a recorded team
//     maximum. Every caller that displays it captions it as a plain numeric
//     range ("team 8.8–10.6"), never as a verified high, so it doesn't
//     overclaim.
//   - There are no per-player reliability flags, no real roster-verified
//     date, no real Confidence (High/Medium/Low), and no real
//     players-leaving count. None of those are fabricated anywhere in this
//     file or its callers — where the product needs them, it shows "Not
//     tracked" (see DataChip usage in the Schools browser / School Profile)
//     instead of making a number up.
//   - When a caller can't supply >=3 real UTR history points (no account
//     yet, e.g. the homepage calculator and onboarding's pre-auth step),
//     classifySchoolFit falls back to the old 3-way reach/target/likely
//     read and NEVER returns "out-of-range" — a below-floor school always
//     reads as "reach" rather than fabricating a claim that the gap is
//     unclosable without real pace data to back it up.
import type { SchoolLite, PlayerGender } from "@/lib/types";
import type { FitBand } from "@/components/seeded/ui/fit-badge";
import { computeUtrProjection, type UtrDataPoint } from "@/lib/utr-projection";
import { getSummerBeforeGradeYear, formatDate, localDateKey } from "@/lib/time";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import { academicTier } from "@/lib/school-academics";
import { regionForState } from "@/lib/school-regions";

export type SchoolFitBand = Exclude<FitBand, "unverified">;

/**
 * Real UTR history + grad-year context needed to tell Reach apart from
 * Out-of-range. Optional — omit it entirely for callers that genuinely have
 * no persisted history yet (pre-auth flows: the homepage calculator and
 * onboarding's step-1 fit report, where the UTR is just typed in, not
 * backed by an account or any logged entries).
 */
export interface SchoolFitProjectionInput {
  /** Real logged UTR history, e.g. loadUtrEntries() rows mapped to
   * {date, utr}. Needs >= 3 points for a trend — see
   * MIN_POINTS_FOR_PROJECTION in lib/utr-projection.ts. Fewer points (or
   * omitting this field) means Reach is the honest default: there isn't
   * enough signal yet to claim a gap is unclosable. */
  utrHistory: UtrDataPoint[];
  /** Used to compute "the summer before senior year" (lib/time.ts). */
  graduationYear: number;
  /** Tightens the projection's realistic ceiling to the player's real
   * per-gender cap (lib/config/recruiting.ts). Omit to fall back to the
   * higher of the two gender caps — the same default computeUtrProjection
   * uses on its own. */
  gender?: PlayerGender;
  /** Injectable for tests; defaults to `new Date()`. */
  now?: Date;
}

/** "Summer" = June 1, the same convention plan-trajectory-chart.tsx already
 * uses for roadmap checkpoints (`new Date(calendarYear, 5, 1)`) — kept
 * identical so a player's roadmap and their fit band never disagree about
 * what "the summer before senior year" means. Exported so the what-if
 * slider (lib/what-if-utr.ts) anchors to the exact same date instead of
 * forking a second "senior summer" calculation. */
export function summerBeforeSeniorYear(graduationYear: number): Date {
  const year = getSummerBeforeGradeYear(graduationYear, 12);
  return new Date(year, 5, 1);
}

export function classifySchoolFit(
  playerUtr: number,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">,
  projection?: SchoolFitProjectionInput
): SchoolFitBand {
  if (playerUtr >= school.avgRosterUTR) return "likely";
  if (playerUtr >= school.minCompetitiveUTR) return "target";

  // Below the team floor: whether this is a closeable Reach or a genuine
  // Out-of-range depends on projecting the player's REAL improvement pace
  // forward to the summer before senior year — never a static comparison.
  if (!projection) return "reach";
  const computed = computeUtrProjection(
    projection.utrHistory,
    projection.gender ? { ceiling: REALISTIC_UTR_CEILING[projection.gender] } : undefined
  );
  if (!computed) return "reach"; // <3 real points — can't prove a gap is unclosable.

  const now = projection.now ?? new Date();
  const milestone = summerBeforeSeniorYear(projection.graduationYear);
  // If the milestone has already passed (player is already a senior or
  // beyond), there's no future window left to project into — evaluate the
  // pace as of right now instead of extrapolating into a date that's gone.
  const evalDate = milestone.getTime() > now.getTime() ? milestone : now;
  const projected = computed.predict(evalDate);
  return projected >= school.minCompetitiveUTR ? "reach" : "out-of-range";
}

export interface FitCounts {
  reach: number;
  target: number;
  likely: number;
  outOfRange: number;
}

export function countSchoolFits(
  playerUtr: number,
  schools: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">[],
  projection?: SchoolFitProjectionInput
): FitCounts {
  const counts: FitCounts = { reach: 0, target: 0, likely: 0, outOfRange: 0 };
  for (const school of schools) {
    const fit = classifySchoolFit(playerUtr, school, projection);
    if (fit === "out-of-range") counts.outOfRange++;
    else counts[fit]++;
  }
  return counts;
}

/** The displayed "team range" for a RangeBar row — derived from the same two
 * real fields, mirroring the gap below the average to above it (there's no
 * stored upper bound, so this is the most defensible symmetric estimate
 * from data we actually have, not an invented constant). Not a recorded
 * team maximum — every caller captions it as a plain numeric range, never
 * as a verified high. */
export function schoolUtrRange(
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">
): { min: number; max: number } {
  const spread = school.avgRosterUTR - school.minCompetitiveUTR;
  return { min: school.minCompetitiveUTR, max: school.avgRosterUTR + spread };
}

// Fixed reference scale so every RangeBar on a page is visually comparable
// to every other one (not auto-scaled per row) — covers the full catalog's
// real range (~8.1–14.3) with margin on both ends.
export const SCHOOL_UTR_SCALE = { min: 6, max: 15 };

export function utrToPct(utr: number): number {
  const { min, max } = SCHOOL_UTR_SCALE;
  return Math.min(100, Math.max(0, ((utr - min) / (max - min)) * 100));
}

// ---------------------------------------------------------------------
// FULL EXPLANATION OBJECT — "why this band" for a given player + school
// ---------------------------------------------------------------------
// Everything below builds on classifySchoolFit above (same band, same real
// school fields, same real projection) to answer "why" in plain language,
// with real numbers wherever one exists and an honest "not tracked" where
// one doesn't. Shown on the Schools table's expanded row, School Profile's
// "Why this band" card, and Plan's target-schools list — all three read
// from this one function so they can never disagree.

/** Most players' realistic year-over-year UTR improvement — used only as a
 * plain-language yardstick for the "UTR/year needed" read (point 5 of the
 * redesign spec). Not a hard cap like REALISTIC_UTR_CEILING; a player can
 * genuinely beat it, the same way classifySchoolFit's own Reach/Out-of-range
 * split is decided by the player's REAL slope, not this generic band. */
export const REALISTIC_UTR_IMPROVEMENT_PER_YEAR = { min: 0.5, max: 1.5 };

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export type PaceRead = "faster-than-realistic" | "within-realistic-range" | "slower-than-realistic" | "no-time-left";

/** The one place a raw UTR/year rate gets classified against
 * REALISTIC_UTR_IMPROVEMENT_PER_YEAR — shared by computeNextBandChange
 * (per-school) and computeGoalPace (whole-roadmap) below, so the two never
 * disagree about what counts as "realistic". */
function paceReadFor(requiredPaceUtrPerYear: number): Exclude<PaceRead, "no-time-left"> {
  if (requiredPaceUtrPerYear > REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max) return "faster-than-realistic";
  if (requiredPaceUtrPerYear < REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min) return "slower-than-realistic";
  return "within-realistic-range";
}

const BAND_LABEL: Record<SchoolFitBand, string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
  "out-of-range": "Out of range",
};

// Honest statements for the two factors this app has never tracked real
// data for — see the file banner above and the redesign spec. Shown
// verbatim rather than built from a template per-school, since there is
// nothing school-specific to plug in.
const PLAYERS_LEAVING_NOTE =
  "Roster openings and seniors leaving aren't tracked yet — this isn't factored into your band.";
const ACADEMICS_NOTE =
  "There's no real per-player academic admit range tracked yet — this isn't factored into your band.";

/** The same evergreen, non-personalized timing guidance /schools/[slug]'s
 * existing Timing driver row already shows — general recruiting-calendar
 * advice, not school-specific data, so it's safe to repeat here verbatim. */
function timingNote(division: SchoolLite["division"]): string {
  return division === "D1"
    ? "D1 coaches often build boards early — junior year is a good time for a first email."
    : "D3 coaches can respond any time — junior fall to junior spring is a typical first-contact window.";
}

export type SchoolFitPace =
  | { status: "no-player-utr" }
  | { status: "insufficient-history"; message: string }
  | { status: "ready"; projectedUTR: number; byDate: string };

/** What it would take to move up exactly one band — null once the player is
 * already in the top band (Likely has no higher band to move into). */
export interface NextBandChange {
  targetBand: SchoolFitBand;
  /** The exact real UTR value (the school's own floor or median) that
   * crossing would move the player into `targetBand`. */
  utrNeeded: number;
  /** utrNeeded - playerUtr. Always > 0 — band logic guarantees the player
   * is below this boundary whenever a NextBandChange exists. */
  gap: number;
  /** ISO "summer before senior year" date — the realistic deadline every
   * other real-pace calculation in this app (classifySchoolFit, the
   * roadmap) is built around. */
  byDate: string;
  /** gap ÷ years remaining until byDate. Null when byDate has already
   * passed — there's no runway left to divide by. */
  requiredPaceUtrPerYear: number | null;
  paceRead: PaceRead;
  /** One sentence combining utrNeeded + byDate + the realistic-pace read. */
  message: string;
}

export interface SchoolFitExplanation {
  /** Same classifySchoolFit output, plus "unverified" for the one case
   * classifySchoolFit itself never returns: no real player UTR to compare
   * against anything. */
  band: FitBand;
  /** Point 2: one plain sentence with real numbers — or an honest
   * "haven't logged a UTR yet" sentence instead of guessing one. */
  summary: string;
  /** Point 3: real arithmetic, both signed (negative = already above that
   * line). Null only when there's no real player UTR to subtract from. */
  gapToFloor: number | null;
  gapToMedian: number | null;
  /** Point 4. */
  pace: SchoolFitPace;
  /** Points 5 + 6. Null when the player is already Likely (nothing higher
   * to move into) or there's no real player UTR yet. */
  nextBand: NextBandChange | null;
  /** Point 7: true when nextBand exists but even a realistic pace (or any
   * pace, if the deadline has already passed) can't close the gap in
   * time. */
  unreachable: boolean;
  /** Up to 3 real catalog schools with similar academics or region that
   * the player IS realistically positioned for today — populated only
   * when `unreachable` is true, per point 7. */
  alternatives: SchoolLite[];
  /** Point 6's honest "not tracked" statements for the two factors this
   * app has no real data for. */
  playersLeaving: string;
  academics: string;
  /** General, non-personalized timing guidance (not school-fit math). */
  timing: string;
}

function computeNextBandChange(
  band: SchoolFitBand,
  playerUtr: number,
  school: Pick<SchoolLite, "minCompetitiveUTR" | "avgRosterUTR">,
  now: Date,
  milestone: Date
): NextBandChange | null {
  if (band === "likely") return null; // already the top band — nothing higher to move into

  // Both Reach and Out-of-range sit below the team floor; crossing it is
  // what moves either one into Target. Target crosses the median into Likely.
  const targetBand: SchoolFitBand = band === "target" ? "likely" : "target";
  const utrNeeded = targetBand === "likely" ? school.avgRosterUTR : school.minCompetitiveUTR;
  const gap = Math.round((utrNeeded - playerUtr) * 100) / 100;
  const byDate = localDateKey(milestone);

  const yearsRemaining = (milestone.getTime() - now.getTime()) / MS_PER_YEAR;
  if (yearsRemaining <= 0) {
    return {
      targetBand,
      utrNeeded,
      gap,
      byDate,
      requiredPaceUtrPerYear: null,
      paceRead: "no-time-left",
      message: `The summer before senior year has already passed, so there's no runway left to close the remaining +${gap.toFixed(1)} UTR gap to ${BAND_LABEL[targetBand]}.`,
    };
  }

  const requiredPaceUtrPerYear = Math.round((gap / yearsRemaining) * 100) / 100;
  const paceRead = paceReadFor(requiredPaceUtrPerYear);
  const readPhrase =
    paceRead === "faster-than-realistic"
      ? "that's faster than most players improve"
      : paceRead === "slower-than-realistic"
        ? "that's a slower pace than most players need — you have room"
        : "that's a realistic pace";

  return {
    targetBand,
    utrNeeded,
    gap,
    byDate,
    requiredPaceUtrPerYear,
    paceRead,
    message: `Reaching ${utrNeeded.toFixed(1)} by ${formatDate(milestone)} would move you into ${BAND_LABEL[targetBand]} — about ${requiredPaceUtrPerYear.toFixed(1)}/year, and ${readPhrase} (most players improve ${REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min}–${REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max}/yr).`,
  };
}

/**
 * Up to `limit` real catalog schools — never invented — with similar
 * academics (same lib/school-academics.ts tier) or region (same
 * lib/school-regions.ts region) as `school`, that the player is
 * realistically positioned for RIGHT NOW (Target or Likely — no future
 * pace required). Ranked: matches both academics and region first, then
 * either alone, closest US News ranking as the tiebreaker.
 */
export function findAlternativeSchools(
  school: Pick<SchoolLite, "slug" | "gender" | "state" | "usNewsRanking">,
  catalog: SchoolLite[],
  playerUtr: number,
  projection?: SchoolFitProjectionInput,
  limit = 3
): SchoolLite[] {
  const targetTier = academicTier(school.usNewsRanking);
  const targetRegion = regionForState(school.state);

  return catalog
    .filter((s) => s.slug !== school.slug && s.gender === school.gender)
    .filter((s) => {
      const band = classifySchoolFit(playerUtr, s, projection);
      return band === "likely" || band === "target";
    })
    .map((s) => {
      const sameTier = academicTier(s.usNewsRanking) === targetTier;
      const sameRegion = targetRegion != null && regionForState(s.state) === targetRegion;
      const score = (sameTier ? 2 : 0) + (sameRegion ? 1 : 0);
      return { school: s, score, rankDiff: Math.abs(s.usNewsRanking - school.usNewsRanking) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.rankDiff - b.rankDiff || a.school.name.localeCompare(b.school.name))
    .slice(0, limit)
    .map((row) => row.school);
}

/** Real UTR history + grad-year context for the full explanation — a
 * superset of SchoolFitProjectionInput (adds the full school catalog,
 * needed only for the point-7 alternatives lookup). */
export interface SchoolFitExplanationInput {
  graduationYear: number;
  utrHistory?: UtrDataPoint[];
  gender?: PlayerGender;
  now?: Date;
  /** Full school catalog (any gender — filtered internally to match
   * `school`'s own gender). Omit to skip alternatives entirely (empty
   * array) rather than searching a partial/wrong catalog. */
  catalog?: SchoolLite[];
}

/**
 * The full "why this band" explanation for one player + school — band,
 * summary sentence, real gaps, real pace projection, what would move the
 * player up a band, and (only when nothing realistic can) real alternative
 * schools. Every number traces back to the school's real
 * minCompetitiveUTR/avgRosterUTR, the player's real currentUTR, and (where
 * supplied) their real UTR history — nothing here is invented.
 *
 * `playerUtr` is `number | null` (not just `number`, unlike
 * classifySchoolFit) so a caller can honestly represent "no real UTR
 * logged yet" — the same `currentUTR <= 0` convention already used by the
 * pre-auth tournament-fit calculator — without ever having to invent a
 * placeholder value to pass in.
 */
export function explainSchoolFit(
  playerUtr: number | null,
  school: SchoolLite,
  input: SchoolFitExplanationInput
): SchoolFitExplanation {
  const timing = timingNote(school.division);

  if (playerUtr == null || playerUtr <= 0) {
    return {
      band: "unverified",
      summary: `You haven't logged a UTR yet, so there's nothing real to compare to ${school.shortName}'s roster.`,
      gapToFloor: null,
      gapToMedian: null,
      pace: { status: "no-player-utr" },
      nextBand: null,
      unreachable: false,
      alternatives: [],
      playersLeaving: PLAYERS_LEAVING_NOTE,
      academics: ACADEMICS_NOTE,
      timing,
    };
  }

  const now = input.now ?? new Date();
  const history = input.utrHistory ?? [];
  const projection: SchoolFitProjectionInput = {
    utrHistory: history,
    graduationYear: input.graduationYear,
    gender: input.gender,
    now,
  };
  const band = classifySchoolFit(playerUtr, school, projection);

  const gapToFloor = Math.round((school.minCompetitiveUTR - playerUtr) * 100) / 100;
  const gapToMedian = Math.round((school.avgRosterUTR - playerUtr) * 100) / 100;

  const summary =
    gapToFloor <= 0
      ? `You're ${playerUtr.toFixed(1)}, already above ${school.shortName}'s competitive floor of ${school.minCompetitiveUTR.toFixed(1)}.`
      : `${school.shortName}'s lowest reliable player is ${school.minCompetitiveUTR.toFixed(1)}. You're ${playerUtr.toFixed(1)}.`;

  const milestone = summerBeforeSeniorYear(input.graduationYear);
  const computed = computeUtrProjection(
    history,
    input.gender ? { ceiling: REALISTIC_UTR_CEILING[input.gender] } : undefined
  );
  const pace: SchoolFitPace =
    computed == null
      ? { status: "insufficient-history", message: "Log more results to see your pace." }
      : {
          status: "ready",
          projectedUTR: Math.round(computed.predict(milestone) * 10) / 10,
          byDate: localDateKey(milestone),
        };

  const nextBand = computeNextBandChange(band, playerUtr, school, now, milestone);
  const unreachable = nextBand != null && (nextBand.paceRead === "faster-than-realistic" || nextBand.paceRead === "no-time-left");
  const alternatives = unreachable ? findAlternativeSchools(school, input.catalog ?? [], playerUtr, projection) : [];

  return {
    band,
    summary,
    gapToFloor,
    gapToMedian,
    pace,
    nextBand,
    unreachable,
    alternatives,
    playersLeaving: PLAYERS_LEAVING_NOTE,
    academics: ACADEMICS_NOTE,
    timing,
  };
}

// ---------------------------------------------------------------------
// GOAL PACE — whole-roadmap version of computeNextBandChange's per-school
// pace check, used by /plan's goal-pace warning (buildRoadmap's goalUTR is
// the highest minCompetitiveUTR among the player's real target schools, or
// a default fallback with no targets — either way, this just asks "is the
// REQUIRED pace to close player -> goal by senior summer realistic?" using
// the exact same REALISTIC_UTR_IMPROVEMENT_PER_YEAR yardstick and
// summerBeforeSeniorYear milestone every other pace read in this file uses.
// ---------------------------------------------------------------------

export interface GoalPace {
  /** goalUTR - currentUTR, never negative (a goal already met needs 0/yr). */
  gap: number;
  /** ISO "summer before senior year" date. */
  byDate: string;
  /** Null once byDate has already passed — no runway left to divide by. */
  requiredPaceUtrPerYear: number | null;
  paceRead: PaceRead;
}

/**
 * Real pace required to close the gap between a player's actual current
 * UTR and their real roadmap goal (buildRoadmap's goalUTR) by the summer
 * before senior year. Never fabricates a pace from a hypothetical UTR —
 * callers that want the what-if slider's number should pass it in as
 * `currentUTR` explicitly rather than this function inventing a second
 * convention.
 */
export function computeGoalPace(
  currentUTR: number,
  goalUTR: number,
  graduationYear: number,
  now: Date = new Date()
): GoalPace {
  const milestone = summerBeforeSeniorYear(graduationYear);
  const byDate = localDateKey(milestone);
  const gap = Math.max(0, Math.round((goalUTR - currentUTR) * 100) / 100);

  const yearsRemaining = (milestone.getTime() - now.getTime()) / MS_PER_YEAR;
  if (yearsRemaining <= 0) {
    return { gap, byDate, requiredPaceUtrPerYear: null, paceRead: gap > 0 ? "no-time-left" : "within-realistic-range" };
  }

  const requiredPaceUtrPerYear = Math.round((gap / yearsRemaining) * 100) / 100;
  return { gap, byDate, requiredPaceUtrPerYear, paceRead: paceReadFor(requiredPaceUtrPerYear) };
}

// ---------------------------------------------------------------------
// "CLOSEST SCHOOLS TO YOU" — real catalog schools ranked by real UTR
// distance to the player's actual level, for /plan's "Closest schools to
// you" section (point 4 of the redesign spec). Distance is measured
// against each school's real avgRosterUTR (its actual roster level, the
// most honest single number for "how close is this program to where I
// really am" — minCompetitiveUTR alone would surface schools whose FLOOR
// is close even if their roster plays well above the player, which reads
// as a worse recommendation, not a better one).
// ---------------------------------------------------------------------

export interface ClosestSchoolResult {
  school: SchoolLite;
  /** avgRosterUTR - playerUtr. Signed: negative means the player is
   * already above that roster's average. */
  gap: number;
  /** Same classifySchoolFit band every other fit chip on the page uses —
   * reused here, never recomputed with different logic. */
  band: SchoolFitBand;
}

/**
 * The `limit` real schools (default 5) in `catalog` with the smallest
 * ABSOLUTE real UTR gap to `playerUtr` — ties broken by distance to the
 * competitive floor as a secondary signal. `catalog` is expected to
 * already be filtered to the player's own recruiting gender (callers
 * already have that filtered list — e.g. roadmap-view.tsx's
 * `pickerSchools` — rather than this function re-deriving it and needing
 * a Gender/programGenderFor import of its own).
 */
export function closestSchoolsByUtrGap(
  playerUtr: number,
  catalog: SchoolLite[],
  limit = 5,
  projection?: SchoolFitProjectionInput
): ClosestSchoolResult[] {
  return catalog
    .map((school) => ({
      school,
      gap: Math.round((school.avgRosterUTR - playerUtr) * 100) / 100,
      band: classifySchoolFit(playerUtr, school, projection),
    }))
    .sort(
      (a, b) =>
        Math.abs(a.gap) - Math.abs(b.gap) ||
        Math.abs(a.school.minCompetitiveUTR - playerUtr) - Math.abs(b.school.minCompetitiveUTR - playerUtr)
    )
    .slice(0, limit);
}
