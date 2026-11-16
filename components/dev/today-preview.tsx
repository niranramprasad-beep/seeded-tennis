"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Player, SchoolLite } from "@/lib/types";
import { SeededDashboardLayout } from "@/components/seeded/dashboard/seeded-dashboard-layout";
import {
  SundayCheckinDrawer,
  type SundayCheckinSaveInput,
} from "@/components/dashboard/sunday-checkin-drawer";
import { createUtrEntry } from "@/lib/db/plan";
import { generatePrepPlan, saveMatch } from "@/lib/db/events";

// Internal tool only — pixel-checks /today's real action-list/chart/targets
// rendering without signing in through real auth (local dev shares
// production's Supabase project). Not a route meant to ship; see
// app/dev/today-preview/page.tsx (404s in prod).
//
// The Sunday check-in drawer below is wired to the REAL createUtrEntry/
// saveMatch (same functions the real app uses) rather than a stub — this is
// still safe with no signed-in session: both bail out to a no-op (no
// network write) the moment they see no authed user id, exactly like every
// other real mutation already called from these dev-only pages. That's what
// makes it possible to click through the actual save flow here and watch
// `player`/`utrEntries`/`matches` update locally, proving the wiring works,
// without ever touching production data.
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
  const [player, setPlayer] = useState<Player>({
    ...MOCK_PLAYER,
    targetSchoolSlugs: targetSchools.map((s) => s.slug),
  });
  const [utrEntries, setUtrEntries] = useState<{ id: string; utr: number; recordedAt: string; note: string }[]>([
    { id: "seed-1", utr: 9.9, recordedAt: "2026-06-12", note: "" },
    { id: "seed-2", utr: 10.3, recordedAt: "2026-08-10", note: "" },
    { id: "seed-3", utr: 10.55, recordedAt: "2026-10-09", note: "" },
  ]);
  const [loggedMatchCount, setLoggedMatchCount] = useState(0);
  const [sundayCheckinOpen, setSundayCheckinOpen] = useState(false);
  const [sundayStatus, setSundayStatus] = useState<"idle" | "saving" | "error">("idle");
  const [sundayError, setSundayError] = useState("");

  const actualPoints = utrEntries.map((e) => ({ date: new Date(`${e.recordedAt}T00:00:00`), utr: e.utr }));
  const targetPoints = [
    { date: now, utr: player.currentUTR },
    { date: new Date(now.getFullYear() + 1, 5, 1), utr: 11.2 },
  ];

  const handleSaveSundayCheckin = async (input: SundayCheckinSaveInput) => {
    setSundayStatus("saving");
    setSundayError("");
    try {
      // Real call — returns null here since there's no authed session
      // (confirmed below by the local fallback path still firing).
      const savedUtr = await createUtrEntry({
        utr: input.utr,
        recordedAt: input.recordedAt,
        note: "Sunday check-in",
      });
      const utrEntry = savedUtr ?? {
        id: `local-${Date.now()}`,
        utr: input.utr,
        recordedAt: input.recordedAt,
        note: "Sunday check-in",
      };
      setUtrEntries((prev) => {
        const next = [...prev.filter((e) => e.id !== utrEntry.id), utrEntry].sort((a, b) =>
          a.recordedAt.localeCompare(b.recordedAt)
        );
        const mostRecent = next[next.length - 1];
        setPlayer((p) => ({ ...p, currentUTR: mostRecent.utr }));
        return next;
      });

      if (input.match) {
        const prepPlan = generatePrepPlan({
          weaknesses: player.weaknesses,
          surface: input.match.surface,
          currentUtr: input.utr,
          opponentUtr: null,
        });
        await saveMatch({
          matchDate: input.match.matchDate,
          opponent: input.match.opponent,
          surface: input.match.surface,
          prepPlan,
          result: input.match.result,
          score: input.match.score,
          notificationRequested: false,
        });
        setLoggedMatchCount((n) => n + 1);
      }

      setSundayCheckinOpen(false);
      setSundayStatus("idle");
    } catch (error) {
      setSundayStatus("error");
      setSundayError(error instanceof Error ? error.message : "Could not save your check-in.");
    }
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <p className="mb-4 rounded-lg border border-line bg-card px-4 py-2 text-xs text-stone">
        Dev harness state — UTR {player.currentUTR.toFixed(2)} · {utrEntries.length} entries logged ·{" "}
        {loggedMatchCount} match(es) logged this session
      </p>
      <SeededDashboardLayout
        firstName="Maya"
        tier="player"
        player={player}
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
        sundayCheckinDue
        setSundayCheckinOpen={setSundayCheckinOpen}
      />
      <SundayCheckinDrawer
        open={sundayCheckinOpen}
        currentUtr={player.currentUTR}
        loading={sundayStatus === "saving"}
        error={sundayError}
        onClose={() => {
          setSundayCheckinOpen(false);
          setSundayError("");
        }}
        onSave={handleSaveSundayCheckin}
      />
    </div>
  );
}
