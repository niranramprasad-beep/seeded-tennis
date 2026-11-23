"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { SeededButton, seededButtonVariants } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { UtrVsPlanChart } from "./utr-vs-plan-chart";
import {
  buildNextSteps,
  buildThisWeekItems,
  buildTodayActions,
  todayHeadline,
  type NextStep,
  type TodayAction,
} from "@/lib/today-actions";
import { projectionPath, upsideProjectionPath } from "@/lib/fit";
import { GoalPaceWarning } from "@/components/seeded/roadmap/goal-pace-warning";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { PaceUpsideNote, ProjectionNote } from "@/components/seeded/ui/projection-note";
import { JoinRequestsCard } from "@/components/seeded/family/join-requests-card";
import { loadFamilyRoster, type FamilyRosterMember } from "@/lib/db/family-join";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { loadMatches } from "@/lib/db/events";
import { currentSeason, formatDate, getCurrentGrade, parseLocalDate } from "@/lib/time";
import { gradeStandingName } from "@/lib/utr-projection";
import { cn, formatCheckpointUtr, formatPlayerUtr, hasRealUtr } from "@/lib/utils";
import { DataNote } from "@/components/seeded/ui/data-note";
import { Pill } from "@/components/seeded/ui/pill";
import { doneThisWeekLine, onTrackPill } from "@/lib/empty-state-copy";
import type { DashboardLayoutProps } from "@/components/dashboard/dashboard-view";
import { chartLegendSentence } from "@/lib/chart-legend";

function seasonLabel(graduationYear: number, now: Date): string {
  const standing = gradeStandingName(getCurrentGrade(graduationYear, now));
  return `${standing.charAt(0).toUpperCase()}${standing.slice(1)} ${currentSeason(now)}`;
}

