"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Calculator,
  Compass,
  Plus,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SchoolBadge } from "@/components/shared/school-badge";
import { Reveal } from "@/components/shared/reveal";
import { SpotlightCard } from "@/components/shared/spotlight-card";
import { BentoGrid, BentoCell } from "@/components/seeded/shared/bento-grid";
import { cn, formatUTR } from "@/lib/utils";
import type { DashboardLayoutProps } from "@/components/dashboard/dashboard-view";

// A real "command center" composition instead of Legacy's stacked-cards
// layout: a bento grid, and the UTR hero is a glowing progress RING (not
// just a number) toward the goal. Reuses the exact same props/data
// dashboard-view.tsx already computes — no new state, no new fetches.
export function SeededDashboardLayout({
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
}: DashboardLayoutProps) {
  const progress = targetUTR > 0 ? Math.min(1, player.currentUTR / targetUTR) : 0;
  const radius = 72;
  const circumference = 2 * Math.PI * radius;

  return (
    <>
      <Reveal className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
            Your workspace
          </span>
          <h1 className="mt-3 font-seeded text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {firstName ? `Good to see you, ${firstName}.` : "Good to see you."}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={tier === "free" ? "outline" : "leaf"} size="md">
            {tier === "free" ? "Free plan" : tier === "player" ? "Player plan" : "Family plan"}
          </Badge>
          <button
            onClick={() => setUtrDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-pill px-4 py-2 font-seeded text-sm font-semibold text-white shadow-seeded-1"
            style={{ background: "var(--s-accent-gradient)" }}
          >
            <Plus className="h-4 w-4" />
            Update UTR
          </button>
        </div>
      </Reveal>

      <BentoGrid className="mt-8">
        <BentoCell span={8}>
          <Reveal index={1} className="h-full">
            <SpotlightCard className="seeded-glass flex h-full flex-col rounded-[24px] p-5 shadow-seeded-1 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="font-seeded text-lg font-medium text-ink">Your UTR progress</h2>
                {utrStatus === "error" && <p className="text-xs text-error">{utrError}</p>}
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
            </SpotlightCard>
          </Reveal>
        </BentoCell>

        {/* The dashboard's thesis moment: a glowing progress ring toward
            the goal UTR, not just a flat number. */}
        <BentoCell span={4}>
          <Reveal index={2} className="h-full">
            <div className="seeded-glass relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[24px] p-6 text-center shadow-seeded-2">
              <p className="font-seeded text-sm text-stone">Current UTR</p>
              <div className="relative mt-3 flex h-[180px] w-[180px] items-center justify-center">
                <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="none"
                    stroke="rgb(var(--c-line))"
                    strokeWidth="10"
                  />
                  <circle
                    cx="90"
                    cy="90"
                    r={radius}
                    fill="none"
                    stroke="rgb(var(--c-primary))"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - progress)}
                    style={{
                      transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)",
                      filter: "drop-shadow(0 0 10px rgb(var(--c-primary) / 0.6))",
                    }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-mono text-4xl text-ink">{formatUTR(player.currentUTR)}</span>
                  <span className="mt-1 font-seeded text-[11px] text-stone-light">
                    goal {formatUTR(targetUTR)}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-stone">
                {targetUTR > player.currentUTR
                  ? `+${formatUTR(targetUTR - player.currentUTR)} to reach your goal`
                  : "You're at or above your current goal"}
              </p>
              <button
                onClick={() => setUtrDrawerOpen(true)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill border border-[rgb(var(--c-line))] py-2 font-seeded text-xs font-semibold text-ink"
              >
                <Plus className="h-3.5 w-3.5" />
                Log a new UTR
              </button>
            </div>
          </Reveal>
        </BentoCell>

        <BentoCell span={7}>
          <Reveal index={3} className="h-full">
            <SpotlightCard className="seeded-glass flex h-full flex-col rounded-[24px] p-5 shadow-seeded-1 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-seeded text-lg font-medium text-ink">This week</h2>
                  <p className="text-sm text-stone">{Math.round(weeklyHours * 10) / 10} hrs planned</p>
                </div>
                <Link
                  href="/training"
                  className="flex min-h-11 shrink-0 items-center gap-1 font-seeded text-sm text-grass"
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
                      className="flex items-center gap-3 rounded-xl border border-[rgb(var(--c-line))] px-3 py-2.5"
                    >
                      <span className="w-9 shrink-0 font-mono text-xs uppercase text-stone-light">{day}</span>
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
                                  "rounded-full px-2 py-0.5 font-seeded text-xs font-medium",
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
                      <span className="shrink-0 font-mono text-xs text-stone">
                        {Math.round(hours * 10) / 10}h
                      </span>
                    </Reveal>
                  );
                })}
              </div>

              <button
                onClick={() => setCheckinDrawerOpen(true)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-pill border border-[rgb(var(--c-line))] py-2.5 font-seeded text-sm font-semibold text-ink"
              >
                <Sparkles className="h-4 w-4" />
                Log today's check-in
              </button>
            </SpotlightCard>
          </Reveal>
        </BentoCell>

        <BentoCell span={5}>
          <Reveal index={4} className="h-full">
            <div className="seeded-glass flex h-full flex-col rounded-[24px] p-5 shadow-seeded-1 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="font-seeded text-lg font-medium text-ink">Target schools</h2>
                <Link href="/roadmap" className="flex items-center gap-1 font-seeded text-sm text-grass">
                  Roadmap
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              {targetSchools.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {targetSchools.slice(0, 4).map((s, i) => (
                    <Reveal key={s.id} index={i} step={0.05}>
                      <Link
                        href={`/schools/${s.slug}`}
                        className="flex items-center gap-3 rounded-xl border border-[rgb(var(--c-line))] p-3 transition-colors hover:bg-[rgb(var(--c-primary)/0.06)]"
                      >
                        <SchoolBadge school={s} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-seeded text-sm font-medium text-ink">{s.shortName}</p>
                          <p className="font-mono text-[11px] text-stone-light">
                            {s.avgRosterUTR} · {s.conference}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-stone-light" />
                      </Link>
                    </Reveal>
                  ))}
                </div>
              ) : (
                <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
                  <p className="text-sm text-stone">No target schools yet.</p>
                  <Link href="/schools" className="mt-2 flex items-center gap-1 font-seeded text-sm font-medium text-grass">
                    Browse schools
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          </Reveal>
        </BentoCell>
      </BentoGrid>

      <Reveal index={5} className="mt-8 flex flex-wrap gap-2 border-t border-[rgb(var(--c-line))] pt-6">
        <SeededQuickLink href="/match-mode" icon={Trophy} label="Match mode" />
        <SeededQuickLink href="/matches" icon={Target} label="Match history" />
        <SeededQuickLink href="/tournament-fit" icon={Compass} label="Tournament fit" />
        <SeededQuickLink href="/cost-calculator" icon={Calculator} label="Cost calculator" />
      </Reveal>
    </>
  );
}

function SeededQuickLink({
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
      className="group flex min-h-11 items-center gap-2 rounded-pill border border-[rgb(var(--c-line))] px-4 py-2.5 font-seeded text-sm font-medium text-stone transition-all hover:-translate-y-0.5 hover:text-ink"
    >
      <Icon className="h-4 w-4 text-grass" />
      {label}
    </Link>
  );
}
