"use client";

import { AlertTriangle } from "lucide-react";
import type { GoalPace } from "@/lib/school-fit";
import { REALISTIC_UTR_IMPROVEMENT_PER_YEAR } from "@/lib/school-fit";
import { formatDate } from "@/lib/time";
import { formatUTR } from "@/lib/utils";

interface GoalPaceWarningProps {
  goalPace: GoalPace;
  goalUTR: number;
  showingRealisticOnly: boolean;
  onShowRealistic: () => void;
  onShowAll: () => void;
}

// Point 2 of the redesign spec: buildRoadmap's real goalUTR (the highest
// minCompetitiveUTR among the player's real target schools) compared
// against the real pace needed to reach it by senior summer — the exact
// same REALISTIC_UTR_IMPROVEMENT_PER_YEAR yardstick the what-if slider and
// lib/school-fit.ts's per-school "why this band" explanation already use,
// never a second invented threshold.
export function GoalPaceWarning({
  goalPace,
  goalUTR,
  showingRealisticOnly,
  onShowRealistic,
  onShowAll,
}: GoalPaceWarningProps) {
  const isWarning = goalPace.paceRead === "faster-than-realistic" || goalPace.paceRead === "no-time-left";
  if (!isWarning) return null;

  const message =
    goalPace.paceRead === "no-time-left"
      ? `The summer before senior year (${formatDate(goalPace.byDate)}) has already passed, so there's no runway left to close the remaining +${formatUTR(goalPace.gap)} UTR gap to your ${formatUTR(goalUTR)} goal.`
      : `Hitting ${formatUTR(goalUTR)} by ${formatDate(goalPace.byDate)} needs about ${goalPace.requiredPaceUtrPerYear?.toFixed(1)}/year — faster than most players improve (most improve ${REALISTIC_UTR_IMPROVEMENT_PER_YEAR.min}–${REALISTIC_UTR_IMPROVEMENT_PER_YEAR.max}/yr).`;

  return (
    <div className="mt-3.5 flex flex-wrap items-start gap-2.5 rounded-xl border border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] p-3.5 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--c-clay-tint-text))]" aria-hidden />
      <p className="min-w-0 flex-1 text-[rgb(var(--c-clay-tint-text))]">{message}</p>
      <button
        type="button"
        onClick={showingRealisticOnly ? onShowAll : onShowRealistic}
        className="shrink-0 whitespace-nowrap rounded-pill border border-[rgb(var(--c-clay-tint-border))] bg-card px-3 py-1.5 text-xs font-semibold text-[rgb(var(--c-clay-tint-text))]"
      >
        {showingRealisticOnly ? "Show all targets" : "Show realistic targets"}
      </button>
    </div>
  );
}
