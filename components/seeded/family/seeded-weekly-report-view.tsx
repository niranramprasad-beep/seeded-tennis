"use client";

import { useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { SchoolLite } from "@/lib/types";
import { usePlayer } from "@/lib/context/player-context";
import { loadCoachOutreachDated, loadFamilyMembers, type FamilyMember } from "@/lib/supabase/features";
import { loadUtrEntries } from "@/lib/supabase/utr";
import { loadTournamentEntries } from "@/lib/supabase/tournaments";
import { loadBudgetExpenses, loadSeasonBudget } from "@/lib/supabase/budget";
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

  const { data: members = [] } = useSWR<FamilyMember[]>("family-members", () => loadFamilyMembers());
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());
  const { data: tournamentEntries = [] } = useSWR("tournament-entries", () => loadTournamentEntries());
  const { data: seasonBudget } = useSWR("season-budget", () => loadSeasonBudget());
  const { data: expenses = [] } = useSWR("budget-expenses", () => loadBudgetExpenses());

  const playerMember = members.find((m) => m.role === "player");
  const playerName = playerMember?.name || player.name || "your player";
  const firstName = playerName.split(" ")[0];
  const currentUTR = playerMember?.currentUtr ?? player.currentUTR;

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
        entries: tournamentEntries,
        expenses,
      }),
    [totalBudget, currentUTR, tournamentEntries, expenses]
  );

  const weekRange = useMemo(() => {
    const start = new Date(now.getTime() - 6 * 86_400_000);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(start)} – ${fmt(now)}`;
  }, [now]);

  return (
    <div className="mx-auto max-w-content container-px py-10">
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
          value={formatUTR(currentUTR)}
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
