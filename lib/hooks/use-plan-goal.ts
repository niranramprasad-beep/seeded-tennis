"use client";

import { useMemo } from "react";
import type { Player, RoadmapYear } from "@/lib/types";
import { resolvePlanGoal, type PlanGoal } from "@/lib/fit";
import { computeGoalPace, type GoalPace } from "@/lib/school-fit";
import { buildRoadmap } from "@/lib/db/plan";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { useStoredPlanUtr } from "@/lib/hooks/use-plan-utr";
import { hasRealUtr } from "@/lib/utils";

const NO_SCHOOLS: never[] = [];

export interface UsePlanGoalResult {
  /** Null until the player sets a goal — there is no default goal (PR D,
   *  D1: it used to default to the estimate). Screens show "Set a goal". */
  goal: PlanGoal | null;
  /** Checkpoints on the line from today's rating to the goal. */
  roadmap: RoadmapYear[];
  /** Pace the goal needs. Null without a real rating. */
  goalPace: GoalPace | null;
  /** False until the saved goal has been read — so a screen does not show
   *  "Set a goal" and then swap to the chosen goal. */
  loaded: boolean;
  /** The planning estimate (`report.utr.value`) a screen may OFFER as a
   *  goal. Null without a projection. Never applied on its own. */
  estimate: number | null;
  /** Saves a goal; `null` clears it (no goal). */
  setGoal: (value: number | null) => Promise<void>;
}

/**
 * The one way a screen gets the plan goal and its checkpoints. /plan and
 * /today both call it (same SWR key), so "Goal" on /plan, the dashed line
 * on both charts and /today's "Next checkpoint" are one number.
 */
export function usePlanGoal(
  player: Pick<Player, "currentUTR" | "graduationYear" | "gender">
): UsePlanGoalResult {
  const { planUtr: chosen, setPlanUtr: setGoal } = useStoredPlanUtr();

  // The goal is the one the player saved, or none. The fit report's
  // estimate (report.utr) rides along only so a screen can OFFER it ("Use
  // 8.10 instead") — resolvePlanGoal never defaults to it (PR D, D1).
  // No schools: only the rating is needed, and the history fetch is the
  // same shared SWR key every screen already loaded.
  const report = useFitReport({ player, schools: NO_SCHOOLS, judgeOn: "estimate" });
  const estimate = report?.utr.isProjected ? report.utr.value : null;
  const goal = useMemo(
    () => resolvePlanGoal({ chosenGoalUtr: chosen ?? null, estimate: report?.utr ?? null }),
    [chosen, report]
  );

  const roadmap = useMemo(
    () => (goal && hasRealUtr(player.currentUTR) ? buildRoadmap(player, goal.value) : []),
    [goal, player]
  );

  const goalPace = useMemo(
    () =>
      goal && hasRealUtr(player.currentUTR)
        ? computeGoalPace(player.currentUTR, goal.value, player.graduationYear)
        : null,
    [goal, player.currentUTR, player.graduationYear]
  );

  return { goal, roadmap, goalPace, loaded: chosen !== undefined, estimate, setGoal };
}
