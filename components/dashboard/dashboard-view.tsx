"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Gauge,
  Mail,
  Target,
  Users,
} from "lucide-react";
import type { School, TrainingPlan, Tournament } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { buildRoadmap } from "@/lib/data";
import { AuthGate } from "@/components/shared/auth-gate";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LockedOverlay } from "@/components/shared/locked-overlay";
import { UTRLineChart } from "@/components/charts/utr-line-chart";
import { SchoolBadge } from "@/components/shared/school-badge";
import { TournamentProgress } from "./tournament-progress";
import { ACTIVITY_META } from "@/lib/activity-style";
import { formatUTR, monthsBetween, cn } from "@/lib/utils";

interface DashboardViewProps {
  schools: School[];
  tournaments: Tournament[];
  plans: TrainingPlan[];
}

export function DashboardView(props: DashboardViewProps) {
  return (
    <AuthGate>
      <DashboardInner {...props} />
    </AuthGate>
  );
}

function DashboardInner({ schools, tournaments, plans }: DashboardViewProps) {
  const { player } = usePlayer();
  const { tier } = useTier();

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
  const monthsUntil = monthsBetween(new Date(), new Date(player.commitmentDate));

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

  const firstName = player.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-content container-px py-10">
      {/* greeting */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-serif text-lg italic text-leaf-accent">
            Welcome back
          </p>
          <h1 className="mt-1 text-3xl font-light tracking-tight text-ink sm:text-4xl">
            Good to see you, {firstName}.
          </h1>
          <p className="mt-2 text-stone">
            Class of {player.graduationYear} · {player.grade}th grade ·{" "}
            {targetSchools.length} target{" "}
            {targetSchools.length === 1 ? "school" : "schools"}
          </p>
        </div>
        <Badge variant={tier === "free" ? "outline" : "leaf"} size="md">
          {tier === "free"
            ? "Free plan"
            : tier === "player"
              ? "Player plan"
              : "Family plan"}
        </Badge>
      </div>

      {/* stat cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Current UTR"
          value={player.currentUTR}
          decimals={1}
          icon={Gauge}
          accent="grass"
          hint={`Band: ${player.currentUTR < 8 ? "competitive" : "high performance"}`}
        />
        <StatCard
          label="Target UTR"
          value={targetUTR}
          decimals={1}
          icon={Target}
          accent="leaf"
          hint="To clear your top school"
        />
        <StatCard
          label="Months to commitment"
          value={monthsUntil}
          icon={CalendarDays}
          accent="tennis"
          hint={`Goal: verbal by ${new Date(player.commitmentDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
        />
      </div>

      {/* main grid */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* roadmap preview */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between p-6 pb-2">
            <div>
              <h2 className="text-lg font-medium text-ink">UTR trajectory</h2>
              <p className="text-sm text-stone">
                Your path from {formatUTR(player.currentUTR)} to{" "}
                {formatUTR(targetUTR)}
              </p>
            </div>
            <Link
              href="/roadmap"
              className="flex items-center gap-1 text-sm text-grass transition-colors hover:text-grass-600"
            >
              Full roadmap
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="px-3 pb-4">
            <UTRLineChart data={chartData} target={targetUTR} height={260} />
          </div>
        </Card>

        {/* training preview */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between p-6 pb-3">
            <div>
              <h2 className="text-lg font-medium text-ink">This week</h2>
              <p className="text-sm text-stone">{plan.weeklyHours} hrs planned</p>
            </div>
            <Link
              href="/training"
              className="flex items-center gap-1 text-sm text-grass transition-colors hover:text-grass-600"
            >
              Open
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid flex-1 grid-cols-7 gap-1.5 px-4 pb-6">
            {plan.days.map((d) => {
              const hours = d.activities.reduce((sum, a) => sum + a.hours, 0);
              return (
                <div
                  key={d.day}
                  className="flex flex-col items-center gap-2 rounded-xl border-[0.5px] border-line bg-cream/50 py-3"
                >
                  <span className="text-[10px] font-medium uppercase text-stone-light">
                    {d.day}
                  </span>
                  <div className="flex flex-col items-center gap-1">
                    {d.activities.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          ACTIVITY_META[a.type].dot
                        )}
                      />
                    ))}
                  </div>
                  <span className="mt-auto text-[10px] text-stone">
                    {hours}h
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* tournaments + quick action */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TournamentProgress
            tournaments={tournaments}
            played={player.tournamentsPlayed}
            goal={player.tournamentsGoal}
          />
        </div>

        {/* quick action */}
        <Card className="flex flex-col justify-between bg-grass p-6 text-cream">
          <div>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cream/15">
              <Mail className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-lg font-medium">Reach a coach</h2>
            <p className="mt-1 text-sm text-cream/80">
              Generate a personalized intro email from your stats in one click.
            </p>
          </div>
          <Link
            href="/coaches"
            className={cn(
              buttonVariants({ variant: "leaf", size: "md" }),
              "mt-6 w-full"
            )}
          >
            Generate coach email
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>

      {/* locked / upgrade section */}
      <div className="mt-10">
        <h2 className="text-xl font-light tracking-tight text-ink">
          {tier === "family"
            ? "Your full toolkit is unlocked"
            : "Unlock the rest of your plan"}
        </h2>
        <p className="mt-1 text-sm text-stone">
          {tier === "family"
            ? "Everything below is available on your Family plan."
            : "Here's what families on higher tiers are using."}
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <LockedOverlay
            required="player"
            title="What-if roadmap planning"
            description="Compare schools and watch your roadmap re-target in real time."
          >
            <MiniFeature
              icon={Target}
              eyebrow="Player"
              title="What-if roadmap"
              body="Swap target schools and instantly see how your year-by-year UTR goals shift."
              accent="leaf"
            />
          </LockedOverlay>

          <LockedOverlay
            required="family"
            title="Coach email generator + tracking"
            description="Personalized outreach and a contacted-coaches tracker for the whole family."
          >
            <MiniFeature
              icon={Users}
              eyebrow="Family"
              title="Coach outreach suite"
              body="Generate, edit, and track recruiting emails across all your target programs."
              accent="grass"
            />
          </LockedOverlay>
        </div>
      </div>

      {/* target schools quick links */}
      {targetSchools.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-light tracking-tight text-ink">
            Your target schools
          </h2>
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
        </div>
      )}
    </div>
  );
}

function MiniFeature({
  icon: Icon,
  eyebrow,
  title,
  body,
  accent,
}: {
  icon: typeof Target;
  eyebrow: string;
  title: string;
  body: string;
  accent: "grass" | "leaf";
}) {
  return (
    <Card className="p-6">
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-2xl",
          accent === "grass" ? "bg-grass text-cream" : "bg-leaf-accent text-grass-900"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <Badge variant="lime" size="sm" className="mt-4">
        {eyebrow}
      </Badge>
      <h3 className="mt-2 text-lg font-medium text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-stone">{body}</p>
    </Card>
  );
}