// Pixel-exact to Today.dc.html: a real rules-based action list (not static
// mockup copy — see lib/today-actions.ts), fed by the props
// dashboard-view.tsx builds (DashboardLayoutProps). The old glass/bento
// "command center" treatment is gone; this matches the mockup's flat
// two-column layout.
export function SeededDashboardLayout({
  player,
  actualPoints,
  targetPoints,
  targetSchools,
  setUtrDrawerOpen,
  setCheckinDrawerOpen,
  sundayCheckinDue,
  setSundayCheckinOpen,
  planGoal,
  goalPace,
  onUseEstimateGoal,
}: DashboardLayoutProps) {
  const now = useMemo(() => new Date(), []);

  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());
  const { data: matches, isLoading: matchesLoading } = useSWR("matches", () => loadMatches());
  // Same key JoinRequestsCard reads, so this costs no extra request. The
  // card sits at the top of the page and appeared ~0.5s after everything
  // below it, pushing the whole dashboard down 318px at 375 (CLS 0.30,
  // measured as persona (a), whose family has a member waiting on consent).
  // Holding the page until the roster has answered lets both appear at once.
  const { isLoading: rosterLoading } = useSWR<FamilyRosterMember[]>("family-roster", () => loadFamilyRoster());

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
  // Bands come from the one report (lib/fit.ts) like every other screen,
  // so Today and Schools cannot disagree about what a school is.
  const fitReport = useFitReport({ player, schools: targetSchools });
  const onTrackCount = useMemo(
    () =>
      targetSchools.filter((s) => {
        const fit = fitReport?.bandBySlug.get(s.slug);
        return fit != null && fit !== "reach" && fit !== "out-of-range";
      }).length,
    [targetSchools, fitReport]
  );
  const trackPill = onTrackPill(onTrackCount, targetSchools.length);
  const matchesThisWeek = useMemo(() => {
    if (!matches) return 0;
    const weekAgo = now.getTime() - 7 * 86_400_000;
    // A match date is a LOCAL date: `new Date("YYYY-MM-DD")` is UTC
    // midnight, the previous evening in the US.
    return matches.filter((m) => parseLocalDate(m.matchDate).getTime() >= weekAgo).length;
  }, [matches, now]);

  // targetPoints[0] is "today" (dashboard-view.tsx always anchors it there);
  // [1], if present, is the nearest future roadmap checkpoint.
  const rawCheckpoint = targetPoints.length > 1 ? targetPoints[1] : null;
  const nextCheckpoint = rawCheckpoint && rawCheckpoint.date.getTime() > now.getTime() ? rawCheckpoint : null;

  // C12: honest next steps when there are no actions or the player is off
  // track, and a headline that does not say "caught up" over them.
  const nextSteps = useMemo(
    () =>
      buildNextSteps({
        hasUtr: hasRealUtr(player.currentUTR),
        targetCount: targetSchools.length,
        onTrackCount,
        matchesThisWeek,
        actionCount: actions.length,
      }),
    [player.currentUTR, targetSchools.length, onTrackCount, matchesThisWeek, actions.length]
  );

  // The fit report's estimate (report.utr) drawn as the chart's shaded band —
  // the same number the ProjectionNote under "Your targets" prints.
  const estimatePath = useMemo(
    () =>
      projectionPath({ estimate: fitReport?.utr, currentUtr: player.currentUTR, graduationYear: player.graduationYear }),
    [fitReport, player.currentUTR, player.graduationYear]
  );
  // The upside — the player's own pace when it is faster than the planning
  // cap. Drawn and said beside the chart; it never moves a band (lib/fit.ts).
  const upsidePath = useMemo(
    () =>
      upsideProjectionPath({ estimate: fitReport?.utr, currentUtr: player.currentUTR, graduationYear: player.graduationYear }),
    [fitReport, player.currentUTR, player.graduationYear]
  );

  const hasLoggedUtr = actualPoints.some((p) => hasRealUtr(p.utr));

  const dateLine = seasonLabel(player.graduationYear, now);

  if (rosterLoading || matchesLoading) {
    return (
      // A distinct key: without it React reuses these skeleton nodes for the
      // real page, and Chrome counts the reused bar "moving" 340px as a
      // layout shift (it did — CLS 0.18 after the first fix).
      <div key="today-skeleton" className="flex flex-col gap-4" aria-busy="true">
        <p className="sr-only" role="status">Loading your week…</p>
        <div className="h-5 w-48 animate-pulse rounded bg-line/50 motion-reduce:animate-none" aria-hidden />
        <div className="h-10 w-full max-w-xl animate-pulse rounded-lg bg-line/50 motion-reduce:animate-none" aria-hidden />
        <div className="min-h-[50vh] animate-pulse rounded-xl bg-line/40 motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }

  return (
    <div key="today-page" className="flex flex-wrap gap-6">
      {/* Renders nothing unless someone is actually waiting on approval, so
          it costs no space on a normal day. Approved members only — the
          roster RPC returns nothing to anyone else (migration 026). */}
      <div className="w-full">
        <JoinRequestsCard compact />
      </div>
      <div className="w-full">
        <p className="text-[15px] text-stone">{dateLine}</p>
        <h1 className="mt-1.5 font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
          {todayHeadline(actions.length, nextSteps.length)}
        </h1>
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setUtrDrawerOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line bg-card px-2.5 py-1 font-mono text-xs font-semibold text-ink sm:min-h-6"
          >
            {hasRealUtr(player.currentUTR) ? `UTR ${formatPlayerUtr(player.currentUTR)}` : "No UTR yet"} · Update
          </button>
          {/* Green only for a real count: "On track for 0 of 3" in green sat
              beside "3 of your 3 targets are a Reach" (final-check A9). */}
          {trackPill && (
            <Pill tone={trackPill.tone === "good" ? "green" : "neutral"}>{trackPill.text}</Pill>
          )}
        </div>

        {/* The same warning, rule and action /plan shows under its goal. */}
        <GoalPaceWarning
          goalPace={goalPace}
          goal={planGoal}
          currentUtr={player.currentUTR}
          onUseEstimate={onUseEstimateGoal}
          className="mt-3.5"
        />

      </div>

      <section aria-labelledby="actions-heading" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3">
        <h2 id="actions-heading" className="text-lg font-semibold text-ink">
          Your actions
        </h2>

        {actions.map((a) => (
          <TodayActionRow key={a.id} action={a} />
        ))}
        {nextSteps.map((s) => <NextStepRow key={s.id} step={s} onLogUtr={() => setUtrDrawerOpen(true)} />)}
        {actions.length === 0 && nextSteps.length === 0 && (
          <EmptyState
            title="Nothing urgent right now."
            description="New actions show up here as your UTR changes or an outreach follow-up comes due."
          />
        )}

        <div className={cn(
          "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border px-4 py-3 text-[15px] text-stone",
          sundayCheckinDue ? "border-grass-100 bg-grass-50" : "border-line bg-panel"
        )}>
          <div className="min-w-0 flex-1 basis-56">
            {sundayCheckinDue && (
              <>
                <p className="text-sm font-semibold text-ink">Sunday check-in</p>
                <p>Your UTR, plus a match result if you played one.</p>
              </>
            )}
            <p>{doneThisWeekLine(matchesThisWeek)}</p>
          </div>
          {sundayCheckinDue && (
            <SeededButton className="min-h-11 sm:min-h-[38px]" onClick={() => setSundayCheckinOpen(true)}>
              <Sparkles className="h-3.5 w-3.5" />
              Start check-in
            </SeededButton>
          )}
          <button type="button" onClick={() => setCheckinDrawerOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-grass sm:min-h-6">
            <Sparkles className="h-3.5 w-3.5" />
            Log check-in
          </button>
          {/* Was "History" → /events, which shows no check-ins. */}
          <Link href="/today/check-ins" className="inline-flex min-h-11 items-center font-semibold text-ink underline sm:min-h-6">
            Check-in history
          </Link>
        </div>

        {/* In the main column since PR-POLISH (2026-11-20): in the 320px rail
            the chart was ~280px wide while ~400px of this column stood empty
            under the actions at 1440. Phones are unchanged — the rail stacks
            after this column, so the order is the same. ONE note under it
            (design system v2, rule 2): the upside sentence when the player's
            pace beats the planning cap, otherwise one short line. */}
        <div className="mt-3 rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">UTR vs plan</h2>
          <div className="mt-2.5">
            <UtrVsPlanChart
              actualPoints={actualPoints}
              nextCheckpoint={nextCheckpoint}
              goalValue={planGoal?.value}
              estimate={estimatePath}
              upside={upsidePath}
            />
          </div>
          {hasLoggedUtr ? (
            <DataNote className="mt-3">
              {/* A legend for exactly what is drawn (independent review of
                  PR #16): the chart may end at the next checkpoint rather
                  than the summer before senior year, and the grey line only
                  exists when the player's own pace beats the planning cap. */}
              {/* One vocabulary with /plan's chart (lib/chart-legend.ts,
                  final-check A3). The estimate is drawn dotted here too,
                  so "dotted" means the same line on both screens. */}
              {/* B24: the logged-only case says it in the same words too. */}
              {chartLegendSentence({
                estimate: estimatePath.length > 1,
                plan: nextCheckpoint ? "next-checkpoint" : null,
                upside: upsidePath.length > 1,
              })}
              {/* The header's "Next checkpoint" chip moved here in the
                  design polish (herdy-work), so its value and date are said
                  beside the gold line they name. */}
              {nextCheckpoint && (
                <>
                  {" "}Next checkpoint:{" "}
                  <span className="font-mono tabular-nums">{formatCheckpointUtr(nextCheckpoint.utr, planGoal?.value)}</span> by{" "}
                  {formatDate(nextCheckpoint.date)}.
                </>
              )}
            </DataNote>
          ) : null}
          {fitReport?.utr?.upside ? <PaceUpsideNote utr={fitReport?.utr} withLink className="mt-2" /> : null}
        </div>
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-4" style={{ flexBasis: "320px" }}>
        <div className="rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Your targets</h2>
          <ProjectionNote utr={fitReport?.utr} className="mt-1.5" />
          {targetSchools.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-0.5 text-[15px] sm:gap-2.5">
              {targetSchools.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  {/* 44px tall on phones, the full row wide (C29). */}
                  <Link href={`/schools/${s.slug}`} className="inline-flex min-h-11 min-w-0 flex-1 items-center truncate text-ink hover:text-grass sm:min-h-6 sm:flex-none">
                    {s.shortName}
                  </Link>
                  {fitReport?.bandBySlug.get(s.slug) && <FitBadge band={fitReport.bandBySlug.get(s.slug)!} />}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[15px] text-stone">
              No target schools yet. <Link href="/schools" className="inline-flex min-h-11 items-center font-semibold text-grass sm:min-h-0">Browse schools</Link>
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">This week</h2>
          <ul className="mt-3 flex flex-col gap-2.5 text-[15px]">
            {thisWeek.map((item) => (
              <li key={item.id} className="flex gap-3">
                <span className="w-9 shrink-0 font-mono text-xs uppercase text-stone">{item.day}</span>
                <span className="text-ink">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function NextStepRow({ step, onLogUtr }: { step: NextStep; onLogUtr: () => void }) {
  const cls = cn(seededButtonVariants({ variant: "secondary" }), "min-h-11 shrink-0 sm:min-h-[38px]");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-line p-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <strong className="text-ink">{step.title}</strong>
        <div className="text-[15px] text-stone">{step.description}</div>
      </div>
      {step.href ? (
        <Link href={step.href} className={cls}>
          {step.cta}
        </Link>
      ) : (
        <button type="button" onClick={onLogUtr} className={cls}>
          {step.cta}
        </button>
      )}
    </div>
  );
}

function TodayActionRow({ action }: { action: TodayAction }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-line p-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <strong className="text-ink">{action.title}</strong>
        <div className="text-[15px] text-stone">{action.description}</div>
      </div>
      {/* A link styled as a button — it used to be a <button> nested inside
          a <Link>, two interactive elements announced as one. Secondary:
          a list of these is a list of greens otherwise (design system v2
          rule 1); the Sunday check-in, when due, is the screen's one. */}
      <Link
        href={`/outreach?school=${action.school.slug}`}
        className={cn(seededButtonVariants({ variant: "secondary" }), "min-h-11 shrink-0 sm:min-h-[38px]")}
      >
        {action.kind === "email" ? "Open draft" : "Review follow-up"}
      </Link>
    </div>
  );
}
