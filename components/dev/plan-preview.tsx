"use client";

import type { Player, SchoolLite, RoadmapYear } from "@/lib/types";
import { SeededRoadmapLayout } from "@/components/seeded/roadmap/seeded-roadmap-layout";

// Internal tool only — pixel-checks /plan's real profile stats/trajectory
// chart/checklist rendering without signing in through real auth (local dev
// shares production's Supabase project). Not a route meant to ship; see
// app/dev/plan-preview/page.tsx (404s in prod).
const MOCK_PLAYER: Player = {
  name: "Maya Chen",
  currentUTR: 9.42,
  graduationYear: 2028,
  commitmentDate: "2027-09-01",
  gender: "female",
  country: "United States",
  role: "player",
  targetSchoolSlugs: [],
  weaknesses: [],
  tournamentsPlayed: 6,
  tournamentsGoal: 12,
  onboarded: true,
  utrProfileLink: "app.utrsports.net/profiles/MC2024",
};

const MOCK_ROADMAP: RoadmapYear[] = [
  { calendarYear: 2026, gradeLabel: "By summer before 11th grade", shortLabel: "Pre-11", utrTarget: 9.7, tournamentsNeeded: 8, milestones: [] },
  { calendarYear: 2027, gradeLabel: "By summer before 12th grade", shortLabel: "Pre-12", utrTarget: 9.9, tournamentsNeeded: 10, milestones: [] },
];

export function PlanPreview({ targetSchools }: { targetSchools: SchoolLite[] }) {
  return (
    <SeededRoadmapLayout
      player={{ ...MOCK_PLAYER, targetSchoolSlugs: targetSchools.map((s) => s.slug) }}
      whatIf={targetSchools.map((s) => s.slug)}
      openStage={null}
      setOpenStage={() => {}}
      targetSchools={targetSchools}
      roadmap={MOCK_ROADMAP}
      goalUTR={9.9}
      chartData={[]}
      pickerSchools={targetSchools}
      toggle={() => {}}
    />
  );
}
