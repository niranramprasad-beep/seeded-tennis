// The fit engine — THE PLAN GOAL. The goal a player chose (never a default),
// when it judges fit, its quarterly checkpoints and realism note, and why a
// typed goal can't be saved.
//
// Moved verbatim from lib/fit.ts on 2026-11-21 (the fit.ts split; every
// declaration below is byte-identical to the original, which
// lib/fit-split-purity.test.ts checks). Import from "@/lib/fit", never from
// this file: lib/fit.ts is the engine's public entry point, and
// lib/fit/engine-files.ts lists the files the guard tests treat as
// "lib/fit.ts". "This module" and "here" in the comments below mean the fit
// engine as a whole.

import { formatPacePerYear, formatPlayerUtr } from "@/lib/utils";
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

/**
 * THE rule for when the Plan UTR judges fit (2026-11-27): the value the
 * player saved, while it is still ahead of them and its date is still
 * ahead. Null — fit then uses the estimate, or today's rating — when:
 *  - there is no real rating (null or the 0 sentinel): a typed plan is not
 *    a UTR, and every tier derived from one needs a real rating first
 *    (CLAUDE.md, hasRealUtr; verifier HIGH 3);
 *  - today's rating has reached it: the plan is spent, and judging a player
 *    on a number below the one they hold would understate them; /plan says
 *    "Set a higher one";
 *  - the summer before senior year (`goalDate`) has begun: a plan "by June
 *    2026" says nothing in November 2026, and a senior must be judged on
 *    their rating today (verifier HIGH 1).
 * Every screen gets this through useFitReport, so Schools, Plan, Today and a
 * school page cannot disagree about which number they used.
 */
export function activePlanUtr(input: {
  planUtr: number | null | undefined;
  currentUtr: number | null | undefined;
  /** June 1 of the summer before senior year (summerBeforeSeniorYear). */
  goalDate: Date;
  now?: Date;
}): number | null {
  const { planUtr, currentUtr } = input;
  if (planUtr == null || !Number.isFinite(planUtr) || planUtr <= 0) return null;
  if (currentUtr == null || !(currentUtr > 0)) return null;
  if (Math.round(planUtr * 100) <= Math.round(currentUtr * 100)) return null;
  if ((input.now ?? new Date()).getTime() >= input.goalDate.getTime()) return null;
  return planUtr;
}

export interface PlanCheckpoint {
  date: Date;
  /** Where the player needs to be on `date`, on the straight line from
   * today's rating to the plan. Rounded to the hundredth; the last one is
   * the plan itself, exactly as saved. */
  utr: number;
  /** "Mar 2027" — the label every checkpoint prints. */
  label: string;
  isPlan: boolean;
}

const QUARTER_MONTHS = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec — the 1st of each.
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The quarterly checkpoint line to the Plan UTR (2026-11-27): the 1st of
 * every March, June, September and December from a month out to the summer
 * before senior year (June 1, which is itself a quarter date), each on the straight
 * line in TIME from today's rating to the plan — the same line buildRoadmap's
 * per-grade checkpoints sit on, so /today's "Next checkpoint" agrees with
 * every point here. Empty without a real rating, without an active plan, or
 * once the summer before senior year has begun (there is no "by" left).
 */
export function planCheckpoints(input: {
  currentUtr: number | null | undefined;
  planUtr: number | null | undefined;
  /** June 1 of the summer before senior year (summerBeforeSeniorYear). */
  goalDate: Date;
  now?: Date;
}): PlanCheckpoint[] {
  const now = input.now ?? new Date();
  const current = input.currentUtr;
  const plan = activePlanUtr({ planUtr: input.planUtr, currentUtr: current, goalDate: input.goalDate, now });
  if (plan == null || current == null || !(current > 0)) return [];
  const end = input.goalDate.getTime();
  const start = now.getTime();
  if (end <= start) return [];
  const out: PlanCheckpoint[] = [];
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  // The first quarter date at least a month away: a checkpoint four days
  // out says nothing today's rating doesn't. (The plan date always stays.)
  const soonest = start + 30 * 86_400_000;
  while (!(QUARTER_MONTHS.includes(d.getMonth()) && (d.getTime() >= soonest || d.getTime() >= end))) d.setMonth(d.getMonth() + 1);
  while (d.getTime() <= end) {
    const t = d.getTime();
    const isPlan = t === end;
    const utr = isPlan ? plan : Math.round((current + ((plan - current) * (t - start)) / (end - start)) * 100) / 100;
    out.push({ date: new Date(t), utr, label: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`, isPlan });
    d.setMonth(d.getMonth() + 3);
  }
  // A goal date that is not itself a quarter date still ends the line.
  if (out.length === 0 || !out[out.length - 1].isPlan) {
    const g = input.goalDate;
    out.push({ date: new Date(end), utr: plan, label: `${MONTH_SHORT[g.getMonth()]} ${g.getFullYear()}`, isPlan: true });
  }
  return out;
}

/**
 * The one realism note under the plan (/plan only — 2026-11-27, it replaced
 * the "a stretch" and "1.5 UTR a year" banners on /plan and /today). It
 * compares the pace the plan needs with the player's OWN logged pace, the
 * one real number Seeded has about how fast this player improves. With no
 * logged pace it says what would let us tell. Null without a real rating or
 * an active plan, or once there is no time left.
 */
export function planRealismNote(input: {
  currentUtr: number | null | undefined;
  planUtr: number | null | undefined;
  goalDate: Date;
  /** lib/fit playerPacePerYear — null without a logged pace. */
  ownPacePerYear: number | null | undefined;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();
  const current = input.currentUtr;
  const plan = activePlanUtr({ planUtr: input.planUtr, currentUtr: current, goalDate: input.goalDate, now });
  if (plan == null || current == null || !(current > 0)) return null;
  const years = (input.goalDate.getTime() - now.getTime()) / (365.25 * 86_400_000);
  if (years <= 0) return null;
  const needs = Math.round(((plan - current) / years) * 100) / 100;
  // The one pace formatter ("+1.32 a year"), like every other pace.
  const needsText = formatPacePerYear(needs);
  const own = input.ownPacePerYear;
  if (own == null || !Number.isFinite(own)) {
    return `Your plan needs about ${needsText}. Log your UTR every few months and Seeded will show whether you're keeping up.`;
  }
  const ownText = formatPacePerYear(own);
  if (Math.round(own * 100) >= Math.round(needs * 100)) {
    return `Your plan needs about ${needsText}, and your pace so far is ${ownText}. Keep that up and you're on track.`;
  }
  return `Your plan needs about ${needsText}, but your pace so far is ${ownText}. You'd need to speed up, so keep some schools on your list that fit your UTR today.`;
}

/**
 * Why a goal the player typed can't be saved, or null when it can. A goal is
 * a rating not reached yet: one at or below today's rating would put every
 * checkpoint behind the player (docs/DECISIONS.md, 2026-11-18). With no real
 * rating (null / the 0 sentinel) any 1–16.5 goal is accepted.
 */
export function planGoalInputError(value: number, currentUtr: number | null | undefined): string | null {
  if (!Number.isFinite(value) || value < 1 || value > 16.5) return "Enter a UTR between 1.00 and 16.50.";
  if (currentUtr != null && currentUtr > 0 && Math.round(value * 100) <= Math.round(currentUtr * 100)) {
    return `Your plan UTR needs to be above your current UTR, ${formatPlayerUtr(currentUtr)}.`;
  }
  return null;
}
