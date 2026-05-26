"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Gauge,
  Mail,
  Plus,
  Target,
  Users,
  Trophy,
  Calculator,
  ShieldCheck,
} from "lucide-react";
import type { School, TrainingPlan, Tournament } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { useTier } from "@/lib/context/tier-context";
import { buildRoadmap } from "@/lib/data";
import { AuthGate } from "@/components/shared/auth-gate";
import { StatCard } from "@/components/shared/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { LockedOverlay } from "@/components/shared/locked-overlay";
import { UTRLineChart } from "@/components/charts/utr-line-chart";
import { SchoolBadge } from "@/components/shared/school-badge";
import { TournamentProgress } from "./tournament-progress";
import { DailyCheckinCard } from "./daily-checkin-card";
import { FamilyHubCard } from "./family-hub-card";
import { ACTIVITY_META } from "@/lib/activity-style";
import { formatUTR, monthsBetween, cn } from "@/lib/utils";
import {
  createUtrEntry,
  loadUtrEntries,
  type UtrEntry,
} from "@/lib/supabase/utr";

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
  const { player, updatePlayer } = usePlayer();
  const { tier } = useTier();
  const [utrEntries, setUtrEntries] = useState<UtrEntry[]>([]);
  const [utrDrawerOpen, setUtrDrawerOpen] = useState(false);
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
  const today = new Date().toISOString().slice(0, 10);
  const latestUtrEntry = utrEntries[utrEntries.length - 1];

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

  const recentUtrChartData = useMemo(() => {
    const entries = utrEntries.length
      ? utrEntries
      : [
          {
            id: "baseline",
            utr: player.currentUTR,
            recordedAt: today,
            note: "Current profile UTR",
          },
        ];
    return entries.slice(-6).map((entry) => ({
      label: new Date(`${entry.recordedAt}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      utr: entry.utr,
    }));
  }, [player.currentUTR, today, utrEntries]);

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
            Good to see you, {firstName}.
          </h1>
          <p className="mt-3 text-stone">
            Class of {player.graduationYear} · {player.grade}th grade ·{" "}
            {targetSchools.length} target{" "}
            {targetSchools.length === 1 ? "school" : "schools"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setUtrDrawerOpen(true)}>
            <Plus className="h-4 w-4" />
            Update UTR
          </Button>
          <Badge variant={tier === "free" ? "outline" : "leaf"} size="md">
            {tier === "free"
              ? "Free plan"
              : tier === "player"
                ? "Player plan"
                : "Family plan"}
          </Badge>
        </div>
      </div>

      <div className="mt-8 court-surface p-4 sm:p-5">
      {/* stat cards */}
      <div className="relative grid gap-4 sm:grid-cols-3">
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
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 p-6 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-medium text-ink">Recent UTR progress</h2>
              <p className="text-sm text-stone">
                Logged ratings tied to your account, newest entry updates your profile UTR.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setUtrDrawerOpen(true)}>
              Log rating
            </Button>
          </div>
          <div className="px-3 pb-4">
            <UTRLineChart
              data={recentUtrChartData}
              target={targetUTR}
              height={190}
              showAxis={recentUtrChartData.length > 1}
            />
          </div>
        </Card>
        <Card className="p-6">
          <p className="font-serif text-base italic text-leaf-accent">Latest checkpoint</p>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-4xl font-light tracking-tight text-ink">
                {formatUTR(latestUtrEntry?.utr ?? player.currentUTR)}
              </p>
              <p className="mt-1 text-sm text-stone">
                {latestUtrEntry
                  ? new Date(`${latestUtrEntry.recordedAt}T00:00:00`).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "No history logged yet"}
              </p>
            </div>
            <Gauge className="h-9 w-9 text-grass/35" />
          </div>
          <div className="mt-5 rounded-2xl bg-grass-50 p-4">
            <p className="text-sm leading-relaxed text-stone">
              {formatUTR(Math.max(targetUTR - player.currentUTR, 0))} UTR gap to your current
              target. Log ratings after verified updates so the roadmap stays honest.
            </p>
          </div>
          {utrStatus === "error" && (
            <p className="mt-3 text-xs text-[#9C3B22]">{utrError}</p>
          )}
        </Card>
      </div>

      <div className="mt-5">
        <DailyCheckinCard player={player} trainingHours={plan.weeklyHours} />
      </div>

      <div className="mt-5">
        <FamilyHubCard />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardAction
          href="/match-mode"
          icon={Trophy}
          label="Match mode"
          body="Build a prep plan, log results, and track patterns."
        />
        <DashboardAction
          href="/matches"
          icon={Target}
          label="Match history"
          body="Save notes, video links, and AI takeaways."
        />
        <DashboardAction
          href="/badges"
          icon={ShieldCheck}
          label="Badges"
          body="See milestones for UTR, training, matches, and recruiting."
        />
        <DashboardAction
          href="/cost-calculator"
          icon={Calculator}
          label="Cost calculator"
          body="Estimate tennis spend against scholarship ranges."
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
    </div>
  );
}

function DashboardAction({
  href,
  icon: Icon,
  label,
  body,
}: {
  href: string;
  icon: typeof Target;
  label: string;
  body: string;
}) {
  return (
    <Link href={href}>
      <Card interactive className="group h-full p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-grass-50 text-grass transition-all group-hover:-translate-y-0.5 group-hover:bg-grass group-hover:text-cream">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="mt-4 font-medium text-ink">{label}</h3>
        <p className="mt-1 text-sm leading-relaxed text-stone">{body}</p>
      </Card>
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
    if (!Number.isFinite(value) || value < 1 || value > 16) {
      setLocalError("Enter a UTR between 1.0 and 16.0.");
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
            max={16}
            step={0.1}
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
