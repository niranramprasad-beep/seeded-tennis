"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Check, Flag, Sparkles, TrendingUp, Trophy } from "lucide-react";
import type { School } from "@/lib/types";
import { programGenderFor } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { buildRoadmap } from "@/lib/data";
import { AuthGate } from "@/components/shared/auth-gate";
import { PaidGate } from "@/components/shared/paid-gate";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { UTRLineChart } from "@/components/charts/utr-line-chart";
import { SchoolBadge } from "@/components/shared/school-badge";
import { formatUTR, cn } from "@/lib/utils";

const MAX_SCHOOLS = 5;

export function RoadmapView({ schools }: { schools: School[] }) {
  return (
    <AuthGate>
      <PaidGate
        required="player"
        feature="Your roadmap"
        blurb="A year-by-year plan with realistic UTR targets, the tournaments that get you there, and a what-if planner to compare schools."
        perks={[
          "Year-by-year UTR targets tuned to your schools",
          "Tournament counts that match each level",
          "What-if planning across up to five programs",
          "An animated trajectory you can actually follow",
        ]}
      >
        <RoadmapInner schools={schools} />
      </PaidGate>
    </AuthGate>
  );
}

function RoadmapInner({ schools }: { schools: School[] }) {
  const { player } = usePlayer();
  const [whatIf, setWhatIf] = useState<string[]>(player.targetSchoolSlugs);
  const [openStage, setOpenStage] = useState<number | null>(0);

  const targetSchools = useMemo(
    () => schools.filter((s) => whatIf.includes(s.slug)),
    [schools, whatIf]
  );

  const roadmap = useMemo(
    () => buildRoadmap(player, targetSchools),
    [player, targetSchools]
  );

  const goalUTR = roadmap[roadmap.length - 1]?.utrTarget ?? player.currentUTR;

  const chartData = useMemo(
    () => [
      { label: "Now", utr: player.currentUTR },
      ...roadmap.map((y) => ({
        label: y.shortLabel,
        utr: y.utrTarget,
      })),
    ],
    [player.currentUTR, roadmap]
  );

  // Only show programs that match the player's recruiting gender.
  const pickerSchools = useMemo(() => {
    const g = programGenderFor(player.gender);
    return schools
      .filter((s) => s.gender === g)
      .sort((a, b) => b.avgRosterUTR - a.avgRosterUTR);
  }, [schools, player.gender]);

  const toggle = (slug: string) =>
    setWhatIf((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length < MAX_SCHOOLS
          ? [...prev, slug]
          : prev
    );

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="max-w-2xl">
        <span className="eyebrow text-gold">Your roadmap</span>
        <h1 className="display-serif mt-3 text-4xl text-ink sm:text-5xl">
          From {formatUTR(player.currentUTR)} to{" "}
          <span className="serif-accent text-grass">{formatUTR(goalUTR)}</span>,
          year by year.
        </h1>
        <p className="mt-3 text-pretty leading-relaxed text-stone">
          Every target is set for the{" "}
          <span className="font-medium text-ink">summer before</span> that grade —
          the window that actually matters for recruiting — and tuned so you clear
          the most demanding school on your list. Adjust your what-if picks below
          and watch the plan re-tune.
        </p>
      </div>

      {/* trajectory + goal */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-grass" />
            <h2 className="text-lg font-medium text-ink">UTR trajectory</h2>
          </div>
          <div className="mt-4">
            <UTRLineChart
              key={whatIf.join("-")}
              data={chartData}
              target={goalUTR}
              height={280}
            />
          </div>
        </Card>

        <Card className="flex flex-col justify-center bg-grass p-6 text-cream">
          <p className="text-sm text-cream/80">Goal UTR to be competitive</p>
          <div className="mt-1 text-6xl font-light">
            <AnimatedNumber key={goalUTR} value={goalUTR} decimals={1} />
          </div>
          <p className="mt-3 text-sm text-cream/80">
            +{formatUTR(Math.max(0, goalUTR - player.currentUTR))} from where you
            are today
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {targetSchools.map((s) => (
              <Badge
                key={s.id}
                size="sm"
                className="bg-cream/15 text-cream"
              >
                {s.shortName}
              </Badge>
            ))}
          </div>
        </Card>
      </div>

      {/* what-if picker */}
      <Card className="mt-4 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-grass" />
          <h2 className="text-lg font-medium text-ink">What if I targeted…</h2>
          <span className="ml-auto text-sm text-stone">
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
                  "flex items-center gap-2 rounded-pill border-[0.5px] py-1.5 pl-1.5 pr-3 text-sm transition-all",
                  active
                    ? "border-grass bg-grass-50 text-grass"
                    : "border-line bg-card text-stone hover:text-ink",
                  disabled && "opacity-40"
                )}
              >
                <SchoolBadge school={s} size={24} />
                {s.shortName}
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </Card>

      {/* timeline */}
      <div className="mt-8">
        <h2 className="text-xl font-light tracking-tight text-ink">
          Year-by-year plan
        </h2>
        <div className="mt-4 flex gap-4 overflow-x-auto pb-3">
          {roadmap.map((year, i) => (
            <motion.div
              key={`${year.calendarYear}-${i}`}
              layout
              className="w-[280px] shrink-0"
            >
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <Badge variant="default" size="md">
                    {year.shortLabel === "College" ? "College" : `Grade ${year.shortLabel}`}
                  </Badge>
                  <span className="text-sm text-stone">Summer {year.calendarYear}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-ink">
                  {year.gradeLabel}
                </p>

                <div className="mt-4">
                  <p className="text-xs text-stone-light">Target UTR by then</p>
                  <div className="text-4xl font-light text-grass">
                    <AnimatedNumber
                      key={`${i}-${year.utrTarget}`}
                      value={year.utrTarget}
                      decimals={1}
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-xl bg-cream/60 px-3 py-2 text-sm text-ink">
                  <Trophy className="h-4 w-4 text-leaf-accent" />
                  {year.tournamentsNeeded} tournaments
                </div>

                <button
                  onClick={() => setOpenStage(openStage === i ? null : i)}
                  className="mt-3 w-full rounded-xl border-[0.5px] border-line bg-card px-3 py-3 text-left transition-all hover:border-grass/40 hover:bg-grass-50 focus:outline-none focus:ring-2 focus:ring-grass/30"
                  aria-expanded={openStage === i}
                >
                  <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-stone-light">
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
                    className="mt-3 overflow-hidden rounded-xl bg-grass-50 p-3"
                  >
                    <p className="text-xs font-medium text-ink">
                      Recommended mix
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tournamentMix(year.tournamentsNeeded).map((level) => (
                        <span
                          key={level}
                          className="rounded-pill bg-card px-2.5 py-1 text-[11px] font-medium text-stone"
                        >
                          {level}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-stone">
                      Play enough volume to generate coach-relevant results, but
                      keep the highest-level events near your peak training windows.
                    </p>
                  </motion.div>
                )}

                <div className="mt-4 flex-1">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.1em] text-stone-light">
                    <Flag className="h-3 w-3" />
                    Milestones
                  </p>
                  <ul className="space-y-2">
                    {year.milestones.map((m) => (
                      <li
                        key={m}
                        className="flex items-start gap-2 text-sm leading-snug text-stone"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-accent" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </motion.div>
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
