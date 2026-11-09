"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo } from "react";
import { Plus, Sparkles } from "lucide-react";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { UtrVsPlanChart } from "./utr-vs-plan-chart";
import { classifySchoolFit } from "@/lib/school-fit";
import { buildTodayActions, buildThisWeekItems, type TodayAction } from "@/lib/today-actions";
import { loadCoachOutreachDated } from "@/lib/supabase/features";
import { loadMatches } from "@/lib/supabase/features";
import { currentSeason, getCurrentGrade } from "@/lib/time";
import { gradeStandingName } from "@/lib/utr-projection";
import { formatUTR } from "@/lib/utils";
import type { DashboardLayoutProps } from "@/components/dashboard/dashboard-view";

function seasonLabel(graduationYear: number, now: Date): string {
  const standing = gradeStandingName(getCurrentGrade(graduationYear, now));
  return `${standing.charAt(0).toUpperCase()}${standing.slice(1)} ${currentSeason(now)}`;
}

function greeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

// Pixel-exact to Today.dc.html: a real rules-based action list (not static
// mockup copy — see lib/today-actions.ts), fed by the exact same props
// LegacyDashboardLayout receives from dashboard-view.tsx. The old glass/bento
// "command center" treatment is gone; this matches the mockup's flat
// two-column layout.
export function SeededDashboardLayout({
  firstName,
  player,
  targetUTR,
  actualPoints,
  targetPoints,
  targetSchools,
  setUtrDrawerOpen,
  setCheckinDrawerOpen,
}: DashboardLayoutProps) {
  const now = useMemo(() => new Date(), []);

  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());
  const { data: matches } = useSWR("matches", () => loadMatches());

  // actualPoints already carries the player's real UTR history (or the
  // single current-UTR fallback point when there's none yet — see
  // dashboard-view.tsx), so the full 4-band projection is real here, not
  // fabricated: a lone fallback point still fails computeUtrProjection's
  // 3-point minimum and classifySchoolFit falls back to "reach" honestly.
  const projection = useMemo(
    () => ({ utrHistory: actualPoints, graduationYear: player.graduationYear, gender: player.gender, now }),
    [actualPoints, player.graduationYear, player.gender, now]
  );

  const actions = useMemo(
    () => buildTodayActions(player.currentUTR, targetSchools, outreach ?? {}, now, projection),
    [player.currentUTR, targetSchools, outreach, now, projection]
  );
  const thisWeek = useMemo(
    () => buildThisWeekItems(targetSchools, outreach ?? {}, now),
    [targetSchools, outreach, now]
  );
  const onTrackCount = useMemo(
    () =>
      targetSchools.filter((s) => {
        const fit = classifySchoolFit(player.currentUTR, s, projection);
        return fit !== "reach" && fit !== "out-of-range";
      }).length,
    [targetSchools, player.currentUTR, projection]
  );
  const matchesThisWeek = useMemo(() => {
    if (!matches) return 0;
    const weekAgo = now.getTime() - 7 * 86_400_000;
    return matches.filter((m) => new Date(m.matchDate).getTime() >= weekAgo).length;
  }, [matches, now]);

  // targetPoints[0] is "today" (dashboard-view.tsx always anchors it there);
  // [1], if present, is the nearest future roadmap checkpoint.
  const rawCheckpoint = targetPoints.length > 1 ? targetPoints[1] : null;
  const nextCheckpoint = rawCheckpoint && rawCheckpoint.date.getTime() > now.getTime() ? rawCheckpoint : null;

  const dateLine = `${now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · ${seasonLabel(
    player.graduationYear,
    now
  )}`;

  return (
    <div className="flex flex-wrap gap-6">
      <div className="w-full">
        <p className="text-sm text-stone">{dateLine}</p>
        <h1 className="mt-1.5 font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
          {greeting(now)}, {firstName || "there"}.{" "}
          {actions.length > 0
            ? `${actions.length} thing${actions.length === 1 ? "" : "s"} move your recruiting this week.`
            : "You're all caught up this week."}
        </h1>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-2.5 py-1 font-mono text-xs font-semibold text-ink">
            UTR {formatUTR(player.currentUTR)}
          </span>
          {targetSchools.length > 0 && (
            <span className="inline-flex items-center rounded-pill border border-grass-100 bg-grass-50 px-2.5 py-1 text-xs font-semibold text-grass">
              On track for {onTrackCount} of {targetSchools.length} targets
            </span>
          )}
          {nextCheckpoint && (
            <span className="inline-flex items-center rounded-pill border border-line bg-card px-2.5 py-1 text-xs font-semibold text-stone">
              Next checkpoint: {formatUTR(nextCheckpoint.utr)} by{" "}
              {nextCheckpoint.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
          <button
            onClick={() => setUtrDrawerOpen(true)}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-grass"
          >
            <Plus className="h-3.5 w-3.5" />
            Update UTR
          </button>
        </div>
      </div>

      <section aria-labelledby="actions-heading" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
        <h2 id="actions-heading" className="text-lg font-semibold text-ink">
          Your actions
        </h2>

        {actions.length === 0 ? (
          <EmptyState
            title="Nothing urgent right now."
            description="New actions show up here as your UTR changes or an outreach follow-up comes due."
          />
        ) : (
          actions.map((a) => <TodayActionRow key={a.id} action={a} />)
        )}

        <div className="flex items-center gap-4 rounded-[10px] border border-line bg-panel px-4 py-3 text-sm text-stone">
          <span className="flex-1">
            Done this week: logged {matchesThisWeek} match{matchesThisWeek === 1 ? "" : "es"}
          </span>
          <button onClick={() => setCheckinDrawerOpen(true)} className="flex items-center gap-1.5 font-semibold text-grass">
            <Sparkles className="h-3.5 w-3.5" />
            Log check-in
          </button>
          <Link href="/events" className="font-semibold text-ink underline">
            History
          </Link>
        </div>
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-4" style={{ flexBasis: "320px" }}>
        <div className="rounded-xl border border-line bg-card p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">UTR vs plan</h2>
          </div>
          <div className="mt-2.5">
            <UtrVsPlanChart actualPoints={actualPoints} nextCheckpoint={nextCheckpoint} gender={player.gender} />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Your targets</h2>
          {targetSchools.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2.5 text-sm">
              {targetSchools.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/schools/${s.slug}`} className="truncate text-ink hover:text-grass">
                    {s.shortName}
                  </Link>
                  <FitBadge band={classifySchoolFit(player.currentUTR, s, projection)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-stone">
              No target schools yet. <Link href="/schools" className="font-semibold text-grass">Browse schools</Link>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">This week</h2>
          <ul className="mt-3 flex flex-col gap-2.5 text-sm">
            {thisWeek.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span className="w-9 shrink-0 font-mono text-xs uppercase text-stone">{item.day}</span>
                <span className="text-ink">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="w-full text-xs text-stone">Live data, your own account.</p>
    </div>
  );
}

function TodayActionRow({ action }: { action: TodayAction }) {
  return (
    <div className="flex items-center gap-4 rounded-[10px] border border-line p-3.5">
      <div className="min-w-0 flex-1">
        <strong className="text-ink">{action.title}</strong>
        <div className="text-sm text-stone">{action.description}</div>
      </div>
      <span className="shrink-0 text-[13px] text-stone">{action.minutes} min</span>
      <Link href={`/outreach?school=${action.school.slug}`}>
        <SeededButton className="min-h-[38px]">
          {action.kind === "email" ? "Open draft" : "Review follow-up"}
        </SeededButton>
      </Link>
    </div>
  );
}
