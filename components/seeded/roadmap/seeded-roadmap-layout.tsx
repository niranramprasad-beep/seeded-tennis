"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { seededLinkButtonClass } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { Toast } from "@/components/seeded/ui/toast";
import { PlanUtrControl } from "@/components/seeded/ui/plan-utr-control";
import { DataNote } from "@/components/seeded/ui/data-note";
import { PlanTrajectoryChart } from "./plan-trajectory-chart";
import { TargetSchoolsList } from "./target-schools-list";
import { ClosestSchoolsCard } from "./closest-schools";
import { RecruitingChecklistCard } from "./recruiting-checklist";
import { opponentLine } from "@/components/matches/result-display";
import { summerBeforeSeniorYear } from "@/lib/school-fit";
import {
  closestSchoolsFromReport,
  formatPacePerYear,
  isRealisticTarget,
  planCheckpoints,
  planRealismNote,
  playerPacePerYear,
  projectionPath,
  utrHistoryFromEntries,
} from "@/lib/fit";
import { formatShortDate, parseLocalDate } from "@/lib/time";
import { loadUtrEntries } from "@/lib/db/plan";
import { loadMatches } from "@/lib/db/events";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { useFitReport } from "@/lib/hooks/use-fit-report";
import { ProjectionNote } from "@/components/seeded/ui/projection-note";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { useRecruitingChecklist } from "@/lib/hooks/use-recruiting-checklist";
import { usePlayer } from "@/lib/context/player-context";
import { winLossRecord } from "@/lib/plan-stats";
import { utrProfileLinkHref } from "@/lib/utr-profile-link";
import { cn, formatPlayerUtr, formatUtrOrNotTracked, hasRealUtr } from "@/lib/utils";
import { closestSchoolsMeasuredFrom, judgingRatingFor } from "@/lib/fit-copy";
import type { RoadmapLayoutProps } from "@/components/roadmap/roadmap-view";
import { recordTile } from "@/lib/empty-state-copy";

