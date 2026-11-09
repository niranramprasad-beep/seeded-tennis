"use client";

import dynamic from "next/dynamic";
import type { Player, SchoolLite } from "@/lib/types";
import { SeededDashboardLayout } from "@/components/seeded/dashboard/seeded-dashboard-layout";

// Internal tool only — pixel-checks /today's real action-list/chart/targets
// rendering without signing in through real auth (local dev shares
// production's Supabase project). Not a route meant to ship; see
// app/dev/today-preview/page.tsx (404s in prod).
const UTRTrajectoryChart = dynamic(
  () => import("@/components/charts/utr-trajectory-chart").then((mod) => mod.UTRTrajectoryChart),
  { ssr: false }
);

const MOCK_PLAYER: Player = {
  name: "Maya Chen",
  currentUTR: 10.75,
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
};

export function TodayPreview({ targetSchools }: { targetSchools: SchoolLite[] }) {
  const now = new Date();
  const actualPoints = [
    { date: new Date(now.getTime() - 150 * 86_400_000), utr: 9.9 },
    { date: new Date(now.getTime() - 90 * 86_400_000), utr: 10.3 },
    { date: new Date(now.getTime() - 30 * 86_400_000), utr: 10.55 },
    { date: now, utr: 10.75 },
  ];
  const targetPoints = [
    { date: now, utr: 10.75 },
    { date: new Date(now.getFullYear() + 1, 5, 1), utr: 11.2 },
  ];

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <SeededDashboardLayout
        firstName="Maya"
        tier="player"
        player={{ ...MOCK_PLAYER, targetSchoolSlugs: targetSchools.map((s) => s.slug) }}
        targetUTR={11.2}
        utrStatus="idle"
        utrError=""
        actualPoints={actualPoints}
        targetPoints={targetPoints}
        UTRTrajectoryChart={UTRTrajectoryChart}
        weeklyHours={0}
        weekSessions={[]}
        plannerState={null}
        targetSchools={targetSchools}
        setUtrDrawerOpen={() => {}}
        setCheckinDrawerOpen={() => {}}
      />
    </div>
  );
}
