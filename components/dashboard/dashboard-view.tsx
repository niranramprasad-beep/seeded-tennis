"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowUpRight,
  Calculator,
  Check,
  Compass,
  Plus,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import type { SchoolLite, WeekdayShort } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { buildRoadmap } from "@/lib/db/plan";
import { AuthGate } from "@/components/shared/auth-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { SchoolBadge } from "@/components/shared/school-badge";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { Reveal } from "@/components/shared/reveal";
import { useDesign } from "@/lib/context/design-context";
import { SeededDashboardLayout } from "@/components/seeded/dashboard/seeded-dashboard-layout";
import { DailyCheckinCard } from "./daily-checkin-card";
import { SundayCheckinDrawer, type SundayCheckinSaveInput } from "./sunday-checkin-drawer";
import { localDateKey } from "@/lib/time";
import { isSundayCheckinDue } from "@/lib/today-actions";
import { cn, formatUTR } from "@/lib/utils";
import {
  createUtrEntry,
  loadUtrEntries,
  type UtrEntry,
} from "@/lib/db/plan";
import {
  generatePrepPlan,
  loadMatches,
  saveMatch,
  type MatchRecord,
  loadTrainingPlannerState,
  type TrainingPlannerState,
} from "@/lib/db/events";

const WEEKDAYS: WeekdayShort[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EMPTY_PLANNER_STATE: TrainingPlannerState = {
  sessions: [],
  sessionTypes: [],
  plans: [],
  activePlanId: "",
  templates: [],
};

// Mon-Sun date keys for the week containing `today`, so "This week" can
// filter the player's real scheduled sessions instead of showing a generic
// template — the dashboard and /training must agree on what's planned.
function currentWeekDateKeys(today = new Date()): string[] {
  const weekday = today.getDay(); // 0=Sun..6=Sat
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateKey(d);
  });
}

// recharts is a genuinely heavy dependency — load it only on the client,
// only once this chart actually renders, instead of bundling it into
// /dashboard's main JS whether or not the chart is needed yet.
const UTRTrajectoryChart = dynamic(
  () => import("@/components/charts/utr-trajectory-chart").then((mod) => mod.UTRTrajectoryChart),
  { ssr: false, loading: () => <Skeleton className="h-72 w-full" /> }
);

interface DashboardViewProps {
  schools: SchoolLite[];
}

export function DashboardView(props: DashboardViewProps) {
  return (
    <AuthGate>
      <DashboardInner {...props} />
    </AuthGate>
  );
}

