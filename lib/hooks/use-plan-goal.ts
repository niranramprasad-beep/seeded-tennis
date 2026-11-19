"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { Player, RoadmapYear } from "@/lib/types";
import { resolvePlanGoal, type PlanGoal } from "@/lib/fit";
import { computeGoalPace, type GoalPace } from "@/lib/school-fit";
import { buildRoadmap } from "@/lib/db/plan";
import { loadPlanGoalUtr, savePlanGoalUtr } from "@/lib/db/settings";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { hasRealUtr } from "@/lib/utils";

const NO_SCHOOLS: never[] = [];

export interface UsePlanGoalResult {
  /** Null when there is no rating and no chosen goal — nothing to plan to. */
  goal: PlanGoal | null;
  /** Checkpoints on the line from today's rating to the goal. */
  roadmap: RoadmapYear[];
  /** Pace the goal needs. Null without a real rating. */
  goalPace: GoalPace | null;
  /** False until the saved goal has been read — so a screen does not show
   *  the estimate and then swap to the chosen goal. */
  loaded: boolean;
  /** Saves a goal; `null` goes back to the estimate. */
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
  const { data: chosen, mutate } = useSWR<number | null>("plan-goal", () => loadPlanGoalUtr());

  // The default goal is the fit report's own estimate (report.utr) — the
  // number every ProjectionNote prints, by whatever rule lib/fit.ts uses.
  // No schools: only the rating is needed, and the history fetch is the
  // same shared SWR key every screen already loaded.
  const report = useFitReport({ player, schools: NO_SCHOOLS });
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

  const setGoal = useCallback(
    async (value: number | null) => {
      await mutate(
        async () => {
          await savePlanGoalUtr(value);
          return value;
        },
        { optimisticData: value, rollbackOnError: true, revalidate: false }
      );
    },
    [mutate]
  );

  return { goal, roadmap, goalPace, loaded: chosen !== undefined, setGoal };
}
