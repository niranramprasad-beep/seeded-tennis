"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { Toast } from "@/components/seeded/ui/toast";
import { WhatIfPanel } from "@/components/seeded/ui/what-if-panel";
import { PlanTrajectoryChart } from "./plan-trajectory-chart";
import { GoalPaceWarning } from "./goal-pace-warning";
import { TargetSchoolsList } from "./target-schools-list";
import { ClosestSchoolsCard } from "./closest-schools";
import { RecruitingChecklistCard } from "./recruiting-checklist";
import { opponentLine } from "@/components/matches/result-display";
import { closestSchoolsByUtrGap, summerBeforeSeniorYear, type SchoolFitProjectionInput } from "@/lib/school-fit";
import { isRealisticTarget, projectionPath } from "@/lib/fit";
import { formatShortDate, parseLocalDate } from "@/lib/time";
import { loadUtrEntries } from "@/lib/db/plan";
import { loadMatches } from "@/lib/db/events";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { useWhatIfUtr } from "@/lib/hooks/use-what-if-utr";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { ProjectionNote } from "@/components/seeded/ui/projection-note";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { useRecruitingChecklist } from "@/lib/hooks/use-recruiting-checklist";
import { usePlayer } from "@/lib/context/player-context";
import { utrDeltaOverMonths, winLossRecord } from "@/lib/plan-stats";
import { utrProfileLinkHref } from "@/lib/utr-profile-link";
import { cn, formatPlayerUtr, formatUtrEstimate, formatUtrOrNotTracked, hasRealUtr } from "@/lib/utils";
import { PlanGoalEditor } from "./plan-goal-editor";
import type { RoadmapLayoutProps } from "@/components/roadmap/roadmap-view";

function initialOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Pixel-exact to PlayerProfile.dc.html — real profile stats, real UTR-plan
// trajectory (lib/utr-projection.ts, wired into Plan for the first time —
// previously only /today used it), a real recruiting-timeline checklist,
// and real match history. The old "what if I targeted…" picker and
// year-by-year tournament-volume timeline aren't part of this mockup at
// all — dropped here rather than bolted on beside content the mockup
// doesn't show; see the Phase 4b report for that call. (Redesign Phase 7
// adds editable target schools, a goal-pace warning, a "closest schools"
// section, and the real recruiting checklist, all around the existing
// pixel-exact structure.)
export function SeededRoadmapLayout({ player, targetSchools, roadmap, pickerSchools, planGoal }: RoadmapLayoutProps) {
  const { updatePlayer } = usePlayer();
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const { data: matches } = useSWR("matches", () => loadMatches());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());

  // Same anchoring rule as /today's chart (components/seeded/dashboard/
  // utr-vs-plan-chart.tsx): every "actual" point traces back to a real
  // entry, or — with no logged history yet — the player's own current UTR
  // as the single "today" anchor, never a bare 0.
  const actualPoints = useMemo(() => {
    const real = (utrEntries ?? []).map((e) => ({ date: parseLocalDate(e.recordedAt), utr: e.utr }));
    // Day-granularity "today" anchor (not a full millisecond timestamp) —
    // matches the day-only precision every real UTR entry already uses
    // (localDateKey() elsewhere in this app), and avoids a real SSR/CSR
    // hydration mismatch: the chart below renders several pixel positions
    // and text labels derived from this date, and a raw `new Date()` reads
    // a different millisecond on the server render pass than on the
    // client's first paint, which the trajectory chart's new gridlines/
    // tick labels are precise enough to visibly disagree about.
    const todayAtMidnight = () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    };
    // No real entries AND no real current UTR means there is nothing to
    // plot. A synthetic point at the 0 sentinel drew the trajectory from
    // "UTR 0", which is a rating nobody has.
    if (real.length > 0) return real;
    return hasRealUtr(player.currentUTR)
      ? [{ date: todayAtMidnight(), utr: player.currentUTR }]
      : [];
  }, [utrEntries, player.currentUTR]);
  // The "what if my UTR is ___ by June {year}?" slider — same shared hook
  // and math as the Schools browser (lib/hooks/use-what-if-utr.ts),
  // defaulting to the player's real current UTR (identical to today's
  // page until actually touched). `actualPoints` already fails
  // computeUtrProjection's 3-point minimum whenever there's no real
  // history (it's a single fallback anchor, same as the trajectory
  // chart's), so handing it to "My pace" here is safe either way.
  const whatIf = useWhatIfUtr({
    currentUTR: player.currentUTR,
    graduationYear: player.graduationYear,
    gender: player.gender,
    utrHistory: actualPoints,
  });
  const effectiveUtr = whatIf.hypotheticalUTR;

  // The band on every target row comes from the SAME fit report /schools,
  // /today and /family read. /plan used to classify each row itself on
  // today's rating, so persona (a) — a 7th grader — saw Reach here and
  // Target for the same school on /schools, which judges a pre-junior at
  // their projected estimate. The slider is passed only once it has been
  // moved, exactly as /schools does (an untouched slider equals the real
  // rating, and buildFitReport treats any override as a deliberate choice).
  const fitReport = useFitReport({
    player,
    schools: pickerSchools,
    overrideUtr: whatIf.isAtRealCurrent ? null : effectiveUtr,
  });
  const reportBandBySlug = fitReport?.bandBySlug;

  const { isStarred, toggleStar, toast, dismissToast } = useStarSchools();

  // Same real grad-year context as the what-if hook, plus the full catalog
  // — explainSchoolFit only needs the catalog for its point-7 alternative-
  // school suggestion. Uses the SAME history choice as the what-if pass
  // (real history only for "My pace"), so a target school's "why this
  // band" never disagrees with the band badge right above it.
  // `pickerSchools` (the full same-gender catalog roadmap-view.tsx already
  // builds) is the real candidate pool for that suggestion.
  const explanationInput = useMemo(
    () => ({
      // Always defined since P1-FIT-1 — "+1.5/yr" and "Custom" now carry a
      // synthetic line instead of nothing, so the expanded "why this band"
      // and the badge above it see the identical history.
      utrHistory: whatIf.whatIfProjection.utrHistory,
      graduationYear: player.graduationYear,
      gender: player.gender,
      catalog: pickerSchools,
    }),
    [whatIf.whatIfProjection, player.graduationYear, player.gender, pickerSchools]
  );
  // Separate from the what-if-aware input above: the "closest schools"
  // section and the goal-pace warning both compare against the player's
  // REAL current UTR and REAL logged history — they shouldn't move when
  // someone's just dragging the what-if slider.
  const realProjectionInput: SchoolFitProjectionInput = useMemo(
    () => ({ utrHistory: actualPoints, graduationYear: player.graduationYear, gender: player.gender }),
    [actualPoints, player.graduationYear, player.gender]
  );

  const sixMonthDelta = useMemo(
    () => (utrEntries ? utrDeltaOverMonths(utrEntries, 6) : null),
    [utrEntries]
  );
  const record = useMemo(() => (matches ? winLossRecord(matches) : null), [matches]);
  // The most recent UTR the player typed in. P0-7: this was named
  // `lastVerified` and rendered as "UTR · verified {date}". Nothing verifies
  // it — Seeded never fetches or checks UTR, by design. It is simply the date
  // they last told us a number.
  const lastLoggedUtr = useMemo(() => {
    if (!utrEntries || utrEntries.length === 0) return null;
    return [...utrEntries].sort(
      (a, b) => parseLocalDate(b.recordedAt).getTime() - parseLocalDate(a.recordedAt).getTime()
    )[0];
  }, [utrEntries]);
  const contactedOrReplied = useMemo(() => {
    if (!outreach) return 0;
    return targetSchools.filter((s) => outreach[s.slug]).length;
  }, [outreach, targetSchools]);
  const recentMatches = useMemo(() => (matches ?? []).slice(0, 5), [matches]);

  // The real display/reorder order for the target list: player.
  // targetSchoolSlugs, resolved to school objects. `targetSchools` (the
  // prop) is filtered from the full catalog so it's in CATALOG order, not
  // the player's own saved order — resolving through the real slug array
  // here is what makes drag-to-reorder meaningful at all.
  const orderedTargetSchools = useMemo(() => {
    const bySlug = new Map(targetSchools.map((s) => [s.slug, s]));
    return player.targetSchoolSlugs
      .map((slug) => bySlug.get(slug))
      .filter((s): s is (typeof targetSchools)[number] => Boolean(s));
  }, [targetSchools, player.targetSchoolSlugs]);

  const addableSchools = useMemo(
    () => pickerSchools.filter((s) => !player.targetSchoolSlugs.includes(s.slug)),
    [pickerSchools, player.targetSchoolSlugs]
  );

  // The goal, its checkpoints and the pace it needs all come from
  // usePlanGoal (lib/fit.ts resolvePlanGoal) — the same hook /today reads.
  const { goal, goalPace } = planGoal;
  const [editingGoal, setEditingGoal] = useState(false);

  // C5: "Show realistic targets" used to filter on explainSchoolFit's
  // what-if-aware bands and changed nothing. It now keeps the targets whose
  // floor the player's estimated UTR for the summer before senior year
  // reaches (lib/fit.ts isRealisticTarget), read from a report WITHOUT the
  // what-if override — dragging the slider must not change which targets
  // are realistic for the player they actually are.
  const realReport = useFitReport({ player, schools: pickerSchools });

  // The report's estimate (report.utr, not the what-if) drawn as a path for
  // the chart — its last point is the number the ProjectionNote prints.
  const estimatePath = useMemo(
    () =>
      projectionPath({
        estimate: realReport?.utr,
        currentUtr: player.currentUTR,
        graduationYear: player.graduationYear,
      }),
    [realReport, player.currentUTR, player.graduationYear]
  );
  const realisticCount = useMemo(
    () => orderedTargetSchools.filter((s) => isRealisticTarget(realReport, s.slug)).length,
    [orderedTargetSchools, realReport]
  );
  // A filter that would change nothing is not offered (same rule as the
  // fit report's view toggle).
  const canFilterRealistic = realReport != null && orderedTargetSchools.length > 0 && realisticCount < orderedTargetSchools.length;
  const [showRealisticOnly, setShowRealisticOnly] = useState(false);
  const filtering = showRealisticOnly && canFilterRealistic;
  const visibleTargetSchools = useMemo(
    () => (filtering ? orderedTargetSchools.filter((s) => isRealisticTarget(realReport, s.slug)) : orderedTargetSchools),
    [filtering, orderedTargetSchools, realReport]
  );

  // Point 4: the 5 real catalog schools closest to the player's actual
  // level, independent of what's currently targeted.
  // "whose roster level is nearest your current UTR" — from the sentinel
  // that is simply the five lowest-rated programs in the catalog, presented
  // as a personalised shortlist.
  const closestSchools = useMemo(
    () =>
      hasRealUtr(player.currentUTR)
        ? closestSchoolsByUtrGap(player.currentUTR, pickerSchools, 5, realProjectionInput)
        : [],
    [player.currentUTR, pickerSchools, realProjectionInput]
  );

  // Point 5: the real recruiting-timeline checklist.
  const checklist = useRecruitingChecklist({
    graduationYear: player.graduationYear,
    targetSchoolCount: player.targetSchoolSlugs.length,
    utrProfileLink: player.utrProfileLink,
    contactedOrRepliedCount: contactedOrReplied,
  });

  return (
    <div className="mx-auto max-w-content container-px py-10">
      {/* C24: the page had no title — the player's name was the H1. */}
      <h1 className="mb-5 font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">Plan</h1>
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-line bg-card p-6">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-grass-50 font-seeded text-[26px] font-bold text-grass">
          {initialOf(player.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-seeded text-[28px] font-bold text-ink">{player.name || "Your profile"}</h2>
          <p className="mt-1 text-stone">
            Class of {player.graduationYear} · {player.gender === "female" ? "Women's" : "Men's"}
            {player.utrProfileLink && (
              <>
                {" · "}
                <a
                  href={utrProfileLinkHref(player.utrProfileLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-grass hover:text-grass-700"
                >
                  UTR profile ↗
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-7">
          <StatTile
            value={formatUtrOrNotTracked(player.currentUTR)}
            label={
              lastLoggedUtr
                ? `UTR · self-reported ${formatShortDate(lastLoggedUtr.recordedAt)}`
                : "UTR"
            }
          />
          <StatTile
            value={sixMonthDelta === null ? "—" : `${sixMonthDelta >= 0 ? "+" : ""}${sixMonthDelta.toFixed(2)}`}
            label="last 6 months"
          />
          <StatTile
            value={record ? `${record.wins}–${record.losses}` : "—"}
            label="logged record"
          />
        </div>
        <div className="flex gap-2">
          <Link href="/settings">
            <SeededButton variant="secondary">Edit profile</SeededButton>
          </Link>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">Your plan to senior summer</h2>
          {goal && !editingGoal && (
            <span className="flex items-baseline gap-2 text-[13px] text-stone">
              <span>
                Goal: <span className="font-mono text-ink">{formatPlayerUtr(goal.value)}</span>
                {goal.source === "estimate" ? " (your estimate)" : ""}
              </span>
              <button
                type="button"
                onClick={() => setEditingGoal(true)}
                className="inline-flex min-h-11 items-center font-semibold text-grass sm:min-h-6"
              >
                {goal.source === "estimate" ? "Set a goal" : "Change"}
              </button>
            </span>
          )}
        </div>
        {/* A goal saved earlier that today's rating has since reached: say
            so, rather than plotting checkpoints behind the player. */}
        {goal && !editingGoal && goal.source === "chosen" && hasRealUtr(player.currentUTR) && player.currentUTR >= goal.value && (
          <p role="status" className="mt-2 text-sm text-stone">
            You&apos;ve reached your {formatPlayerUtr(goal.value)} goal. Set a higher one, or use the estimate.
          </p>
        )}
        {editingGoal && goal && (
          <PlanGoalEditor
            goal={goal}
            currentUtr={hasRealUtr(player.currentUTR) ? player.currentUTR : null}
            onSave={async (v) => {
              await planGoal.setGoal(v);
              setEditingGoal(false);
            }}
            onCancel={() => setEditingGoal(false)}
            className="mt-3"
          />
        )}
        <div className="mt-4">
          <PlanTrajectoryChart
            actualPoints={actualPoints}
            roadmap={roadmap}
            goal={goal}
            estimate={estimatePath}
            onChangeGoal={goal ? () => setEditingGoal(true) : undefined}
          />
        </div>
        <GoalPaceWarning
          goalPace={goalPace}
          goal={goal}
          onUseEstimate={() => void planGoal.setGoal(null)}
          className="mt-3.5"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-5">
        <div className="min-w-0 flex-1 rounded-xl border border-line bg-card p-5" style={{ flexBasis: "360px" }}>
          <RecruitingChecklistCard
            items={checklist.items}
            onToggleCompleted={checklist.toggleCompleted}
            onToggleHidden={checklist.toggleHidden}
            onAddItem={checklist.addItem}
            onRemoveItem={checklist.removeItem}
          />
        </div>

        <div className="min-w-0 flex-1 rounded-xl border border-line bg-card p-5" style={{ flexBasis: "360px" }}>
          <h2 className="text-base font-semibold text-ink">Recent results</h2>
          {recentMatches.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No matches logged yet." description="Log a result to start tracking your record." />
            </div>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2.5 text-sm">
              {recentMatches.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  {/* The shared opponent line: the opponent's name when the
                      player gave one ("vs Alex Kim (8.20)"). This card read
                      "vs opponent 6.10" over a named opponent (C14). */}
                  <span className="truncate text-ink">
                    {m.result === "win" ? "W" : m.result === "loss" ? "L" : "—"} {opponentLine(m) ?? "vs —"}
                    {m.tournamentName ? ` · ${m.tournamentName}` : ""}
                  </span>
                  <span className="shrink-0 font-mono text-stone">{m.score || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <Link href="/matches" className="mt-3.5 inline-block">
            <SeededButton variant="secondary">Log a result</SeededButton>
          </Link>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Your target schools</h2>
          {canFilterRealistic && (
            <button
              type="button"
              aria-pressed={showRealisticOnly}
              onClick={() => setShowRealisticOnly((v) => !v)}
              className={cn(
                "inline-flex min-h-11 items-center whitespace-nowrap rounded-pill border px-3 text-xs font-semibold sm:min-h-8",
                showRealisticOnly ? "border-grass bg-grass-50 text-grass" : "border-line bg-card text-stone"
              )}
            >
              {showRealisticOnly ? "Show all targets" : `Show realistic targets (${realisticCount} of ${orderedTargetSchools.length})`}
            </button>
          )}
        </div>
        <ProjectionNote utr={fitReport?.utr} className="mt-1.5" />
        <div className="mt-3.5">
          <WhatIfPanel
            {...whatIf}
            seniorSummerYear={summerBeforeSeniorYear(player.graduationYear).getFullYear()}
            bandUtr={fitReport?.utr.value ?? null}
            historyLoaded={utrEntries !== undefined}
          />
        </div>
        <div className="mt-3.5">
          {orderedTargetSchools.length === 0 ? (
            <EmptyState title="No target schools yet." description="Search below to add your first one." />
          ) : filtering && visibleTargetSchools.length === 0 ? (
            <p className="text-sm text-stone">
              None of your targets is within reach of your estimated{" "}
              {realReport ? <span className="font-mono">{formatUtrEstimate(realReport.utr.value)}</span> : "UTR"} by the
              summer before senior year.{" "}
              <Link href="/schools" className="font-semibold text-grass">
                Find schools in range
              </Link>
            </p>
          ) : null}
          <TargetSchoolsList
            targetSchools={visibleTargetSchools}
            addableSchools={addableSchools}
            effectiveUtr={effectiveUtr}
            explanationInput={explanationInput}
            reportBandBySlug={reportBandBySlug}
            isStarred={isStarred}
            toggleStar={toggleStar}
            onReorder={(newOrder) => void updatePlayer({ targetSchoolSlugs: newOrder })}
            reorderable={!filtering}
          />
        </div>
      </div>

      <ClosestSchoolsCard results={closestSchools} isStarred={isStarred} onToggleStar={toggleStar} />

      <Toast open={!!toast} onDismiss={dismissToast} action={toast?.action} duration={STAR_TOAST_DURATION_MS}>
        {toast?.message ?? " "}
      </Toast>
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[26px] font-semibold text-ink">{value}</span>
      <span className="text-[13px] text-stone">{label}</span>
    </div>
  );
}
