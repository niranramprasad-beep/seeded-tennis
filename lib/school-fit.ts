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
import { getSummerBeforeGradeYear } from "@/lib/time";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";

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
 * what "the summer before senior year" means. */
function summerBeforeSeniorYear(graduationYear: number): Date {
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