const NO_SCHOOLS: never[] = [];

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
export function SeededRoadmapLayout({ player, targetSchools, pickerSchools, planGoal }: RoadmapLayoutProps) {
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
      ? [{ date: todayAtMidnight(), utr: player.currentUTR, undated: true }]
      : [];
  }, [utrEntries, player.currentUTR]);
  // Every tier on this page comes from the SAME fit report /schools,
  // /today and /family read, judged on the player's stored Plan UTR while
  // one is set (useFitReport reads it; 2026-11-27) and on the estimate
  // otherwise. The "what if my UTR…" slider that used to sit here is gone:
  // the plan UTR above the chart is the one number.
  const fitReport = useFitReport({ player, schools: pickerSchools });
  const reportBandBySlug = fitReport?.bandBySlug;
  const judging = judgingRatingFor({ report: fitReport });

  const { isStarred, toggleStar, toast, dismissToast } = useStarSchools();

  // The real logged history — the same history the report's Stretch /
  // Long shot split used — plus the full catalog (explainSchoolFit only
  // needs it for its alternative-school suggestion), so a target's
  // expanded explanation never disagrees with the tier chip above it.
  const explanationInput = useMemo(
    () => ({
      utrHistory: actualPoints,
      graduationYear: player.graduationYear,
      gender: player.gender,
      catalog: pickerSchools,
    }),
    [actualPoints, player.graduationYear, player.gender, pickerSchools]
  );
  // THE pace number (lib/fit.ts playerPacePerYear), printed through the one
  // pace formatter. This tile read "+1.45 last 6 months" — a third way of
  // saying the pace, beside "+1.5/yr" and "needs 2.25 a year" (D1).
  const pacePerYear = useMemo(
    () =>
      utrEntries
        ? playerPacePerYear({ currentUtr: player.currentUTR, history: utrHistoryFromEntries(utrEntries) })
        : null,
    [utrEntries, player.currentUTR]
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

  // The plan UTR (usePlanGoal — the stored value every screen reads), its
  // quarterly checkpoint line and the ONE realism note (2026-11-27). The
  // "a stretch" / "1.5 UTR a year" banners that sat under the chart are gone.
  const { goal } = planGoal;
  const goalDate = useMemo(() => summerBeforeSeniorYear(player.graduationYear), [player.graduationYear]);
  const realUtr = hasRealUtr(player.currentUTR) ? player.currentUTR : null;
  const checkpoints = useMemo(
    () => planCheckpoints({ currentUtr: realUtr, planUtr: goal?.value ?? null, goalDate }),
    [realUtr, goal, goalDate]
  );
  const realismNote = useMemo(
    () => planRealismNote({ currentUtr: realUtr, planUtr: goal?.value ?? null, goalDate, ownPacePerYear: pacePerYear }),
    [realUtr, goal, goalDate, pacePerYear]
  );

  // The estimate, drawn on the chart only while no Plan UTR applies — it is
  // where Seeded expects the player to be, and the report the tiers fall
  // back to then.
  const estimateReport = useFitReport({ player, schools: NO_SCHOOLS, judgeOn: "estimate" });
  const estimatePath = useMemo(
    () =>
      checkpoints.length > 0
        ? []
        : projectionPath({
            estimate: estimateReport?.utr,
            currentUtr: player.currentUTR,
            graduationYear: player.graduationYear,
          }),
    [checkpoints.length, estimateReport, player.currentUTR, player.graduationYear]
  );

  // "In range only": the targets that are a Good match or Safe bet on the
  // SAME report every tier here reads (lib/fit.ts isRealisticTarget) — the
  // plan UTR while one is set. Only offered when it would hide something.
  const realisticCount = useMemo(
    () => orderedTargetSchools.filter((s) => isRealisticTarget(fitReport, s.slug)).length,
    [orderedTargetSchools, fitReport]
  );
  const canFilterRealistic = fitReport != null && orderedTargetSchools.length > 0 && realisticCount < orderedTargetSchools.length;
  const [showRealisticOnly, setShowRealisticOnly] = useState(false);
  const filtering = showRealisticOnly && canFilterRealistic;
  const visibleTargetSchools = useMemo(
    () => (filtering ? orderedTargetSchools.filter((s) => isRealisticTarget(fitReport, s.slug)) : orderedTargetSchools),
    [filtering, orderedTargetSchools, fitReport]
  );

  // Point 4: the 5 real catalog schools closest to the rating fit was
  // judged on — read off the SAME report as every tier on this page.
  // No rating → no report → no list.
  const closestSchools = useMemo(
    () => (hasRealUtr(player.currentUTR) ? closestSchoolsFromReport(fitReport, pickerSchools, 5) : []),
    [player.currentUTR, fitReport, pickerSchools]
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
            value={pacePerYear === null ? "Not tracked" : formatPacePerYear(pacePerYear)}
            label="your pace"
          />
          {/* "0–0" is not a record (final-check A10). */}
          <StatTile {...recordTile(record)} />
        </div>
        <div className="flex gap-2">
          <Link href="/settings" className={seededLinkButtonClass("secondary")}>
            Edit profile
          </Link>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold text-ink">Your plan to senior summer</h2>
        {/* The one stored Plan UTR (2026-11-27) — the same control as
            /schools; saving it here re-judges every screen. No default
            plan (PR D, D1): the estimate is offered, never applied. */}
        <PlanUtrControl
          id="plan-page-utr"
          planUtr={goal?.value ?? (planGoal.loaded ? null : undefined)}
          loaded={planGoal.loaded}
          currentUtr={realUtr}
          estimate={planGoal.estimate}
          seniorSummerYear={goalDate.getFullYear()}
          onSave={planGoal.setGoal}
          className="mt-3"
        />
        {/* A plan saved earlier that today's rating has since reached: say
            so, rather than plotting checkpoints behind the player. */}
        {goal && realUtr != null && realUtr >= goal.value && (
          <p role="status" className="mt-3 text-sm text-stone">
            You&apos;ve reached your {formatPlayerUtr(goal.value)} plan UTR. Set a higher one.
          </p>
        )}
        <div className="mt-4">
          <PlanTrajectoryChart actualPoints={actualPoints} checkpoints={checkpoints} planUtr={goal?.value ?? null} estimate={estimatePath} />
        </div>
        {/* The checkpoint line: where the player needs to be on the 1st of
            each quarter to reach the plan on time, on the same straight line
            the chart draws (lib/fit planCheckpoints). */}
        {checkpoints.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-ink">Checkpoints to {formatPlayerUtr(checkpoints[checkpoints.length - 1].utr)}</h3>
            <ol className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="Quarterly UTR checkpoints">
              {checkpoints.map((c) => (
                <li
                  key={c.date.getTime()}
                  className={cn(
                    "flex min-w-[88px] shrink-0 flex-col rounded-lg border px-3 py-2",
                    c.isPlan ? "border-grass bg-grass-50" : "border-line bg-card"
                  )}
                >
                  <span className="text-xs text-stone">By {c.label}</span>
                  <span className="font-mono text-[15px] font-semibold tabular-nums text-ink">{formatPlayerUtr(c.utr)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {/* THE realism note — shown here once, nowhere else. */}
        {realismNote && <DataNote className="mt-3">{realismNote}</DataNote>}
      </div>

      {/* Recent results gets its own full-width row (D7). It sat in a
          flex row beside the recruiting timeline, which is many times
          taller, so at 1440 it was a short card stretched into a tall empty
          box; on a phone it fell below the whole timeline. Its rows now flow
          into two columns from md up, and the timeline below it is its own
          card (it used to be a card nested in a second card). */}
      <section aria-labelledby="recent-results-heading" className="mt-5 rounded-xl border border-line bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recent-results-heading" className="text-base font-semibold text-ink">
            Recent results
          </h2>
          <Link href="/matches" className={seededLinkButtonClass("secondary")}>
            Log a result
          </Link>
        </div>
        {recentMatches.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No matches logged yet." />
          </div>
        ) : (
          <ul className="mt-3.5 grid gap-x-8 gap-y-2.5 text-sm md:grid-cols-2">
            {recentMatches.map((m) => (
              <li key={m.id} className="flex min-w-0 items-center justify-between gap-2 border-b border-line pb-2.5">
                {/* The shared opponent line: the opponent's name when the
                    player gave one ("vs Alex Kim (8.20)"). This card read
                    "vs opponent 6.10" over a named opponent (C14). */}
                {/* Wraps instead of truncating: at 375 the ellipsis hid the
                    opponent's UTR and the event (final-check B17). */}
                <span className="min-w-0 text-ink [overflow-wrap:anywhere]">
                  {m.result === "win" ? "W" : m.result === "loss" ? "L" : "—"} {opponentLine(m) ?? "vs —"}
                  {m.tournamentName ? ` · ${m.tournamentName}` : ""}
                </span>
                <span className="shrink-0 font-mono text-stone">{m.score || "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-5">
        <RecruitingChecklistCard
          items={checklist.items}
          onToggleCompleted={checklist.toggleCompleted}
          onToggleHidden={checklist.toggleHidden}
          onAddItem={checklist.addItem}
          onRemoveItem={checklist.removeItem}
        />
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
              {showRealisticOnly ? "Show all targets" : `In range only (${realisticCount})`}
            </button>
          )}
        </div>
        <ProjectionNote utr={fitReport?.utr} className="mt-1.5" />
        <div className="mt-3.5">
          {orderedTargetSchools.length === 0 ? (
            <EmptyState title="No target schools yet." description="Search below to add your first one." />
          ) : filtering && visibleTargetSchools.length === 0 ? (
            <p className="text-sm text-stone">
              None of your targets is a Good match or Safe bet at{" "}
              {closestSchoolsMeasuredFrom(judging) ?? "your rating"}.{" "}
              <Link href="/schools" className="font-semibold text-grass">
                Find schools in range
              </Link>
            </p>
          ) : null}
          <TargetSchoolsList
            targetSchools={visibleTargetSchools}
            addableSchools={addableSchools}
            todayUtr={hasRealUtr(player.currentUTR) ? player.currentUTR : null}
            judging={judging}
            explanationInput={explanationInput}
            reportBandBySlug={reportBandBySlug}
            isStarred={isStarred}
            toggleStar={toggleStar}
            onReorder={(newOrder) => void updatePlayer({ targetSchoolSlugs: newOrder })}
            reorderable={!filtering}
          />
        </div>
      </div>

      <ClosestSchoolsCard
        results={closestSchools}
        isStarred={isStarred}
        onToggleStar={toggleStar}
        judging={judging}
      />

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
