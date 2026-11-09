"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { SchoolLite } from "@/lib/types";
import { SeededButton } from "@/components/seeded/ui/button";
import { usePlayer } from "@/lib/context/player-context";
import {
  loadCoachOutreachDated,
  loadFamilyMembers,
  saveEncouragementNote,
  type FamilyMember,
} from "@/lib/supabase/features";
import { loadUtrEntries } from "@/lib/supabase/utr";
import { loadTournamentEntries } from "@/lib/supabase/tournaments";
import { loadBudgetExpenses, loadSeasonBudget, saveBudgetExpense, saveSeasonBudget } from "@/lib/supabase/budget";
import { classifySchoolFit } from "@/lib/school-fit";
import { utrDeltaWithBaseline } from "@/lib/plan-stats";
import { buildSeasonBudgetSummary, pendingSkipDecisions } from "@/lib/family-budget";
import { currentSeason, getCurrentGrade } from "@/lib/time";
import { gradeStandingName } from "@/lib/utr-projection";
import { formatUTR } from "@/lib/utils";
import { SeasonBudgetCard } from "./season-budget-card";
import { NeedsDecisionCard } from "./needs-decision-card";
import { FamilyMembersCard } from "./family-members-card";
import { SendNoteModal } from "./send-note-modal";
import { Toast } from "@/components/seeded/ui/toast";

