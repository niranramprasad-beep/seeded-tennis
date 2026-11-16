"use client";

import { ParentScopeLine } from "@/components/seeded/family/parent-scope-line";
import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { SchoolLite } from "@/lib/types";
import { pickFamilyPlayer, resolveFamilyPlayerFacts } from "@/lib/family-view";
import { usePlayer } from "@/lib/context/player-context";
import { loadCoachOutreachDated } from "@/lib/db/outreach";
import { subjectKey } from "@/lib/db/family-scope";
import { loadFamilyMembers, type FamilyMember } from "@/lib/db/family";
import { loadUtrEntriesFor } from "@/lib/db/plan";
import { loadTournamentEntries } from "@/lib/db/events";
import { loadBudgetExpenses, loadSeasonBudget } from "@/lib/db/family";
import { buildSeasonBudgetSummary } from "@/lib/family-budget";
import { utrDeltaWithBaseline } from "@/lib/plan-stats";
import { daysSince } from "@/lib/today-actions";
import { currentSeason } from "@/lib/time";
import { formatUTR } from "@/lib/utils";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function seasonTitle(now: Date): string {
  const s = currentSeason(now);
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${now.getFullYear()}`;
}

// Real weekly summary — no example/placeholder copy anywhere. Same
// STRUCTURE as the separate "Sample parent report" mockup
// (ParentReport.dc.html, a different in-flight task) but built from the
// exact same real sources the rest of /family already uses, so it never
// needs example data to look complete: real UTR movement
// (utrDeltaWithBaseline over the last 7 days), real coach-reply activity
// this week (coach_outreach rows whose updated_at falls in the last 7
// days), real upcoming events (tournament_entries, soonest first), and
// real season spend to date (lib/family-budget.ts's
// buildSeasonBudgetSummary — same engine /family and /family/budget use).
export function SeededWeeklyReportView({ schools }: { schools: SchoolLite[] }) {
  const { player } = usePlayer();
  const now = useMemo(() => new Date(), []);
  const schoolBySlug = useMemo(() => new Map(schools.map((s) => [s.slug, s])), [schools]);

  const { data: members = [], isLoading: membersLoading } = useSWR<FamilyMember[]>("family-members", () =>
    loadFamilyMembers()
  );
  // The PLAYER's history, explicitly. This read the pooled family list and
  // computed "−4.40 this week" by subtracting one person's rating from
  // another's — see loadUtrEntries() for the whole story.
  const playerId = pickFamilyPlayer(members)?.id ?? null;
  const { data: utrEntries } = useSWR(
    playerId ? ["utr-entries", playerId] : null,
    () => loadUtrEntriesFor(playerId!)
  );
  // Scoped to the player by id (lib/db/family-scope.ts DataSubject). These
  // used to load every approved member's rows whenever the viewer was a
  // parent, so a sibling's emails and events were counted as this player's.
  const { data: outreach } = useSWR(
    playerId ? ["coach-outreach-dated", subjectKey({ userId: playerId })] : null,
    () => loadCoachOutreachDated({ userId: playerId! })
  );
  const { data: tournamentEntries = [] } = useSWR(
    playerId ? ["tournament-entries", subjectKey({ userId: playerId })] : null,
    () => loadTournamentEntries({ userId: playerId! })
  );
  // The season budget is the FAMILY's money, so its spend counts every
  // player's entered tournaments — explicitly, not by default.
  const { data: familyTournamentEntries = [] } = useSWR(
    ["tournament-entries", subjectKey("family-players")],
    () => loadTournamentEntries("family-players")
  );
  const { data: seasonBudget } = useSWR("season-budget", () => loadSeasonBudget());
  const { data: expenses = [] } = useSWR("budget-expenses", () => loadBudgetExpenses());

  const playerMember = pickFamilyPlayer(members);
  // Never the viewer's own name: with no player in the family this printed
  // the PARENT's name as the player's ("Jordan's week").
  const playerName = playerMember?.name || "your player";
  const firstName = playerName.split(" ")[0];
  // Same correction as seeded-family-overview.tsx: a `??` here let a player
  // row with no UTR, or a family with no approved player at all, fall
  // through to the signed-in PARENT's own profile, whose UTR is the
  // `emptyPlayer` placeholder rather than any real rating. Null means "not
  // tracked" and is rendered as those words.
  const currentUTR = resolveFamilyPlayerFacts(playerMember, player).currentUtr;

  const weekDelta = useMemo(() => {
    if (!utrEntries) return null;
    return utrDeltaWithBaseline(utrEntries, 0.25, now); // ~1 week window
  }, [utrEntries, now]);

  const activityThisWeek = useMemo(() => {
    const entries = Object.entries(outreach ?? {}).filter(([, v]) => daysSince(v.updatedAt, now) <= 7);
    const emailed = entries.filter(([, v]) => v.status !== "researching");
    const replied = entries.filter(([, v]) =>
      ["replied", "call_visit", "offer", "committed"].includes(v.status)
    );
    return { emailed, replied };
  }, [outreach, now]);

  const upcomingEvents = useMemo(() => {
    const todayKey = now.toISOString().slice(0, 10);
    return [...tournamentEntries]
      .filter((e) => e.eventDate >= todayKey)
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
      .slice(0, 5);
  }, [tournamentEntries, now]);

  const seasonLabel = seasonBudget?.seasonLabel ?? seasonTitle(now);
  const totalBudget = seasonBudget?.totalBudget ?? 0;
  const budgetSummary = useMemo(
    () =>
      buildSeasonBudgetSummary({
        totalBudget,
        playerUtr: currentUTR,
        entries: familyTournamentEntries,
        expenses,
        judgedUserId: playerId,
      }),
    [totalBudget, currentUTR, familyTournamentEntries, expenses, playerId]
  );

  const weekRange = useMemo(() => {
    const start = new Date(now.getTime() - 6 * 86_400_000);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(now)}`;
  }, [now]);

  if (membersLoading) {
    // Wait for the roster: the scope line, the player's name and every
    // player-scoped number below depend on it, and rendering first made the
    // page jump when they arrived. Keyed so the real page mounts fresh.
    return (
      <div key="family-page-skeleton" className="mx-auto max-w-content container-px py-10" aria-busy="true">
        <p className="sr-only" role="status">Loading…</p>
        <div className="h-[72px] animate-pulse rounded-lg bg-line/40 motion-reduce:animate-none" aria-hidden />
        <div className="mt-6 h-10 w-72 animate-pulse rounded-lg bg-line/50 motion-reduce:animate-none" aria-hidden />
        <div className="mt-6 min-h-[50vh] animate-pulse rounded-xl bg-line/40 motion-reduce:animate-none" aria-hidden />
      </div>
    );
  }

  return (
    <div key="family-page" className="mx-auto max-w-content container-px py-10">
      <ParentScopeLine />
      <div className="h-6" aria-hidden />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
            {firstName}&rsquo;s week
          </h1>
          <p className="mt-1.5 text-stone">Real activity for {weekRange}.</p>
        </div>
        <Link href="/family">
          <SeededButton variant="secondary">Back to overview</SeededButton>
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportTile
          value={currentUTR == null ? "Not tracked" : formatUTR(currentUTR)}
          label={
            weekDelta
              ? `UTR · ${weekDelta.delta >= 0 ? "+" : ""}${weekDelta.delta.toFixed(2)} this week`
              : "UTR · no change logged this week"
          }
        />
        <ReportTile value={String(activityThisWeek.emailed.length)} label="coaches emailed this week" />
        <ReportTile value={String(activityThisWeek.replied.length)} label="coaches replied this week" />
        <ReportTile value={money(budgetSummary.spent)} label={`spent so far · ${seasonLabel}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-6">
          <h2 className="text-lg font-semibold text-ink">Coach activity this week</h2>
          {activityThisWeek.emailed.length === 0 ? (
            <div className="mt-3.5">
              <EmptyState title="No outreach activity logged this week." />
            </div>
          ) : (
            <ul className="mt-3.5 flex flex-col gap-2.5 text-sm">
              {activityThisWeek.emailed.map(([slug, v]) => (
                <li key={slug} className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">{schoolBySlug.get(slug)?.shortName ?? slug}</span>
                  <span className="shrink-0 text-xs capitalize text-stone">{v.status.replace("_", " ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-line bg-card p-6">
          <h2 className="text-lg font-semibold text-ink">Upcoming events</h2>
          {upcomingEvents.length === 0 ? (
            <div className="mt-3.5">
              <EmptyState title="Nothing on the calendar yet." description="Saved and entered tournaments will show up here." />
            </div>
          ) : (
            <ul className="mt-3.5 flex flex-col gap-2.5 text-sm">
              {upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-ink">{e.name}</span>
                  <span className="shrink-0 font-mono text-xs text-stone">{shortDate(e.eventDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-stone">Real data, your own family&rsquo;s account.</p>
    </div>
  );
}

function ReportTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <p className="font-mono text-3xl text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-stone">{label}</p>
    </div>
  );
}
