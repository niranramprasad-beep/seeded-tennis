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
import {
  closestSchoolsByUtrGap,
  computeGoalPace,
  explainSchoolFit,
  summerBeforeSeniorYear,
  type SchoolFitProjectionInput,
} from "@/lib/school-fit";
import { loadUtrEntries } from "@/lib/db/plan";
import { loadMatches } from "@/lib/db/events";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { useWhatIfUtr } from "@/lib/hooks/use-what-if-utr";
import { useStarSchools, STAR_TOAST_DURATION_MS } from "@/lib/hooks/use-star-schools";
import { useRecruitingChecklist } from "@/lib/hooks/use-recruiting-checklist";
import { usePlayer } from "@/lib/context/player-context";
import { utrDeltaOverMonths, winLossRecord } from "@/lib/plan-stats";
import { utrProfileLinkHref } from "@/lib/utr-profile-link";
import { formatUTR } from "@/lib/utils";
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
export function SeededRoadmapLayout({ player, targetSchools, roadmap, goalUTR, pickerSchools }: RoadmapLayoutProps) {
  const { updatePlayer } = usePlayer();
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const { data: matches } = useSWR("matches", () => loadMatches());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());

  // Same anchoring rule as /today's chart (components/seeded/dashboard/
  // utr-vs-plan-chart.tsx): every "actual" point traces back to a real
  // entry, or — with no logged history yet — the player's own current UTR
  // as the single "today" anchor, never a bare 0.
  const actualPoints = useMemo(() => {
    const real = (utrEntries ?? []).map((e) => ({ date: new Date(e.recordedAt), utr: e.utr }));
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
    return real.length > 0 ? real : [{ date: todayAtMidnight(), utr: player.currentUTR }];
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
      utrHistory: whatIf.whatIfProjection?.utrHistory ?? [],
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
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
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

  // Point 2: the real pace needed to close current -> goal by senior
  // summer, against the real player UTR (not the what-if slider).
  const goalPace = useMemo(
    () => computeGoalPace(player.currentUTR, goalUTR, player.graduationYear),
    [player.currentUTR, goalUTR, player.graduationYear]
  );
  const [showRealisticOnly, setShowRealisticOnly] = useState(false);
  const visibleTargetSchools = useMemo(() => {
    if (!showRealisticOnly) return orderedTargetSchools;
    return orderedTargetSchools.filter((s) => {
      const explanation = explainSchoolFit(effectiveUtr, s, explanationInput);
      return explanation.band !== "out-of-range" && !explanation.unreachable;
    });
  }, [showRealisticOnly, orderedTargetSchools, effectiveUtr, explanationInput]);

  // Point 4: the 5 real catalog schools closest to the player's actual
  // level, independent of what's currently targeted.
  const closestSchools = useMemo(
    () => closestSchoolsByUtrGap(player.currentUTR, pickerSchools, 5, realProjectionInput),
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
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-line bg-card p-6">
        <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-grass-50 font-seeded text-[26px] font-bold text-grass">
          {initialOf(player.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-seeded text-[28px] font-bold text-ink">{player.name || "Your profile"}</h1>
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
            value={formatUTR(player.currentUTR)}
            label={
              lastLoggedUtr
                ? `UTR · self-reported ${shortDate(new Date(lastLoggedUtr.recordedAt))}`
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
          <span className="text-[13px] text-stone">Goal: {formatUTR(goalUTR)} UTR</span>
        </div>
        <div className="mt-4">
          <PlanTrajectoryChart
            actualPoints={actualPoints}
            roadmap={roadmap}
            gender={player.gender}
            targetSchools={orderedTargetSchools}
            goalUTR={goalUTR}
            isStarred={isStarred}
            toggleStar={toggleStar}
          />
        </div>
        <GoalPaceWarning
          goalPace={goalPace}
          goalUTR={goalUTR}
          showingRealisticOnly={showRealisticOnly}
          onShowRealistic={() => setShowRealisticOnly(true)}
          onShowAll={() => setShowRealisticOnly(false)}
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
                  <span className="truncate text-ink">
                    {m.result === "win" ? "W" : m.result === "loss" ? "L" : "—"} vs{" "}
                    {m.opponentUtr != null ? `opponent ${formatUTR(m.opponentUtr)}` : m.opponent || "opponent"}
                    {m.tournamentName ? ` · ${m.tournamentName}` : ""}
                  </span>
                  <span className="shrink-0 font-mono text-stone">{m.score || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <Link href="/events?tab=matches" className="mt-3.5 inline-block">
            <SeededButton variant="secondary">Log a result</SeededButton>
          </Link>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-line bg-card p-5">
        <h2 className="text-base font-semibold text-ink">Your target schools</h2>
        <div className="mt-3.5">
          <WhatIfPanel
            {...whatIf}
            seniorSummerYear={summerBeforeSeniorYear(player.graduationYear).getFullYear()}
          />
        </div>
        <div className="mt-3.5">
          {orderedTargetSchools.length === 0 ? (
            <EmptyState title="No target schools yet." description="Search below to add your first one." />
          ) : showRealisticOnly && visibleTargetSchools.length === 0 ? (
            <p className="text-sm text-stone">None of your current targets are at a realistic pace right now.</p>
          ) : null}
          <TargetSchoolsList
            targetSchools={visibleTargetSchools}
            addableSchools={addableSchools}
            effectiveUtr={effectiveUtr}
            explanationInput={explanationInput}
            isStarred={isStarred}
            toggleStar={toggleStar}
            onReorder={(newOrder) => void updatePlayer({ targetSchoolSlugs: newOrder })}
            reorderable={!showRealisticOnly}
          />
        </div>
      </div>

      <ClosestSchoolsCard results={closestSchools} isStarred={isStarred} onToggleStar={toggleStar} />

      <p className="mt-4 text-xs text-stone">Live data, your own account.</p>
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

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
