"use client";

import { useState } from "react";
import type { Player } from "@/lib/types";
import type { MatchRecord } from "@/lib/db/events";
import type { TournamentEntry } from "@/lib/db/events";
import type { TrainingSession } from "@/lib/db/training";
import { dateForWeekday } from "@/lib/training/grid-math";
import { localDateKey } from "@/lib/time";
import { SeededEventsLayout } from "@/components/seeded/events/seeded-events-layout";
import { SessionFormModal } from "@/components/seeded/events/session-form-modal";

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
  birthMonth: null,
  enrollmentTerm: null,
};

function daysFromNow(n: number): string {
  const d = new Date();
  return localDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

const MOCK_TOURNAMENTS: TournamentEntry[] = [
  {
    id: "t-1",
    userId: "preview-player",
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
    userId: "preview-player",
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
    userId: "preview-player",
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

// Real dates in the current week — both calendar views place a session by
// its stored date.
const MOCK_SESSIONS: TrainingSession[] = [
  { id: "s-1", typeId: "tennis", date: dateForWeekday("Mon"), startTime: "16:00", duration: 60, notes: "", seriesId: null },
  { id: "s-2", typeId: "strength", date: dateForWeekday("Tue"), startTime: "16:00", duration: 45, notes: "", seriesId: null },
  { id: "s-3", typeId: "match-prep", date: dateForWeekday("Wed"), startTime: "16:00", duration: 90, notes: "", seriesId: null },
  { id: "s-4", typeId: "tennis", date: dateForWeekday("Fri"), startTime: "16:00", duration: 60, notes: "", seriesId: null },
  { id: "s-5", typeId: "strength", date: dateForWeekday("Sat"), startTime: "10:00", duration: 45, notes: "", seriesId: null },
  { id: "s-6", typeId: "mental", date: dateForWeekday("Thu"), startTime: "17:00", duration: 20, notes: "", seriesId: null },
];

// Internal tool only, unauthenticated: local state stands in for the real
// per-row writes (lib/db/training.ts), so nothing here reaches Supabase.
export function EventsPreview() {
  const [sessions, setSessions] = useState<TrainingSession[]>(MOCK_SESSIONS);
  const [form, setForm] = useState<{ session: TrainingSession | null; date?: string; time?: string } | null>(null);
  const patch = (id: string, p: Partial<TrainingSession>) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));

  return (
    <>
      <SeededEventsLayout
        player={MOCK_PLAYER}
        tournamentEntries={MOCK_TOURNAMENTS}
        matches={MOCK_MATCHES}
        sessions={sessions}
        onMarkEntered={() => {}}
        onAddSession={(date, time) => setForm({ session: null, date, time })}
        onEditSession={(session) => setForm({ session })}
        onMoveSession={(id, date, startTime) => patch(id, { date, startTime })}
        onResizeSession={(id, duration) => patch(id, { duration })}
        onLogResult={() => {}}
      />
      <SessionFormModal
        open={!!form}
        onClose={() => setForm(null)}
        session={form?.session ?? null}
        defaultDate={form?.date}
        defaultTime={form?.time}
        onSave={(v) => {
          const editing = form?.session;
          setForm(null);
          if (editing) patch(editing.id, v);
          else setSessions((prev) => [...prev, { id: `s-${Date.now()}`, seriesId: null, ...v }]);
        }}
        onDelete={() => {
          const editing = form?.session;
          setForm(null);
          if (editing) setSessions((prev) => prev.filter((s) => s.id !== editing.id));
        }}
      />
    </>
  );
}
