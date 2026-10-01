"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Calculator,
  Check,
  Compass,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import type { School, TrainingPlan } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { buildRoadmap } from "@/lib/data";
import { AuthGate } from "@/components/shared/auth-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { UTRTrajectoryChart } from "@/components/charts/utr-trajectory-chart";
import { SchoolBadge } from "@/components/shared/school-badge";
import { DailyCheckinCard } from "./daily-checkin-card";
import { ACTIVITY_META } from "@/lib/activity-style";
import { cn } from "@/lib/utils";
import {
  createUtrEntry,
  loadUtrEntries,
  type UtrEntry,
} from "@/lib/supabase/utr";

interface DashboardViewProps {
  schools: School[];
  plans: TrainingPlan[];
}

export function DashboardView(props: DashboardViewProps) {
  return (
    <AuthGate>
      <DashboardInner {...props} />
    </AuthGate>
  );
}

function DashboardInner({ schools, plans }: DashboardViewProps) {
  const { player, updatePlayer } = usePlayer();
  const { tier } = useTier();
  const [utrEntries, setUtrEntries] = useState<UtrEntry[]>([]);
  const [utrDrawerOpen, setUtrDrawerOpen] = useState(false);
  const [checkinDrawerOpen, setCheckinDrawerOpen] = useState(false);
  const [utrStatus, setUtrStatus] = useState<"idle" | "loading" | "saving" | "error">("loading");
  const [utrError, setUtrError] = useState("");

  const targetSchools = useMemo(
    () => schools.filter((s) => player.targetSchoolSlugs.includes(s.slug)),
    [schools, player.targetSchoolSlugs]
  );

  const roadmap = useMemo(
    () => buildRoadmap(player, targetSchools),
    [player, targetSchools]
  );

  const plan = useMemo(
    () =>
      plans.reduce((best, p) =>
        Math.abs(p.utrLevel - player.currentUTR) <
        Math.abs(best.utrLevel - player.currentUTR)
          ? p
          : best
      ),
    [plans, player.currentUTR]
  );

  const targetUTR = roadmap[roadmap.length - 1]?.utrTarget ?? player.currentUTR;
  const firstName = player.name.trim().split(/\s+/)[0] || "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setUtrStatus("loading");
        const entries = await loadUtrEntries();
        if (!cancelled) {
          setUtrEntries(entries);
          setUtrStatus("idle");
        }
      } catch (error) {
        if (!cancelled) {
          setUtrStatus("error");
          setUtrError(error instanceof Error ? error.message : "Could not load UTR history.");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setUtrEntries((prev) =>
        [...prev, entry].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
      );
      updatePlayer({ currentUTR: input.utr });
      setUtrDrawerOpen(false);
      setUtrStatus("idle");
    } catch (error) {
      setUtrStatus("error");
      setUtrError(error instanceof Error ? error.message : "Could not save UTR entry.");
    }
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      {/* greeting */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
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
      </div>

      <div className="mt-8 space-y-8">
        {/* job 1: show progress */}
        <Card className="p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-ink">Your UTR progress</h2>
            {utrStatus === "error" && (
              <p className="text-xs text-[#9C3B22]">{utrError}</p>
            )}
          </div>
          <div className="mt-4">
            <UTRTrajectoryChart
              actualEntries={actualPoints}
              targetPoints={targetPoints}
              graduationYear={player.graduationYear}
              targetUTR={targetUTR}
            />
          </div>
        </Card>

        {/* job 2: what to do this week */}
        <Card className="p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-ink">This week</h2>
              <p className="text-sm text-stone">{plan.weeklyHours} hrs planned</p>
            </div>
            <Link
              href="/training"
              className="flex shrink-0 items-center gap-1 text-sm text-grass transition-colors hover:text-grass-600"
            >
              Open planner
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-4 space-y-1.5">
            {plan.days.map((d) => {
              const hours = d.activities.reduce((sum, a) => sum + a.hours, 0);
              return (
                <div
                  key={d.day}
                  className="flex items-center gap-3 rounded-xl border-[0.5px] border-line bg-cream/50 px-3 py-2.5"
                >
                  <span className="w-9 shrink-0 text-xs font-medium uppercase text-stone-light">
                    {d.day}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                    {d.activities.length === 0 ? (
                      <span className="text-xs text-stone-light">Rest day</span>
                    ) : (
                      d.activities.map((a) => (
                        <span
                          key={a.id}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            ACTIVITY_META[a.type].chipBg,
                            ACTIVITY_META[a.type].chipText
                          )}
                        >
                          {ACTIVITY_META[a.type].label}
                        </span>
                      ))
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-stone">{hours}h</span>
                </div>
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

        {/* job 3: target schools */}
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-ink">Your target schools</h2>
            <Link
              href="/roadmap"
              className="flex items-center gap-1 text-sm text-grass transition-colors hover:text-grass-600"
            >
              Full roadmap
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          {targetSchools.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {targetSchools.map((s) => (
                <Link key={s.id} href={`/schools/${s.slug}`}>
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
        </div>

        {/* quick links — kept so match history, badges, and cost calculator
            stay reachable without crowding the three sections above */}
        <div className="flex flex-wrap gap-2 border-t-[0.5px] border-line pt-6">
          <QuickLink href="/match-mode" icon={Trophy} label="Match mode" />
          <QuickLink href="/matches" icon={Target} label="Match history" />
          <QuickLink href="/tournament-fit" icon={Compass} label="Tournament fit" />
          <QuickLink href="/badges" icon={ShieldCheck} label="Badges" />
          <QuickLink href="/cost-calculator" icon={Calculator} label="Cost calculator" />
        </div>
      </div>

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

      <Drawer open={checkinDrawerOpen} onClose={() => setCheckinDrawerOpen(false)}>
        <DailyCheckinCard player={player} trainingHours={plan.weeklyHours} />
      </Drawer>
    </div>
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
      className="group flex items-center gap-2 rounded-pill border-[0.5px] border-line bg-card px-4 py-2.5 text-sm font-medium text-stone transition-all hover:-translate-y-0.5 hover:border-grass/25 hover:bg-grass-50 hover:text-ink hover:shadow-soft"
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
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setUtr(currentUtr.toFixed(1));
    setRecordedAt(new Date().toISOString().slice(0, 10));
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
          <p className="rounded-xl bg-[#FBEAE5] px-4 py-3 text-sm text-[#9C3B22]">
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
