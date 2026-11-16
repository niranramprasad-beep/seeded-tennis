"use client";

import { ParentScopeLine } from "@/components/seeded/family/parent-scope-line";
import { useMemo } from "react";
import useSWR from "swr";
import type { SchoolLite } from "@/lib/types";
import { pickFamilyPlayer, resolveFamilyPlayerFacts } from "@/lib/family-view";
import { usePlayer } from "@/lib/context/player-context";
import { loadFamilyMembers, type FamilyMember } from "@/lib/db/family";
import { loadTournamentEntries } from "@/lib/db/events";
import { subjectKey } from "@/lib/db/family-scope";
import { loadBudgetExpenses, loadSeasonBudget, saveBudgetExpense, saveSeasonBudget } from "@/lib/db/family";
import { buildSeasonBudgetSummary, canEditBudget } from "@/lib/family-budget";
import { currentSeason } from "@/lib/time";
import { CostCalculatorView } from "@/components/cost/cost-calculator-view";
import { SeasonBudgetCard } from "./season-budget-card";

function seasonTitle(now: Date): string {
  const s = currentSeason(now);
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} ${now.getFullYear()}`;
}

// No mockup defines a dedicated Budget page (18 Parent view + budget.png
// only shows Overview's condensed card) — this is the full version of that
// same real card (every line item, not just the top 3) plus the existing
// lifetime cost-projection tool (lib/db/family.ts (formerly lib/supabase/features.ts)'s
// CostInputs/CostResults), preserved here rather than dropped: it was
// already real, already working, and already lived in /family's Budget tab
// before this rebuild moved Budget to its own route.
export function SeededFamilyBudgetView({ schools }: { schools: SchoolLite[] }) {
  const { player } = usePlayer();
  const now = useMemo(() => new Date(), []);

  const { data: members = [] } = useSWR<FamilyMember[]>("family-members", () => loadFamilyMembers());
  // The family's money: every approved player's entered tournaments,
  // chosen explicitly (lib/db/family-scope.ts DataSubject).
  const { data: tournamentEntries = [] } = useSWR(
    ["tournament-entries", subjectKey("family-players")],
    () => loadTournamentEntries("family-players")
  );
  const { data: seasonBudget, mutate: mutateSeasonBudget } = useSWR("season-budget", () => loadSeasonBudget());
  const { data: expenses = [], mutate: mutateExpenses } = useSWR("budget-expenses", () => loadBudgetExpenses());

  const playerMember = pickFamilyPlayer(members);
  // See seeded-family-overview.tsx. The `??` borrowed the signed-in
  // parent's placeholder UTR, which here decided each entered tournament's
  // fit chip — "bad fit" verdicts computed from a rating nobody entered.
  // buildSeasonBudgetSummary now takes null and omits the verdict instead.
  const currentUTR = resolveFamilyPlayerFacts(playerMember, player).currentUtr;
  const seasonLabel = seasonBudget?.seasonLabel ?? seasonTitle(now);
  const totalBudget = seasonBudget?.totalBudget ?? 0;

  const budgetSummary = useMemo(
    () =>
      buildSeasonBudgetSummary({
        totalBudget,
        playerUtr: currentUTR,
        entries: tournamentEntries,
        expenses,
        judgedUserId: playerMember?.id ?? null,
      }),
    [totalBudget, currentUTR, tournamentEntries, expenses, playerMember]
  );

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
      <ParentScopeLine />
      <div className="h-6" aria-hidden />
      <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">Season budget</h1>
      <p className="mt-1.5 max-w-2xl text-stone">
        Real spend for {playerMember?.name?.split(" ")[0] ?? "your player"}&rsquo;s season, plus a longer-range cost
        projection.
      </p>

      <div className="mt-6">
        <SeasonBudgetCard
          seasonLabel={seasonLabel}
          summary={budgetSummary}
          canEdit={canEditBudget(player.role)}
          onSaveBudget={saveBudget}
          onAddExpense={addExpense}
        />
      </div>

      <div className="mt-10 border-t border-line pt-8">
        <h2 className="text-lg font-semibold text-ink">Longer-range projection</h2>
        <p className="mt-1 max-w-2xl text-sm text-stone">
          Estimate training, tournaments, travel, and equipment over the years remaining, and compare against
          realistic scholarship ranges.
        </p>
        <div className="-mx-6 mt-2">
          <CostCalculatorView schools={schools} />
        </div>
      </div>
    </div>
  );
}