function DashboardInner({ schools }: DashboardViewProps) {
  const { player, updatePlayer } = usePlayer();
  const { tier } = useTier();
  // Same SWR key /training itself uses, so both pages share one fetch and
  // can never disagree about what's actually scheduled this week.
  const trainingStorageKey = `seeded.training.${player.name.replace(/\s+/g, "-").toLowerCase()}`;
  const { data: plannerState } = useSWR<TrainingPlannerState | null>(
    ["training-planner-state", trainingStorageKey],
    () => loadTrainingPlannerState(EMPTY_PLANNER_STATE)
  );
  const weekDateKeys = useMemo(() => currentWeekDateKeys(), []);
  const weekSessions = useMemo(() => {
    const sessions = plannerState?.sessions ?? [];
    return weekDateKeys.map((date, i) => ({
      day: WEEKDAYS[i],
      sessions: sessions.filter((s) => s.date === date),
    }));
  }, [plannerState, weekDateKeys]);
  const weeklyHours = useMemo(
    () =>
      weekSessions.reduce(
        (sum, d) => sum + d.sessions.reduce((s, sess) => s + sess.duration / 60, 0),
        0
      ),
    [weekSessions]
  );
  // SWR caches this under a stable key so flipping to another tab and back
  // shows the last-loaded entries instantly instead of a blank/loading
  // state, then quietly revalidates in the background.
  const {
    data: utrEntries = [],
    error: utrFetchError,
    isLoading: utrFetchLoading,
    mutate: mutateUtrEntries,
  } = useSWR<UtrEntry[]>("utr-entries", () => loadUtrEntries());
  // Same "matches" key /match-mode and /matches already use — one shared
  // fetch/cache across every page, so a match logged here (or there) shows
  // up everywhere else instantly, no refetch needed.
  const { data: matches = [], mutate: mutateMatches } = useSWR<MatchRecord[]>(
    "matches",
    () => loadMatches()
  );
  const [utrDrawerOpen, setUtrDrawerOpen] = useState(false);
  const [checkinDrawerOpen, setCheckinDrawerOpen] = useState(false);
  const [sundayCheckinOpen, setSundayCheckinOpen] = useState(false);
  const [sundayStatus, setSundayStatus] = useState<"idle" | "saving" | "error">("idle");
  const [sundayError, setSundayError] = useState("");
  const [utrStatus, setUtrStatus] = useState<"idle" | "loading" | "saving" | "error">("loading");
  const [utrError, setUtrError] = useState("");

  // "Now" captured once per mount (same convention as the Seeded dashboard
  // layout's own `now`) — real, not fabricated: it's only ever read against
  // the player's actual logged UTR history below.
  const now = useMemo(() => new Date(), []);
  const sundayCheckinDue = useMemo(() => isSundayCheckinDue(utrEntries, now), [utrEntries, now]);

  // Mirror SWR's fetch state into the existing status/error pair so the
  // render logic below (and the "saving"/"error" states the save flow
  // already manages) doesn't need to change.
  useEffect(() => {
    if (utrFetchLoading) {
      setUtrStatus("loading");
    } else if (utrFetchError) {
      setUtrStatus("error");
      setUtrError(
        utrFetchError instanceof Error ? utrFetchError.message : "Could not load UTR history."
      );
    } else {
      setUtrStatus((prev) => (prev === "loading" ? "idle" : prev));
    }
  }, [utrFetchLoading, utrFetchError]);

  const targetSchools = useMemo(
    () => schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)),
    [schools, player.targetSchoolSlugs]
  );

  const roadmap = useMemo(
    () => buildRoadmap(player, targetSchools),
    [player, targetSchools]
  );

  const targetUTR = roadmap[roadmap.length - 1]?.utrTarget ?? player.currentUTR;
  const firstName = player.name.trim().split(/\s+/)[0] || "";

  // Never invent data: with no logged entries yet, the only "actual" point is
  // the player's own current UTR from their profile — a real value, not a
  // fabricated history.
  const actualPoints = useMemo(() => {
    if (utrEntries.length === 0) {
      return [{ date: new Date(), utr: player.currentUTR }];
    }
    return utrEntries.map((e) => ({
      date: new Date(`${e.recordedAt}T00:00:00`),
      utr: e.utr,
    }));
  }, [utrEntries, player.currentUTR]);

  const targetPoints = useMemo(
    () => [
      { date: new Date(), utr: player.currentUTR },
      ...roadmap.map((y) => ({ date: new Date(y.calendarYear, 5, 1), utr: y.utrTarget })),
    ],
    [player.currentUTR, roadmap]
  );

  const handleSaveUtr = async (input: { utr: number; recordedAt: string; note: string }) => {
    setUtrStatus("saving");
    setUtrError("");
    try {
      const saved = await createUtrEntry(input);
      const entry =
        saved ??
        ({
          id: `local-${Date.now()}`,
          utr: input.utr,
          recordedAt: input.recordedAt,
          note: input.note,
        } satisfies UtrEntry);
      const nextEntries = [...utrEntries, entry].sort((a, b) =>
        a.recordedAt.localeCompare(b.recordedAt)
      );
      // Update SWR's cache directly with the known-correct result instead
      // of refetching — instant UI update, and `revalidate: false` means
      // the next real load doesn't pointlessly re-request the same page.
      mutateUtrEntries(nextEntries, { revalidate: false });
      // currentUTR must track whichever entry is most recently dated, not
      // whichever one was just logged — a backfilled older result must
      // never override a newer value already on record.
      const mostRecent = nextEntries[nextEntries.length - 1];
      updatePlayer({ currentUTR: mostRecent.utr });
      setUtrDrawerOpen(false);
      setUtrStatus("idle");
    } catch (error) {
      setUtrStatus("error");
      setUtrError(error instanceof Error ? error.message : "Could not save UTR entry.");
    }
  };

  // The Sunday check-in writes through the exact same two real functions as
  // the standalone UTR drawer (createUtrEntry) and Match mode (saveMatch) —
  // no third parallel data-entry mechanism — so a submission here is
  // immediately the same real data /plan's chart and match history already
  // read, not a separate record that needs reconciling later.
  const handleSaveSundayCheckin = async (input: SundayCheckinSaveInput) => {
    setSundayStatus("saving");
    setSundayError("");
    try {
      const savedUtr = await createUtrEntry({
        utr: input.utr,
        recordedAt: input.recordedAt,
        note: "Sunday check-in",
      });
      const utrEntry =
        savedUtr ??
        ({
          id: `local-${Date.now()}`,
          utr: input.utr,
          recordedAt: input.recordedAt,
          note: "Sunday check-in",
        } satisfies UtrEntry);
      const nextEntries = [...utrEntries.filter((e) => e.id !== utrEntry.id), utrEntry].sort(
        (a, b) => a.recordedAt.localeCompare(b.recordedAt)
      );
      mutateUtrEntries(nextEntries, { revalidate: false });
      // Same "most recently DATED, not most recently logged" rule as the
      // standalone UTR drawer above.
      const mostRecent = nextEntries[nextEntries.length - 1];
      updatePlayer({ currentUTR: mostRecent.utr });

      if (input.match) {
        const prepPlan = generatePrepPlan({
          weaknesses: player.weaknesses,
          surface: input.match.surface,
          currentUtr: input.utr,
          opponentUtr: null,
        });
        const savedMatch = await saveMatch({
          matchDate: input.match.matchDate,
          opponent: input.match.opponent,
          surface: input.match.surface,
          prepPlan,
          result: input.match.result,
          score: input.match.score,
          notificationRequested: false,
        });
        if (savedMatch) {
          mutateMatches(
            (prev = []) => [savedMatch, ...prev.filter((m) => m.id !== savedMatch.id)],
            { revalidate: false }
          );
        }
      }

      setSundayCheckinOpen(false);
      setSundayStatus("idle");
    } catch (error) {
      setSundayStatus("error");
      setSundayError(error instanceof Error ? error.message : "Could not save your check-in.");
    }
  };

  const { design } = useDesign();
  const layoutProps = {
    firstName,
    tier,
    player,
    targetUTR,
    utrStatus,
    utrError,
    actualPoints,
    targetPoints,
    UTRTrajectoryChart,
    weeklyHours,
    weekSessions,
    plannerState,
    targetSchools,
    setUtrDrawerOpen,
    setCheckinDrawerOpen,
    sundayCheckinDue,
    setSundayCheckinOpen,
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      {design === "seeded" ? (
        <SeededDashboardLayout {...layoutProps} />
      ) : (
        <LegacyDashboardLayout {...layoutProps} />
      )}

      <UtrLogDrawer
        open={utrDrawerOpen}
        currentUtr={player.currentUTR}
        loading={utrStatus === "saving"}
        error={utrError}
        onClose={() => {
          setUtrDrawerOpen(false);
          setUtrError("");
        }}
        onSave={handleSaveUtr}
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

      <Drawer open={checkinDrawerOpen} onClose={() => setCheckinDrawerOpen(false)}>
        <DailyCheckinCard />
      </Drawer>
    </div>
  );
}

