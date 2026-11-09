"use client";

import type { Player } from "@/lib/types";
import type { MatchRecord } from "@/lib/supabase/features";
import type { TournamentEntry } from "@/lib/supabase/tournaments";
import type { TrainingPlannerSession } from "@/lib/supabase/training";
import { DEFAULT_TYPES } from "@/components/training/training-view";
import { SeededEventsLayout } from "@/components/seeded/events/seeded-events-layout";

// Internal tool only — pixel-checks /events' real layout (header, fit
// verdicts, recent results, month calendar) with populated data, without
// signing in through real auth (local dev shares production's Supabase
// project). Renders SeededEventsLayout directly with mock props instead of
// going through EventsInner's real SWR loaders (which would come back
// empty for an unauthenticated preview session) — same pattern as
// OutreachPreview/PlanPreview. Not a route meant to ship; see
// app/dev/events-preview/page.tsx (404s in prod).
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
};

function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

const MOCK_TOURNAMENTS: TournamentEntry[] = [
  {
    id: "t-1",
    name: "L3 Richmond Winter",
    level: "L3",
    eventDate: daysFromNow(6),
    city: "Richmond",
    state: "VA",
    travelHours: 2,
    distanceMiles: null,
    drawUtr: 9.6,
    goalUtr: 10,
    entryCost: 95,
    travelCost: 60,
    status: "saved",
    createdAt: new Date().toISOString(),
  },
  {
    id: "t-2",
    name: "L5 Bethesda Open",
    level: "L5",
    eventDate: daysFromNow(7),
    city: "Bethesda",
    state: "MD",
    travelHours: 0.5,
    distanceMiles: null,
    drawUtr: 6.8,
    goalUtr: 10,
    entryCost: 65,
    travelCost: 0,
    status: "saved",
    createdAt: new Date().toISOString(),
  },
  {
    id: "t-3",
    name: "L3 Norfolk Open",
    level: "L3",
    eventDate: daysFromNow(21),
    city: "Norfolk",
    state: "VA",
    travelHours: 3.5,
    distanceMiles: null,
    drawUtr: 9.4,
    goalUtr: 10,
    entryCost: 95,
    travelCost: 180,
    status: "saved",
    createdAt: new Date().toISOString(),
  },
];

const MOCK_MATCHES: MatchRecord[] = [
  {
    id: "m-1",
    matchDate: daysAgo(7),
    opponent: "",
    opponentUtr: 9.8,
    tournamentName: "L3 Richmond Fall · R16",
    surface: "hard",
    prepPlan: { warmup: [], tactics: [], mental: [], matchDay: [], generatedAt: new Date().toISOString() },
    notificationRequested: false,
    result: "win",
    score: "6-4 6-3",
    worked: "",
    needsWork: "",
    notes: "",
    videoUrl: "",
    aiAnalysis: null,
  },
  {
    id: "m-2",
    matchDate: daysAgo(8),
    opponent: "",
    opponentUtr: 9.3,
    tournamentName: "L3 Richmond Fall · R32",
    surface: "hard",
    prepPlan: { warmup: [], tactics: [], mental: [], matchDay: [], generatedAt: new Date().toISOString() },
    notificationRequested: false,
    result: "win",
    score: "6-2 7-5",
    worked: "",
    needsWork: "",
    notes: "",
    videoUrl: "",
    aiAnalysis: null,
  },
  {
    id: "m-3",
    matchDate: daysAgo(21),
    opponent: "",
    opponentUtr: 10.2,
    tournamentName: "L2 Norfolk · QF",
    surface: "hard",
    prepPlan: { warmup: [], tactics: [], mental: [], matchDay: [], generatedAt: new Date().toISOString() },
    notificationRequested: false,
    result: "loss",
    score: "4-6 3-6",
    worked: "",
    needsWork: "",
    notes: "",
    videoUrl: "",
    aiAnalysis: null,
  },
];

const MOCK_SESSIONS: TrainingPlannerSession[] = [
  { id: "s-1", title: "Drills", typeId: "tennis", day: "Mon", date: "", startTime: "16:00", duration: 60, intensity: "moderate", notes: "", goals: "", drills: [], completed: false },
  { id: "s-2", title: "Fitness", typeId: "strength", day: "Tue", date: "", startTime: "16:00", duration: 45, intensity: "moderate", notes: "", goals: "", drills: [], completed: false },
  { id: "s-3", title: "Match play", typeId: "match-prep", day: "Wed", date: "", startTime: "16:00", duration: 90, intensity: "high", notes: "", goals: "", drills: [], completed: false },
  { id: "s-4", title: "Drills", typeId: "tennis", day: "Fri", date: "", startTime: "16:00", duration: 60, intensity: "moderate", notes: "", goals: "", drills: [], completed: false },
  { id: "s-5", title: "Fitness", typeId: "strength", day: "Sat", date: "", startTime: "10:00", duration: 45, intensity: "moderate", notes: "", goals: "", drills: [], completed: false },
  { id: "s-6", title: "Coach call", typeId: "mental", day: "Thu", date: "", startTime: "17:00", duration: 20, intensity: "low", notes: "", goals: "", drills: [], completed: false },
];

export function EventsPreview() {
  return (
    <SeededEventsLayout
      player={MOCK_PLAYER}
      tournamentEntries={MOCK_TOURNAMENTS}
      matches={MOCK_MATCHES}
      sessions={MOCK_SESSIONS}
      sessionTypes={DEFAULT_TYPES}
      onMarkEntered={() => {}}
      onAddSession={() => {}}
      onLogResult={() => {}}
    />
  );
}
