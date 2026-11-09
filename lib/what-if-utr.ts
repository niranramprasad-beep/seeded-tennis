// Pure math behind the "what if my UTR is ___ by June {senior summer
// year}?" slider on /schools and /plan. No React — just turning a chosen
// pace into a hypothetical UTR number, and deciding which (if any) real
// projection input the 4-band classifier should see for that hypothetical.
//
// The slider itself always drives classifySchoolFit/explainSchoolFit by
// substituting its hypothetical value for the player's real currentUTR —
// never a forked copy of that math (see lib/school-fit.ts). The one real
// decision this file makes is about the BELOW-the-floor Reach-vs-Out-of-
// range split, which classifySchoolFit decides from a real regression over
// real history, not from the raw UTR number you hand it:
//   - "My pace" mode: the hypothetical IS that same regression's own
//     predicted value at the milestone, so handing classifySchoolFit the
//     real history back is exactly consistent — no double-counting.
//   - "+1.5/yr" and "Custom": a flat hypothetical rate or a hand-typed
//     number has no real trend behind it, so the honest move is the same
//     fallback classifySchoolFit already uses for pre-auth callers with no
//     history — Reach, never a fabricated "Out of range".
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

/**
 * Which real-history projection input (if any) the 4-band classifier
 * should see for a what-if pass. See the file banner for why only "mine"
 * passes real history through.
 */
export function whatIfProjectionFor(
  paceMode: WhatIfPaceMode,
  real: SchoolFitProjectionInput
): SchoolFitProjectionInput | undefined {
  return paceMode === "mine" ? real : undefined;
}
