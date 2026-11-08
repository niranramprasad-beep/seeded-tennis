"use client";

import { motion } from "framer-motion";
import { CalendarDays, Check, Flag, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SchoolBadge } from "@/components/shared/school-badge";
import { Reveal } from "@/components/shared/reveal";
import { SpotlightCard } from "@/components/shared/spotlight-card";
import { AnimatedLineChart } from "@/components/seeded/shared/animated-line-chart";
import { formatUTR, cn } from "@/lib/utils";
import type { RoadmapLayoutProps } from "@/components/roadmap/roadmap-view";

// Same data/handlers as Legacy (lib/data's buildRoadmap, the what-if picker
// state) — only the composition differs: a real self-drawing UTR line
// instead of the recharts line chart, and timeline cards that lift/scale
// on hover ("hover a year to see targets, smooth zoom" per the brief).
export function SeededRoadmapLayout({
  player,
  whatIf,
  openStage,
  setOpenStage,
  targetSchools,
  roadmap,
  goalUTR,
  chartData,
  pickerSchools,
  toggle,
}: RoadmapLayoutProps) {
  const MAX_SCHOOLS = 5;

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <Reveal className="max-w-2xl">
        <span className="font-seeded text-xs font-semibold uppercase tracking-[0.2em] text-stone">
          Your roadmap
        </span>
        <h1 className="mt-3 font-seeded text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          From {formatUTR(player.currentUTR)} to{" "}
          <span className="seeded-gradient-text">{formatUTR(goalUTR)}</span>, year by year.
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-stone">
          Every target is set for the{" "}
          <span className="font-medium text-ink">summer before</span> that grade — the
          window that actually matters for recruiting — and tuned so you clear the most
          demanding school on your list. Adjust your what-if picks below and watch the
          plan re-tune.
        </p>
      </Reveal>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Reveal index={1} className="lg:col-span-2">
          <div className="seeded-glass h-full rounded-[24px] p-6 shadow-seeded-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-grass" />
              <h2 className="font-seeded text-lg font-medium text-ink">UTR trajectory</h2>
            </div>
            <div className="mt-4">
              <AnimatedLineChart key={whatIf.join("-")} data={chartData} height={280} />
            </div>
          </div>
        </Reveal>

        <Reveal index={2}>
          <div
            className="flex h-full flex-col justify-center rounded-[24px] p-6 text-white shadow-seeded-2"
            style={{ background: "var(--s-accent-gradient)" }}
          >
            <p className="text-sm text-white/80">Goal UTR to be competitive</p>
            <div className="mt-1 font-mono text-6xl">{formatUTR(goalUTR)}</div>
            <p className="mt-3 text-sm text-white/80">
              +{formatUTR(Math.max(0, goalUTR - player.currentUTR))} from where you are today
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {targetSchools.map((s) => (
                <Badge key={s.id} size="sm" className="bg-white/15 text-white">
                  {s.shortName}
                </Badge>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal index={3} className="mt-4">
        <div className="seeded-glass rounded-[24px] p-6 shadow-seeded-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-grass" />
            <h2 className="font-seeded text-lg font-medium text-ink">What if I targeted…</h2>
            <span className="ml-auto font-mono text-sm text-stone">
              {whatIf.length}/{MAX_SCHOOLS}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {pickerSchools.map((s) => {
              const active = whatIf.includes(s.slug);
              const disabled = !active && whatIf.length >= MAX_SCHOOLS;
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.slug)}
                  disabled={disabled}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-pill border py-1.5 pl-1.5 pr-3 font-seeded text-sm transition-all",
                    active
                      ? "border-transparent text-white"
                      : "border-[rgb(var(--c-line))] text-stone hover:text-ink",
                    disabled && "opacity-40"
                  )}
                  style={active ? { background: "var(--s-accent-gradient)" } : undefined}
                >
                  <SchoolBadge school={s} size={28} />
                  {s.shortName}
                  {active && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      </Reveal>

      <div className="mt-8">
        <h2 className="font-seeded text-xl font-semibold tracking-tight text-ink">
          Year-by-year plan
        </h2>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-3">
          {roadmap.map((year, i) => (
            <Reveal key={`${year.calendarYear}-${i}`} index={i} step={0.07} className="w-[280px] shrink-0">
              <motion.div whileHover={{ scale: 1.03, y: -4 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
                <SpotlightCard className="seeded-glass flex h-full flex-col rounded-[24px] p-5 shadow-seeded-1">
                  <div className="flex items-center justify-between">
                    <Badge size="md" style={{ background: "var(--s-accent-gradient)", color: "white" }}>
                      {year.shortLabel} Grade
                    </Badge>
                    <span className="text-sm text-stone">Summer {year.calendarYear}</span>
                  </div>
                  <p className="mt-3 font-seeded text-sm font-medium text-ink">{year.gradeLabel}</p>

                  <div className="mt-4">
                    <p className="text-xs text-stone-light">Target UTR by then</p>
                    <div className="seeded-gradient-text font-mono text-4xl">
                      {formatUTR(year.utrTarget)}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-[rgb(var(--c-line))] px-3 py-2 text-sm text-ink">
                    <Trophy className="h-4 w-4 text-leaf-accent" />
                    {year.tournamentsNeeded} tournaments
                  </div>

                  <button
                    onClick={() => setOpenStage(openStage === i ? null : i)}
                    className="mt-3 w-full rounded-xl border border-[rgb(var(--c-line))] px-3 py-3 text-left transition-all hover:bg-[rgb(var(--c-primary)/0.06)]"
                    aria-expanded={openStage === i}
                  >
                    <span className="flex items-center gap-2 font-seeded text-xs font-medium uppercase tracking-[0.1em] text-stone-light">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Tournament volume
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-1.5">
                      {Array.from({ length: Math.min(12, year.tournamentsNeeded) }).map((_, dotIndex) => (
                        <span
                          key={dotIndex}
                          title={`${tournamentMix(year.tournamentsNeeded)[dotIndex % tournamentMix(year.tournamentsNeeded).length]} recommendation`}
                          className="rounded-full bg-leaf-accent/80"
                          style={{
                            width: 8 + Math.min(10, year.tournamentsNeeded) * 0.55,
                            height: 8 + Math.min(10, year.tournamentsNeeded) * 0.55,
                          }}
                        />
                      ))}
                    </span>
                  </button>

                  {openStage === i && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-3 overflow-hidden rounded-xl p-3"
                      style={{ background: "rgb(var(--c-primary) / 0.08)" }}
                    >
                      <p className="font-seeded text-xs font-medium text-ink">Recommended mix</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {tournamentMix(year.tournamentsNeeded).map((level) => (
                          <span
                            key={level}
                            className="rounded-pill bg-card px-2.5 py-1 font-seeded text-xs font-medium text-stone"
                          >
                            {level}
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-stone">
                        Play enough volume to generate coach-relevant results, but keep the
                        highest-level events near your peak training windows.
                      </p>
                    </motion.div>
                  )}

                  <div className="mt-4 flex-1">
                    <p className="mb-2 flex items-center gap-1.5 font-seeded text-xs font-medium uppercase tracking-[0.1em] text-stone-light">
                      <Flag className="h-3 w-3" />
                      Milestones
                    </p>
                    <ul className="space-y-2">
                      {year.milestones.map((m) => (
                        <li key={m} className="flex items-start gap-2 text-sm leading-snug text-stone">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-accent" />
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                </SpotlightCard>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}

function tournamentMix(count: number): string[] {
  if (count >= 12) return ["USTA L2", "USTA L3", "USTA L4", "ITF J30", "showcase"];
  if (count >= 9) return ["USTA L3", "USTA L4", "USTA L5", "regional showcase"];
  if (count >= 6) return ["USTA L4", "USTA L5", "USTA L6"];
  return ["USTA L5", "USTA L6", "local match play"];
}