function seasonTitle(now: Date): string {
  const s = currentSeason(now);
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${now.getFullYear()}`;
}

// Pixel-exact to "18 Parent view + budget.png" — the real Seeded parent
// Overview. Every number traces to a real source:
//   - UTR + delta: loadUtrEntries() (now family-readable, migration 015)
//     against the player's family row, same utrDeltaWithBaseline() math
//     /plan already charts.
//   - coaches emailed/replied + target schools + "on track for N of M":
//     the real target-school list (now surfaced on FamilyMember, since a
//     parent's OWN profile has no target_school_slugs of its own) scored
//     against loadCoachOutreachDated()/classifySchoolFit() — the exact
//     same sources and the exact same "on track" rule (fit !== reach &&
//     fit !== out-of-range) /today's own badge uses.
//   - season budget: lib/family-budget.ts's buildSeasonBudgetSummary(),
//     combining real tournament_entries + budget_expenses (migration 015).
export function SeededFamilyOverview({ schools }: { schools: SchoolLite[] }) {
  const { player } = usePlayer();
  const now = useMemo(() => new Date(), []);

  const { data: members = [] } = useSWR<FamilyMember[]>("family-members", () => loadFamilyMembers());
  const { data: utrEntries } = useSWR("utr-entries", () => loadUtrEntries());
  const { data: outreach } = useSWR("coach-outreach-dated", () => loadCoachOutreachDated());
  const { data: tournamentEntries = [] } = useSWR("tournament-entries", () => loadTournamentEntries());
  const { data: seasonBudget, mutate: mutateSeasonBudget } = useSWR("season-budget", () => loadSeasonBudget());
  const { data: expenses = [], mutate: mutateExpenses } = useSWR("budget-expenses", () => loadBudgetExpenses());

  const playerMember = members.find((m) => m.role === "player");
  const playerName = playerMember?.name || player.name || "your player";
  const firstName = playerName.split(" ")[0];
  const currentUTR = playerMember?.currentUtr ?? player.currentUTR;
  const graduationYear = playerMember?.graduationYear ?? player.graduationYear;
  const gender = playerMember?.gender ?? player.gender;
  // A parent's OWN profile has no target schools of its own — always prefer
  // the real PLAYER row's list (see FamilyMember's targetSchoolSlugs
  // comment in lib/supabase/features.ts).
  const targetSlugs = playerMember?.targetSchoolSlugs ?? player.targetSchoolSlugs;
  const targetSchools = useMemo(
    () => schools.filter((s) => targetSlugs.includes(s.slug)),
    [schools, targetSlugs]
  );

  const grade = getCurrentGrade(graduationYear, now);
  const standing = gradeStandingName(grade);
  const seasonWord = currentSeason(now);

  const fitProjection = useMemo(() => {
    const real = (utrEntries ?? []).map((e) => ({ date: new Date(e.recordedAt), utr: e.utr }));
    const utrHistory = real.length > 0 ? real : [{ date: now, utr: currentUTR }];
    return { utrHistory, graduationYear, gender, now };
  }, [utrEntries, currentUTR, graduationYear, gender, now]);

  const onTrackCount = useMemo(
    () =>
      targetSchools.filter((s) => {
        const fit = classifySchoolFit(currentUTR, s, fitProjection);
        return fit !== "reach" && fit !== "out-of-range";
      }).length,
    [targetSchools, currentUTR, fitProjection]
  );

  const utrDelta = useMemo(
    () => (utrEntries ? utrDeltaWithBaseline(utrEntries, 6, now) : null),
    [utrEntries, now]
  );

  const outreachForTargets = useMemo(
    () => Object.entries(outreach ?? {}).filter(([slug]) => targetSlugs.includes(slug)),
    [outreach, targetSlugs]
  );
  const emailedCount = outreachForTargets.filter(([, v]) => v.status !== "researching").length;
  const repliedCount = outreachForTargets.filter(([, v]) =>
    ["replied", "call_visit", "offer", "committed"].includes(v.status)
  ).length;

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

  const decisions = useMemo(
    () => pendingSkipDecisions(tournamentEntries, currentUTR).slice(0, 3),
    [tournamentEntries, currentUTR]
  );

  const [noteOpen, setNoteOpen] = useState(false);
  const [toast, setToast] = useState("");

  const sendNote = async (body: string) => {
    await saveEncouragementNote(body);
    setToast(`Note sent to ${firstName}.`);
  };

  const saveBudget = async (input: { seasonLabel: string; totalBudget: number }) => {
    const saved = await saveSeasonBudget(input);
    if (saved) mutateSeasonBudget(saved, { revalidate: false });
  };

  const addExpense = async (input: Parameters<typeof saveBudgetExpense>[0]) => {
    const saved = await saveBudgetExpense(input);
    if (saved) mutateExpenses([saved, ...expenses], { revalidate: false });
  };

  return (
    <div className="mx-auto max-w-content container-px py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">
            {firstName}&rsquo;s recruiting
          </h1>
          <p className="mt-1.5 text-stone">
            Class of {graduationYear} ·{" "}
            {standing.charAt(0).toUpperCase() + standing.slice(1)} {seasonWord} · on track for{" "}
            {onTrackCount} of {targetSchools.length} targets
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <SeededButton variant="secondary" onClick={() => setNoteOpen(true)}>
            Send {firstName} a note
          </SeededButton>
          <Link href="/family/weekly-reports">
            <SeededButton>This week&rsquo;s report</SeededButton>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          value={formatUTR(currentUTR)}
          label={
            <>
              UTR
              {utrDelta && (
                <>
                  {" · "}
                  <span className="text-grass">
                    {utrDelta.delta >= 0 ? "+" : ""}
                    {utrDelta.delta.toFixed(2)}
                  </span>{" "}
                  since {monthName(utrDelta.baselineDate)}
                </>
              )}
            </>
          }
        />
        <StatTile value={`${emailedCount} / ${repliedCount}`} label="coaches emailed / replied" />
        <StatTile value={String(targetSchools.length)} label="Target schools" />
        <StatTile value={money(budgetSummary.remaining)} label="left in season budget" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <SeasonBudgetCard
            seasonLabel={seasonLabel}
            summary={budgetSummary}
            compact
            onSaveBudget={saveBudget}
            onAddExpense={addExpense}
          />
        </div>
        <div className="space-y-4">
          <NeedsDecisionCard decisions={decisions} />
          <FamilyMembersCard members={members} familyCode={player.familyCode} />
        </div>
      </div>

      <SendNoteModal open={noteOpen} onClose={() => setNoteOpen(false)} playerName={firstName} onSend={sendNote} />
      <Toast open={!!toast} onDismiss={() => setToast("")} variant="success">
        {toast || " "}
      </Toast>
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-5">
      <p className="font-mono text-3xl text-ink">{value}</p>
      <p className="mt-1.5 text-sm text-stone">{label}</p>
    </div>
  );
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function monthName(iso: string): string {
  return new Date(`${iso.length <= 10 ? iso + "T00:00:00" : iso}`).toLocaleDateString("en-US", { month: "long" });
}
