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
import { currentSeason, formatShortDate, toLocalDateString } from "@/lib/time";
import { formatPlayerUtr, pluralNoun } from "@/lib/utils";
import { loadFamilyPlanStatus, type FamilyPlanStatus } from "@/lib/db/family-plan";
import { seededLinkButtonClass } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { FamilyPlanPaywall } from "./dashboard/family-plan-paywall";
import { NoFamilyYet, WeeklyReportSkeleton } from "./dashboard/page-skeletons";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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
  // The Family plan first: while it is locked nothing below starts (RLS
  // would return it all empty, which reads as "a quiet week").
  const plan = useSWR<FamilyPlanStatus>("family-plan-status", () => loadFamilyPlanStatus());
  const unlocked = plan.data?.unlocked === true;
  // The PLAYER's history, explicitly. This read the pooled family list and
  // computed "−4.40 this week" by subtracting one person's rating from
  // another's — see loadUtrEntries() for the whole story.
  const playerId = pickFamilyPlayer(members)?.id ?? null;
  const live = unlocked && playerId != null;
  const utrSwr = useSWR(live ? ["utr-entries", playerId] : null, () => loadUtrEntriesFor(playerId!));
  const utrEntries = utrSwr.data;
  // Scoped to the player by id (lib/db/family-scope.ts DataSubject). These
  // used to load every approved member's rows whenever the viewer was a
  // parent, so a sibling's emails and events were counted as this player's.
  const outreachSwr = useSWR(live ? ["coach-outreach-dated", subjectKey({ userId: playerId! })] : null, () =>
    loadCoachOutreachDated({ userId: playerId! })
  );
  const outreach = outreachSwr.data;
  const entriesSwr = useSWR(live ? ["tournament-entries", subjectKey({ userId: playerId! })] : null, () =>
    loadTournamentEntries({ userId: playerId! })
  );
  const tournamentEntries = useMemo(() => entriesSwr.data ?? [], [entriesSwr.data]);
  // The season budget is the FAMILY's money, so its spend counts every
  // player's entered tournaments — explicitly, not by default.
  const familyEntriesSwr = useSWR(unlocked ? ["tournament-entries", subjectKey("family-players")] : null, () =>
    loadTournamentEntries("family-players")
  );
  const familyTournamentEntries = useMemo(() => familyEntriesSwr.data ?? [], [familyEntriesSwr.data]);
  const budgetSwr = useSWR(unlocked ? "season-budget" : null, () => loadSeasonBudget());
  const seasonBudget = budgetSwr.data;
  const expensesSwr = useSWR(unlocked ? "budget-expenses" : null, () => loadBudgetExpenses());
  const expenses = useMemo(() => expensesSwr.data ?? [], [expensesSwr.data]);
  const dataLoading =
    plan.isLoading ||
    utrSwr.isLoading ||
    outreachSwr.isLoading ||
    entriesSwr.isLoading ||
    familyEntriesSwr.isLoading ||
    budgetSwr.isLoading ||
    expensesSwr.isLoading;

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
    // Local, not toISOString(): in a US evening that is already tomorrow.
    const todayKey = toLocalDateString(now);
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

  // Wait for the roster, the plan AND every row the report shows, then draw
  // once: drawing on the roster alone let each tile and list fill in (and
  // grow) afterwards. The skeleton is this page's own boxes.
  if (membersLoading || dataLoading) return <WeeklyReportSkeleton />;
  if (plan.data?.reason === "no-family") return <NoFamilyYet />;
  if (!unlocked) {
    return <FamilyPlanPaywall page="weekly" childFirst={playerMember ? firstName : null} />;
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
        <Link href="/family" className={seededLinkButtonClass("secondary")}>
          Back to overview
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportTile
          value={currentUTR == null ? "No UTR yet" : formatPlayerUtr(currentUTR)}
          label={
            weekDelta
              ? `UTR · ${weekDelta.delta >= 0 ? "+" : ""}${weekDelta.delta.toFixed(2)} this week`
              : "UTR · no change logged this week"
          }
        />
        {/* "1 coaches emailed" (QA sweep L8): the noun follows the count. */}
        <ReportTile
          value={String(activityThisWeek.emailed.length)}
          label={`${pluralNoun(activityThisWeek.emailed.length, "coach", "coaches")} emailed this week`}
        />
        <ReportTile
          value={String(activityThisWeek.replied.length)}
          label={`${pluralNoun(activityThisWeek.replied.length, "coach", "coaches")} replied this week`}
        />
        <ReportTile value={money(budgetSummary.spent)} label={`spent so far · ${seasonLabel}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-card p-6">
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

        <div className="rounded-card border border-line bg-card p-6">
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
                  <span className="shrink-0 font-mono text-xs text-stone">{formatShortDate(e.eventDate)}</span>
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
    <div className="rounded-card border border-line bg-card p-5">
      <p className="font-mono text-3xl text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-stone">{label}</p>
    </div>
  );
}
