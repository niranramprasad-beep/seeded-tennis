// The fit engine — THE PLAN GOAL. The goal a player chose (never a default),
// the pace banner under it, and why a typed goal can't be saved.
//
// Moved verbatim from lib/fit.ts on 2026-11-21 (the fit.ts split; every
// declaration below is byte-identical to the original, which
// lib/fit-split-purity.test.ts checks). Import from "@/lib/fit", never from
// this file: lib/fit.ts is the engine's public entry point, and
// lib/fit/engine-files.ts lists the files the guard tests treat as
// "lib/fit.ts". "This module" and "here" in the comments below mean the fit
// engine as a whole.

import {
  PACE_STRETCH_MARGIN_PER_YEAR,
  PACE_STRETCH_PHRASE,
  paceIsStretch,
  type GoalPace,
} from "@/lib/school-fit";
import { formatPlayerUtr } from "@/lib/utils";
import { PLANNING_PACE_CAP_PER_YEAR } from "@/lib/fit/pace";
import type { RecruitingTimeUtr } from "@/lib/fit/projection";

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

/** The stretch band's half-width, 0.05 a year — defined beside paceIsStretch
 * in lib/school-fit.ts, re-exported here. */
export { PACE_STRETCH_MARGIN_PER_YEAR };

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
  if (paceIsStretch(pace.requiredPaceUtrPerYear)) return "stretch";
  return Math.round(pace.requiredPaceUtrPerYear * 100) > Math.round(PLANNING_PACE_CAP_PER_YEAR * 100) ? "warning" : null;
}

/** The red warning only — a goal needing more than the cap plus the stretch
 * margin, or with no time left. See planGoalPaceSeverity. */
export function planGoalNeedsPaceWarning(goal: PlanGoal | null, pace: GoalPace | null): boolean {
  return planGoalPaceSeverity(goal, pace) === "warning";
}

/** The amber banner's words for a goal in the stretch band (A-022). */
export const PACE_STRETCH_NOTE = `That's ${PACE_STRETCH_PHRASE}.`;

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