export interface DashboardLayoutProps {
  firstName: string;
  tier: ReturnType<typeof useTier>["tier"];
  player: ReturnType<typeof usePlayer>["player"];
  targetUTR: number;
  utrStatus: "idle" | "loading" | "saving" | "error";
  utrError: string;
  actualPoints: { date: Date; utr: number }[];
  targetPoints: { date: Date; utr: number }[];
  UTRTrajectoryChart: typeof UTRTrajectoryChart;
  weeklyHours: number;
  weekSessions: { day: WeekdayShort; sessions: TrainingPlannerState["sessions"] }[];
  plannerState: TrainingPlannerState | null | undefined;
  targetSchools: SchoolLite[];
  setUtrDrawerOpen: (v: boolean) => void;
  setCheckinDrawerOpen: (v: boolean) => void;
  /** Real, computed from the player's own UTR history — lib/today-actions.ts's
   * isSundayCheckinDue. True only on an actual Sunday (with nothing logged
   * yet today) or when genuinely overdue (7+ days since the last entry). */
  sundayCheckinDue: boolean;
  setSundayCheckinOpen: (v: boolean) => void;
}

function LegacyDashboardLayout({
  firstName,
  tier,
  player,
  targetUTR,
  utrStatus,
  utrError,
  actualPoints,
  targetPoints,
  UTRTrajectoryChart,
  weeklyHours,
  weekSessions,
  plannerState,
  targetSchools,
  setUtrDrawerOpen,
  setCheckinDrawerOpen,
  sundayCheckinDue,
  setSundayCheckinOpen,
}: DashboardLayoutProps) {
  return (
    <>
      {/* greeting */}
      <Reveal className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow text-gold">Your workspace</span>
          <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
            {firstName ? `Good to see you, ${firstName}.` : "Good to see you."}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tier === "free" ? "outline" : "leaf"} size="md">
            {tier === "free"
              ? "Free plan"
              : tier === "player"
                ? "Player plan"
                : "Family plan"}
          </Badge>
          <Button variant="primary" size="sm" onClick={() => setUtrDrawerOpen(true)}>
            <Plus className="h-4 w-4" />
            Update UTR
          </Button>
        </div>
      </Reveal>

      {sundayCheckinDue && (
        <Reveal className="mt-6">
          <Card className="flex flex-wrap items-center justify-between gap-4 border-grass/25 bg-grass-50 p-5">
            <div>
              <p className="font-medium text-ink">Sunday check-in</p>
              <p className="text-sm text-stone">
                Quick weekly update — your UTR, plus a match result if you played one.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setSundayCheckinOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Start check-in
            </Button>
          </Card>
        </Reveal>
      )}

      <div className="mt-8 space-y-8">
        {/* job 1: show progress */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal index={1} className="min-w-0 lg:col-span-2">
            <Card className="h-full p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-ink">Your UTR progress</h2>
                {utrStatus === "error" && (
                  <p className="text-xs text-error">{utrError}</p>
                )}
              </div>
              <div className="mt-4">
                <UTRTrajectoryChart
                  actualEntries={actualPoints}
                  targetPoints={targetPoints}
                  graduationYear={player.graduationYear}
                  targetUTR={targetUTR}
                  gender={player.gender}
                />
              </div>
            </Card>
          </Reveal>

          {/* The dashboard's thesis moment — the one number a player opens
              this page to check — so it's the one place on this page that
              spends the "bold" budget: biggest/heaviest type on the page,
              plus a single restrained court-line accent bleeding off the
              corner. No gradient/glow fill on the card itself (Phase 4
              deliberately removed those everywhere else; this stays solid
              bg-grass like every other themed surface). */}
          <Reveal index={2}>
            <Card className="relative flex h-full flex-col justify-center overflow-hidden bg-grass p-6 text-on-primary shadow-glow">
              <svg
                viewBox="0 0 160 160"
                aria-hidden
                className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 text-on-primary/20"
              >
                {/* Two concentric quarter-circles centered on the card's
                    own bottom-right corner (160,160) — the only part of
                    this box the card's `overflow-hidden` doesn't clip away,
                    so the curves read as court sidelines sweeping in from
                    the corner rather than vanishing off-card. */}
                <path
                  d="M20 160 A140 140 0 0 1 160 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M60 160 A100 100 0 0 1 160 60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <p className="text-sm text-on-primary/80">Your current UTR</p>
              <div className="relative mt-1 text-6xl font-bold tracking-tight sm:text-7xl">
                <AnimatedNumber key={player.currentUTR} value={player.currentUTR} decimals={1} />
              </div>
              <p className="relative mt-3 text-sm text-on-primary/80">
                {targetUTR > player.currentUTR
                  ? `+${formatUTR(targetUTR - player.currentUTR)} to reach your ${formatUTR(targetUTR)} goal`
                  : "You're at or above your current goal"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="relative mt-4 border-on-primary/30 bg-transparent text-on-primary hover:bg-on-primary/10"
                onClick={() => setUtrDrawerOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Log a new UTR
              </Button>
            </Card>
          </Reveal>
        </div>

        {/* job 2: what to do this week */}
        <Reveal index={3}>
          <Card className="p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-ink">This week</h2>
                <p className="text-sm text-stone">
                  {Math.round(weeklyHours * 10) / 10} hrs planned
                </p>
              </div>
              <Link
                href="/training"
                className="flex min-h-11 shrink-0 items-center gap-1 text-sm text-grass transition-colors hover:text-grass-600"
              >
                Open planner
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-4 space-y-1.5">
              {weekSessions.map(({ day, sessions }, i) => {
                const hours = sessions.reduce((sum, s) => sum + s.duration / 60, 0);
                return (
                  <Reveal
                    key={day}
                    index={i}
                    step={0.04}
                    className="flex items-center gap-3 rounded-xl border-[0.5px] border-line bg-cream/50 px-3 py-2.5"
                  >
                    <span className="w-9 shrink-0 text-xs font-medium uppercase text-stone-light">
                      {day}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                      {sessions.length === 0 ? (
                        <span className="text-xs text-stone-light">Rest day</span>
                      ) : (
                        sessions.map((s) => {
                          const type = plannerState?.sessionTypes.find((t) => t.id === s.typeId);
                          return (
                            <span
                              key={s.id}
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-medium",
                                type?.bg ?? "bg-grass-50",
                                type?.text ?? "text-grass-700"
                              )}
                            >
                              {type?.label ?? s.title}
                            </span>
                          );
                        })
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-stone">
                      {Math.round(hours * 10) / 10}h
                    </span>
                  </Reveal>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              onClick={() => setCheckinDrawerOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              Log today's check-in
            </Button>
          </Card>
        </Reveal>

        {/* job 3: target schools */}
        <Reveal index={4}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-ink">Your target schools</h2>
            <Link
              href="/roadmap"
              className="flex min-h-11 items-center gap-1 text-sm text-grass transition-colors hover:text-grass-600"
            >
              Full roadmap
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          {targetSchools.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {targetSchools.map((s, i) => (
                <Reveal key={s.id} index={i} step={0.05}>
                  <Link href={`/schools/${s.slug}`}>
                    <Card interactive className="flex items-center gap-3 p-4">
                      <SchoolBadge school={s} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">
                          {s.shortName}
                        </p>
                        <p className="text-xs text-stone-light">
                          Avg UTR {s.avgRosterUTR} · {s.conference}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-stone-light" />
                    </Card>
                  </Link>
                </Reveal>
              ))}
            </div>
          ) : (
            <Card className="mt-4 p-6 text-center">
              <p className="text-sm text-stone">
                You haven't picked any target schools yet.
              </p>
              <Link
                href="/schools"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-grass hover:text-grass-600"
              >
                Browse schools
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Card>
          )}
        </Reveal>

        {/* quick links — kept so match history and cost calculator stay
            reachable without crowding the three sections above */}
        <Reveal index={5} className="flex flex-wrap gap-2 border-t-[0.5px] border-line pt-6">
          <QuickLink href="/match-mode" icon={Trophy} label="Match mode" />
          <QuickLink href="/matches" icon={Target} label="Match history" />
          <QuickLink href="/tournament-fit" icon={Compass} label="Tournament fit" />
          <QuickLink href="/cost-calculator" icon={Calculator} label="Cost calculator" />
        </Reveal>
      </div>
    </>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Target;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-11 items-center gap-2 rounded-pill border-[0.5px] border-line bg-card px-4 py-2.5 text-sm font-medium text-stone transition-all hover:-translate-y-0.5 hover:border-grass/25 hover:bg-grass-50 hover:text-ink hover:shadow-soft"
    >
      <Icon className="h-4 w-4 text-grass" />
      {label}
    </Link>
  );
}

function UtrLogDrawer({
  open,
  currentUtr,
  loading,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  currentUtr: number;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSave: (input: { utr: number; recordedAt: string; note: string }) => void;
}) {
  const [utr, setUtr] = useState(currentUtr.toFixed(1));
  const [recordedAt, setRecordedAt] = useState(localDateKey());
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUtr(currentUtr.toFixed(1));
    setRecordedAt(localDateKey());
    setNote("");
    setLocalError("");
  }, [currentUtr, open]);

  const submit = () => {
    const value = Number(utr);
    if (!Number.isFinite(value) || value < 1 || value > 16.5) {
      setLocalError("Enter a UTR between 1.00 and 16.50.");
      return;
    }
    if (!recordedAt) {
      setLocalError("Choose the date this rating was recorded.");
      return;
    }
    onSave({ utr: value, recordedAt, note });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Update UTR"
      title="Log a verified rating"
      footer={
        <Button className="w-full" onClick={submit} disabled={loading}>
          {loading ? "Saving..." : "Save UTR entry"}
          <Check className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-5">
        {(localError || error) && (
          <p className="rounded-xl bg-error-bg px-4 py-3 text-sm text-error">
            {localError || error}
          </p>
        )}
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-light">Current UTR</span>
          <input
            type="number"
            min={1}
            max={16.5}
            step={0.01}
            value={utr}
            onChange={(event) => setUtr(event.target.value)}
            className="h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-light">Date</span>
          <input
            type="date"
            value={recordedAt}
            onChange={(event) => setRecordedAt(event.target.value)}
            className="h-12 w-full rounded-xl border-[0.5px] border-line bg-card px-4 text-base text-ink focus:outline-none focus:ring-2 focus:ring-grass/30"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-stone-light">Optional note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Example: new verified singles result after L4 Bethesda draw"
            className="min-h-[104px] w-full rounded-xl border-[0.5px] border-line bg-card px-4 py-3 text-sm text-ink placeholder:text-stone-light focus:outline-none focus:ring-2 focus:ring-grass/30"
          />
        </label>
      </div>
    </Drawer>
  );
}
