"use client";

import { AlertTriangle } from "lucide-react";
import type { PlanGoal } from "@/lib/fit";
import type { GoalPace } from "@/lib/school-fit";
import { REALISTIC_UTR_IMPROVEMENT_PER_YEAR, goalPaceNeedsWarning } from "@/lib/school-fit";
import { formatDate } from "@/lib/time";
import { formatPlayerUtr, formatUtrEstimate } from "@/lib/utils";

interface GoalPaceWarningProps {
  goalPace: GoalPace | null;
  goal: PlanGoal | null;
  /** Drops the chosen goal and goes back to the estimate. */
  onUseEstimate?: () => void;
  className?: string;
}

// The unrealistic-pace warning. ONE component and ONE rule
// (lib/school-fit.ts goalPaceNeedsWarning), rendered on /plan under the goal
// and on /today under the headline, so the two screens cannot disagree about
// whether a goal is out of reach (C11).
//
// With the default goal (the typical-growth estimate, lib/fit.ts) the pace
// is typical by definition and nothing shows. It appears when the player
// has CHOSEN a goal that needs more than most players manage — and offers
// the estimate back. It used to offer "Show realistic targets", which
// filtered nothing (C5; the filter now lives on the target list itself).
export function GoalPaceWarning({ goalPace, goal, onUseEstimate, className }: GoalPaceWarningProps) {
  // null when the player has no real UTR: every field (gap, required pace,
  // byDate) is derived from it, so there is no warning to give — only an
  // invented one.
  if (!goal || !goalPaceNeedsWarning(goalPace)) return null;
  const pace = goalPace as GoalPace;

  const message =
    pace.paceRead === "no-time-left"
      ? `The summer before senior year (${formatDate(pace.byDate)}) has passed, so there's no time left to close the ${formatPlayerUtr(pace.gap)} gap to your ${formatPlayerUtr(goal.value)} goal.`
      : `Reaching ${formatPlayerUtr(goal.value)} by ${formatDate(pace.byDate)} needs about ${pace.requiredPaceUtrPerYear?.toFixed(2)} a year. Most players improve ${REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min} to ${REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max} a year.`;

  const canReset = goal.source === "chosen" && goal.estimate != null && onUseEstimate;

  return (
    <div
      role="status"
      className={`flex flex-wrap items-start gap-2.5 rounded-xl border border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] p-3.5 text-sm ${className ?? ""}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--c-clay-tint-text))]" aria-hidden />
      <p className="min-w-0 flex-1 text-[rgb(var(--c-clay-tint-text))]">{message}</p>
      {canReset && (
        <button
          type="button"
          onClick={onUseEstimate}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-pill border border-[rgb(var(--c-clay-tint-border))] bg-card px-3 py-1.5 text-xs font-semibold text-[rgb(var(--c-clay-tint-text))] sm:min-h-8"
        >
          Use {formatUtrEstimate(goal.estimate as number)} instead
        </button>
      )}
    </div>
  );
}
