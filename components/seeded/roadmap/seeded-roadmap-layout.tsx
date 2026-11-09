"use client";

import Link from "next/link";
import useSWR from "swr";
import { useMemo } from "react";
import { SeededButton } from "@/components/seeded/ui/button";
import { FitBadge } from "@/components/seeded/ui/fit-badge";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { PlanTrajectoryChart } from "./plan-trajectory-chart";
import { classifySchoolFit } from "@/lib/school-fit";
import { utrDeltaOverMonths, winLossRecord, buildPlanChecklist } from "@/lib/plan-stats";
import { loadUtrEntries } from "@/lib/supabase/utr";
import { loadMatches, loadCoachOutreachDated } from "@/lib/supabase/features";
import { formatUTR } from "@/lib/utils";
import type { RoadmapLayoutProps } from "@/components/roadmap/roadmap-view";

function initialOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Pixel-exact to PlayerProfile.dc.html — real profile stats, real UTR-plan
// trajectory (lib/utr-projection.ts, wired into Plan for the first time —
// previously only /today used it), a checklist limited to items with a real
// computable boolean, and real match history. The old "what if I targeted…"
// picker and year-by-year tournament-volume timeline aren't part of this
// mockup at all — dropped here rather than bolted on beside content the
// mockup doesn't show; see the Phase 4b report for that call.
export function SeededRoadmapLayout({ player, targetSchools, roadmap, goalUTR }: RoadmapLayoutProps) {
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const { data: matches } = useSWR("matches", () => loadMatches());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());

  // Same anchoring rule as /today's chart (components/seeded/dashboard/
  // utr-vs-plan-chart.tsx): every "actual" point traces back to a real
  // entry, or — with no logged history yet — the player's own current UTR
  // as the single "today" anchor, never a bare 0.
  const actualPoints = useMemo(() => {
    const real = (utrEntries ?? []).map((e) => ({ date: new Date(e.recordedAt), utr: e.utr }));
    return real.length > 0 ? real : [{ date: new Date(), utr: player.currentUTR }];
  }, [utrEntries, player.currentUTR]);
  // Real history (or the single current-UTR fallback point, which honestly
  // fails computeUtrProjection's 3-point minimum) feeds the same 4-band
  // classification /today uses, so Plan and Today never disagree about a
  // target school's band.
  const fitProjection = useMemo(
    () => ({ utrHistory: actualPoints, graduationYear: player.graduationYear, gender: player.gender }),
    [actualPoints, player.graduationYear, player.gender]
  );
  const sixMonthDelta = useMemo(
    () => (utrEntries ? utrDeltaOverMonths(utrEntries, 6) : null),
    [utrEntries]
  );
  const record = useMemo(() => (matches ? winLossRecord(matches) : null), [matches]);
  const lastVerified = useMemo(() => {
    if (!utrEntries || utrEntries.length === 0) return null;
    return [...utrEntries].sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    )[0];
  }, [utrEntries]);
  const contactedOrReplied = useMemo(() => {
    if (!outreach) return 0;
    return targetSchools.filter((s) => outreach[s.slug]).length;
  }, [outreach, targetSchools]);
  const checklist = buildPlanChecklist(targetSchools.length, contactedOrReplied);
  const recentMatches = useMemo(() => (matches ?? []).slice(0, 5), [matches]);

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
          </p>
        </div>
        <div className="flex flex-wrap gap-7">
          <StatTile
            value={formatUTR(player.currentUTR)}
            label={lastVerified ? `UTR · verified ${shortDate(new Date(lastVerified.recordedAt))}` : "UTR"}
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
          <PlanTrajectoryChart actualPoints={actualPoints} roadmap={roadmap} gender={player.gender} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-5">
        <div className="min-w-0 flex-1 rounded-xl border border-line bg-card p-5" style={{ flexBasis: "360px" }}>
          <h2 className="text-base font-semibold text-ink">This season's checklist</h2>
          <ul className="mt-3.5 flex flex-col gap-2.5 text-sm">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-2.5">
                <input type="checkbox" checked={item.done} readOnly aria-label={item.done ? "Done" : "Not done"} />
                <span className={item.done ? "text-ink" : "text-stone"}>{item.label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3.5 text-xs text-stone">
            NCAA Eligibility Center registration and spring-event planning aren't tracked here yet —{" "}
            <a href="https://web3.ncaa.org/ecwr3/" target="_blank" rel="noreferrer" className="font-semibold text-grass">
              start at the NCAA site
            </a>
            .
          </p>
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

      {targetSchools.length > 0 && (
        <div className="mt-5 rounded-xl border border-line bg-card p-5">
          <h2 className="text-base font-semibold text-ink">Your target schools</h2>
          <ul className="mt-3.5 flex flex-col gap-2.5 text-sm">
            {targetSchools.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <Link href={`/schools/${s.slug}`} className="truncate text-ink hover:text-grass">
                  {s.shortName}
                </Link>
                <FitBadge band={classifySchoolFit(player.currentUTR, s, fitProjection)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-stone">Live data, your own account.</p>
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
