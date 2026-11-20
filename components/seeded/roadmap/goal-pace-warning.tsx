"use client";

import { AlertTriangle } from "lucide-react";
import { TYPICAL_PACE_RANGE_LABEL, formatPacePerYear, planGoalNeedsPaceWarning, type PlanGoal } from "@/lib/fit";
import type { GoalPace } from "@/lib/school-fit";
import { formatDate } from "@/lib/time";
import { formatPlayerUtr } from "@/lib/utils";

interface GoalPaceWarningProps {
  goalPace: GoalPace | null;
  goal: PlanGoal | null;
  /** Today's rating — the estimate is only offered as a goal when it is
   *  above it (a goal must be, lib/fit.ts planGoalInputError). */
  currentUtr?: number | null;
  /** Saves the planning estimate as the goal. */
  onUseEstimate?: (value: number) => void;
  className?: string;
}

// The unrealistic-pace warning. ONE component and ONE rule
// (lib/fit.ts planGoalNeedsPaceWarning), rendered on /plan under the goal
// and on /today under the headline, so the two screens cannot disagree about
// whether a goal is out of reach (C11).
//
// It shows ONLY for a goal the player set that needs more than the planning
// cap (1.5 a year) — there is no default goal any more (PR D, D1), so with
// no goal nothing shows. It offers the planning estimate as a realistic goal
// instead. The required pace prints through formatPacePerYear, the one pace
// formatter ("needs about 2.25 a year").
export function GoalPaceWarning({ goalPace, goal, currentUtr, onUseEstimate, className }: GoalPaceWarningProps) {
  // null when the player has no real UTR: every field (gap, required pace,
  // byDate) is derived from it, so there is no warning to give — only an
  // invented one.
  if (!goal || !planGoalNeedsPaceWarning(goal, goalPace)) return null;
  const pace = goalPace as GoalPace;

  const message =
    pace.paceRead === "no-time-left"
      ? `The summer before senior year (${formatDate(pace.byDate)}) has passed, so there's no time left to close the ${formatPlayerUtr(pace.gap)} gap to your ${formatPlayerUtr(goal.value)} goal.`
      : `Reaching ${formatPlayerUtr(goal.value)} by ${formatDate(pace.byDate)} needs about ${formatPacePerYear(pace.requiredPaceUtrPerYear as number, { signed: false })}. Most players improve ${TYPICAL_PACE_RANGE_LABEL}.`;

  const estimate = goal.estimate;
  const canUseEstimate =
    estimate != null &&
    onUseEstimate != null &&
    estimate !== goal.value &&
    (currentUtr == null || currentUtr <= 0 || estimate > currentUtr);

  return (
    <div
      role="status"
      className={`flex flex-wrap items-start gap-2.5 rounded-xl border border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] p-3.5 text-sm ${className ?? ""}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--c-clay-tint-text))]" aria-hidden />
      <p className="min-w-0 flex-1 text-[rgb(var(--c-clay-tint-text))]">{message}</p>
      {canUseEstimate && (
        <button
          type="button"
          onClick={() => onUseEstimate(estimate)}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-pill border border-[rgb(var(--c-clay-tint-border))] bg-card px-3 py-1.5 text-xs font-semibold text-[rgb(var(--c-clay-tint-text))] sm:min-h-8"
        >
          Use {formatPlayerUtr(estimate)} instead
        </button>
      )}
    </div>
  );
}
