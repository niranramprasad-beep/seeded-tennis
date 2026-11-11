// Pure math behind the "what if my UTR is ___ by June {senior summer
// year}?" slider on /schools and /plan. No React — just turning a chosen
// pace into a hypothetical UTR number, and deciding which (if any) real
// projection input the 4-band classifier should see for that hypothetical.
//
// The slider itself always drives classifySchoolFit/explainSchoolFit by
// substituting its hypothetical value for the player's real currentUTR —
// never a forked copy of that math (see lib/school-fit.ts). The one real
// decision this file makes is about the BELOW-the-floor Reach-vs-Out-of-
// range split, which classifySchoolFit decides from a projection, not from
// the raw UTR number you hand it:
//   - "My pace": the hypothetical IS that regression's own predicted value
//     at the milestone, so handing the real history back is exactly
//     consistent — no double-counting.
//   - "+1.5/yr" and "Custom": a synthetic straight line that arrives at the
//     hypothetical UTR on the senior-summer milestone.
//
// P1-FIT-1: those last two modes used to return `undefined`, and
// classifySchoolFit answers "reach" for every below-floor school when it
// has no projection. The reasoning was that a hypothetical has no real
// trend behind it, so claiming "out of range" would be fabricating. But
// returning nothing doesn't abstain — it asserts "reach" for all 37
// programs, which is a stronger and more flattering claim than the data
// supports. Live symptom: Stanford read "Out of range" on its own page and
// on Plan, but "Reach" on /schools, which showed "Reach 37 · Out of range 0".
//
// The synthetic line is not invented data about the player. It is the
// restatement of a question they asked — "what if I'm at 9.0 by senior
// summer?" — in the only shape classifySchoolFit accepts. The band it
// produces is then a real answer to that hypothetical: at 9.0, a 12.3 floor
// is still out of range, and the player deserves to be told so on every
// screen rather than only on two of them.
import type { PlayerGender } from "@/lib/types";
import { computeUtrProjection, type UtrDataPoint } from "@/lib/utr-projection";
import { REALISTIC_UTR_CEILING } from "@/lib/config/recruiting";
import { summerBeforeSeniorYear, type SchoolFitProjectionInput } from "@/lib/school-fit";

export type WhatIfPaceMode = "mine" | "plus1.5" | "custom";

/** The "+1.5 per year" hypothetical pace — a clearly-labeled guess, never
 * persisted as a preference and never confused with a player's real
 * regression-derived pace. */
export const WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR = 1.5;

/** Mirrors utr-projection.ts's own PROJECTION_FLOOR — the real UTR scale's
 * practical bottom. Not re-exported from there (it's a private constant),
 * duplicated here as a single plain number rather than reaching into that
 * module's internals. */
const REALISTIC_UTR_FLOOR = 1.0;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Clamps a hypothetical UTR to the same realistic floor/ceiling
 * computeUtrProjection's own soft cap targets — a what-if number should
 * never land somewhere that doesn't exist on the real UTR scale. */
export function clampToRealisticUtr(value: number, gender: PlayerGender): number {
  const ceiling = REALISTIC_UTR_CEILING[gender];
  return Math.min(ceiling, Math.max(REALISTIC_UTR_FLOOR, value));
}

export interface MyPaceInput {
  utrHistory: UtrDataPoint[];
  graduationYear: number;
  gender: PlayerGender;
  now?: Date;
}

/**
 * The player's real regression-derived UTR at the senior-summer milestone
 * — null when there isn't enough real history (<3 points) to fit a trend,
 * the same honesty rule computeUtrProjection already enforces everywhere
 * else in the app. Never fabricates a number when there's no real signal.
 */
export function computeMyPaceUTR(input: MyPaceInput): number | null {
  const computed = computeUtrProjection(input.utrHistory, {
    ceiling: REALISTIC_UTR_CEILING[input.gender],
  });
  if (!computed) return null;
  const milestone = summerBeforeSeniorYear(input.graduationYear);
  return Math.round(computed.predict(milestone) * 100) / 100;
}

export interface PlusPaceInput {
  currentUTR: number;
  graduationYear: number;
  gender: PlayerGender;
  /** Defaults to WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR; only ever overridden in tests. */
  ratePerYear?: number;
  now?: Date;
}

/**
 * A clearly-labeled hypothetical, not derived from any real history:
 * today's real UTR plus a flat assumed per-year rate, applied over the
 * real years remaining until the senior-summer milestone (never negative —
 * a milestone that's already passed contributes zero additional years).
 */
export function computePlusPaceUTR(input: PlusPaceInput): number {
  const now = input.now ?? new Date();
  const milestone = summerBeforeSeniorYear(input.graduationYear);
  const yearsRemaining = Math.max(0, (milestone.getTime() - now.getTime()) / MS_PER_YEAR);
  const rate = input.ratePerYear ?? WHAT_IF_HYPOTHETICAL_PACE_PER_YEAR;
  return clampToRealisticUtr(input.currentUTR + rate * yearsRemaining, input.gender);
}

