"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { loadPlanGoalUtr, savePlanGoalUtr } from "@/lib/db/settings";

/** The one SWR key for the stored Plan UTR — /schools, /plan, /today, a
 *  school page and the tournament checker all read it, so saving it on one
 *  screen updates every other one without a reload. */
export const PLAN_UTR_KEY = "plan-goal";

export interface UseStoredPlanUtrResult {
  /** The Plan UTR the player saved, or null (none set). Undefined while it
   *  loads. */
  planUtr: number | null | undefined;
  loaded: boolean;
  /** Saves it; `null` clears it. Optimistic: every screen updates at once. */
  setPlanUtr: (value: number | null) => Promise<void>;
}

/**
 * THE stored Plan UTR (2026-11-27): one number the player sets — "Set your
 * plan UTR" on /schools, "Your plan UTR" on /plan — kept in
 * user_settings.notification_preferences.planGoalUtr (lib/db/settings.ts;
 * no migration). `enabled: false` skips the read — a parent's view of their
 * player: user_settings is own-row only (RLS), so a parent cannot read it,
 * and their screens judge fit on the player's estimate instead.
 */
export function useStoredPlanUtr(enabled = true): UseStoredPlanUtrResult {
  const { data, mutate } = useSWR<number | null>(enabled ? PLAN_UTR_KEY : null, () => loadPlanGoalUtr());
  const setPlanUtr = useCallback(
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
  return { planUtr: enabled ? data : null, loaded: !enabled || data !== undefined, setPlanUtr };
}
