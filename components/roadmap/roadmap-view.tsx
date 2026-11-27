"use client";

import { useMemo, useState } from "react";
import type { RoadmapYear, SchoolLite } from "@/lib/types";
import { programGenderFor } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { usePlanGoal, type UsePlanGoalResult } from "@/lib/hooks/use-plan-goal";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { SeededRoadmapLayout } from "@/components/seeded/roadmap/seeded-roadmap-layout";

export function RoadmapView({ schools }: { schools: SchoolLite[] }) {
  return (
    <AuthGate>
      <PaidGate
        required="player"
        feature="Your roadmap"
        // Sold only what /plan contains. It listed "Tournament counts that
        // match each level" and "An animated trajectory" (not there at all)
        // and "What-if planning across up to five programs" — while
        // /pricing, correctly, lists the what-if school planner as FREE (it
        // is on /schools for everyone).
        blurb="Your plan to the summer before senior year: UTR checkpoints, your target schools in order, and your results beside them."
        perks={[
          "Year-by-year UTR checkpoints toward your target schools",
          "Your targets in order, with how you fit each one",
          "Recent results beside the plan",
          "The NCAA contact-date checklist, as general guidance",
        ]}
      >
        <RoadmapInner schools={schools} />
      </PaidGate>
    </AuthGate>
  );
}

function RoadmapInner({ schools }: { schools: SchoolLite[] }) {
  const { player } = usePlayer();
  // The player's targets as the page found them.
  const [targetSlugs] = useState<string[]>(player.targetSchoolSlugs);

  const targetSchools = useMemo(
    () => schools.filter((s) => targetSlugs.includes(s.slug)),
    [schools, targetSlugs]
  );

  // One goal for /plan and /today (lib/hooks/use-plan-goal.ts): the one the
  // player set, or none — never the estimate (PR D, D1). No longer the hardest
  // target's floor — adding a target must not move the plan (C11).
  const planGoal = usePlanGoal(player);
  const roadmap = planGoal.roadmap;

  // Only show programs that match the player's recruiting gender.
  const pickerSchools = useMemo(() => {
    const g = programGenderFor(player.gender);
    return schools
      .filter((s) => s.gender === g)
      .sort((a, b) => b.avgRosterUTR - a.avgRosterUTR);
  }, [schools, player.gender]);

  return (
    <SeededRoadmapLayout
      player={player}
      targetSchools={targetSchools}
      roadmap={roadmap}
      pickerSchools={pickerSchools}
      planGoal={planGoal}
    />
  );
}

export interface RoadmapLayoutProps {
  player: ReturnType<typeof usePlayer>["player"];
  targetSchools: SchoolLite[];
  roadmap: RoadmapYear[];
  pickerSchools: SchoolLite[];
  planGoal: UsePlanGoalResult;
}