export interface SyntheticHistoryInput {
  /** Where the player is today — the line's anchor. */
  currentUTR: number;
  /** Where the hypothetical says they'll be at the senior-summer milestone. */
  targetUTR: number;
  graduationYear: number;
  now?: Date;
}

/**
 * Three points on the straight line from today's UTR to the hypothetical
 * UTR at the senior-summer milestone, placed in the past so that
 * computeUtrProjection's weighted regression recovers exactly that line and
 * predicts `targetUTR` at the milestone.
 *
 * Three because that's computeUtrProjection's minimum; collinear because
 * the hypothetical is a straight-line assumption by construction, and an
 * exact fit keeps the uncertainty band at its floor rather than inventing
 * spread. These points are never shown to the player, never stored, and
 * never mixed with their real entries — they exist only to express a
 * what-if in the shape classifySchoolFit reads.
 */
export function syntheticUtrHistoryFor(input: SyntheticHistoryInput): UtrDataPoint[] {
  const now = input.now ?? new Date();
  const milestone = summerBeforeSeniorYear(input.graduationYear);
  const yearsRemaining = Math.max(0, (milestone.getTime() - now.getTime()) / MS_PER_YEAR);

  // Milestone already gone (the player is a senior or past it): there is no
  // future window left to improve in, and classifySchoolFit evaluates at
  // `now` instead. A flat line at the hypothetical value is the honest
  // representation — it says "if you were at X", not "if you climb to X".
  if (yearsRemaining <= 0) {
    return [1, 0.5, 0].map((yearsAgo) => ({
      date: new Date(now.getTime() - yearsAgo * MS_PER_YEAR),
      utr: input.targetUTR,
    }));
  }

  const slopePerYear = (input.targetUTR - input.currentUTR) / yearsRemaining;
  return [1, 0.5, 0].map((yearsAgo) => ({
    date: new Date(now.getTime() - yearsAgo * MS_PER_YEAR),
    utr: input.currentUTR - slopePerYear * yearsAgo,
  }));
}

/** The player's explicit choice in the what-if panel: a pace they picked and
 * the UTR it produced. `null` until they touch anything. */
export interface WhatIfOverride {
  mode: WhatIfPaceMode;
  utr: number;
}

export interface WhatIfDisplayState {
  hypotheticalUTR: number;
  /** The mode driving the math. */
  paceMode: WhatIfPaceMode;
  /** What the UI highlights — null until the player picks a pace, so no
   * button is lit next to a number it didn't produce. */
  activePaceMode: WhatIfPaceMode | null;
  isAtRealCurrent: boolean;
}

/**
 * What the what-if panel should show, derived from the player's choice plus
 * the current props — never stored.
 *
 * P1-FIT-2: the hook used to seed `useState(currentUTR)` and
 * `useState(defaultMode)` on first render, which happens before the player
 * and their UTR history have loaded. It captured the placeholder
 * `currentUTR: 7` (lib/auth.ts, lib/data/user.ts) and kept it, so a 5.81
 * player saw "You 7.0" on every row of /schools.
 *
 * Deriving — rather than re-seeding from an effect, which loses the same
 * race one tick later — makes that class of bug impossible: with no
 * override, the panel holds nothing of its own that could go stale.
 */
export function resolveWhatIfDisplay(
  override: WhatIfOverride | null,
  props: { currentUTR: number; defaultMode: WhatIfPaceMode }
): WhatIfDisplayState {
  if (!override) {
    return {
      hypotheticalUTR: props.currentUTR,
      paceMode: props.defaultMode,
      activePaceMode: null,
      isAtRealCurrent: true,
    };
  }
  return {
    hypotheticalUTR: override.utr,
    paceMode: override.mode,
    activePaceMode: override.mode,
    isAtRealCurrent: false,
  };
}

export interface WhatIfProjectionInput {
  currentUTR: number;
  hypotheticalUTR: number;
}

/**
 * The projection input the 4-band classifier should see for a what-if pass.
 *
 * Always returns one. See the file banner: returning `undefined` for the
 * hypothetical modes doesn't abstain from judging, it silently answers
 * "reach" for every school below the floor.
 */
export function whatIfProjectionFor(
  paceMode: WhatIfPaceMode,
  real: SchoolFitProjectionInput,
  hypothetical: WhatIfProjectionInput
): SchoolFitProjectionInput {
  if (paceMode === "mine") return real;
  return {
    ...real,
    utrHistory: syntheticUtrHistoryFor({
      currentUTR: hypothetical.currentUTR,
      targetUTR: hypothetical.hypotheticalUTR,
      graduationYear: real.graduationYear,
      now: real.now,
    }),
  };
}
