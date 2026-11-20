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
import { loadFamilyPlanStatus, type FamilyPlanStatus } from "@/lib/db/family-plan";
import { buildSeasonBudgetSummary, canEditBudget } from "@/lib/family-budget";
import { currentSeason } from "@/lib/time";
import { CostCalculatorView } from "@/components/cost/cost-calculator-view";
import { SeasonBudgetCard } from "./season-budget-card";
import { FamilyPlanPaywall } from "./dashboard/family-plan-paywall";
import { BudgetPageSkeleton, NoFamilyYet } from "./dashboard/page-skeletons";

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

  const { data: members = [], isLoading: membersLoading } = useSWR<FamilyMember[]>("family-members", () =>
    loadFamilyMembers()
  );
  // The Family plan first. While it is locked none of the budget loaders
  // start: RLS would return them empty, which reads as "no spend", and this
  // page's Edit / Add-expense controls must not be reachable at all.
  const plan = useSWR<FamilyPlanStatus>("family-plan-status", () => loadFamilyPlanStatus());
  const unlocked = plan.data?.unlocked === true;
  // The family's money: every approved player's entered tournaments,
  // chosen explicitly (lib/db/family-scope.ts DataSubject).
  const entriesSwr = useSWR(unlocked ? ["tournament-entries", subjectKey("family-players")] : null, () =>
    loadTournamentEntries("family-players")
  );
  const budgetSwr = useSWR(unlocked ? "season-budget" : null, () => loadSeasonBudget());
  const expensesSwr = useSWR(unlocked ? "budget-expenses" : null, () => loadBudgetExpenses());
  const seasonBudget = budgetSwr.data;

  const playerMember = pickFamilyPlayer(members);
  // See seeded-family-overview.tsx. The `??` borrowed the signed-in
  // parent's placeholder UTR, which here decided each entered tournament's
  // fit chip — "bad fit" verdicts computed from a rating nobody entered.
  // buildSeasonBudgetSummary now takes null and omits the verdict instead.
  const playerFacts = resolveFamilyPlayerFacts(playerMember, player);
  const currentUTR = playerFacts.currentUtr;
  const seasonLabel = seasonBudget?.seasonLabel ?? seasonTitle(now);
  const totalBudget = seasonBudget?.totalBudget ?? 0;

  const budgetSummary = useMemo(
    () =>
      buildSeasonBudgetSummary({
        totalBudget,
        playerUtr: currentUTR,
        entries: entriesSwr.data ?? [],
        expenses: expensesSwr.data ?? [],
        judgedUserId: playerMember?.id ?? null,
      }),
    [totalBudget, currentUTR, entriesSwr.data, expensesSwr.data, playerMember]
  );

  const saveBudget = async (input: { seasonLabel: string; totalBudget: number }) => {
    const saved = await saveSeasonBudget(input);
    if (saved) budgetSwr.mutate(saved, { revalidate: false });
  };

  const addExpense = async (input: Parameters<typeof saveBudgetExpense>[0]) => {
    const saved = await saveBudgetExpense(input);
    if (saved) expensesSwr.mutate([saved, ...(expensesSwr.data ?? [])], { revalidate: false });
  };

  // Wait for EVERYTHING the page shows, then draw once. Drawing as soon as
  // the roster answered let the budget, the expenses and the entries each
  // grow the card afterwards (CLS 0.058 at 1440, PR A).
  if (membersLoading || plan.isLoading || entriesSwr.isLoading || budgetSwr.isLoading || expensesSwr.isLoading) {
    return <BudgetPageSkeleton />;
  }
  if (plan.data?.reason === "no-family") return <NoFamilyYet />;
  if (!unlocked) {
    const child = (playerMember?.name ?? "").trim().split(" ")[0] || null;
    return <FamilyPlanPaywall page="budget" childFirst={child} />;
  }

  return (
    <div key="family-page" className="mx-auto max-w-content container-px py-10">
      <ParentScopeLine />
      <div className="h-6" aria-hidden />
      <h1 className="font-seeded text-[32px] font-bold leading-tight tracking-tight text-ink">Season budget</h1>
      <p className="mt-1.5 max-w-2xl text-stone">
        Your family&rsquo;s spend this season &mdash; expenses you add, plus tournaments the players in
        your family have entered &mdash; and a longer-range projection from your own numbers.
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
          Add up training, tournaments, travel and equipment over the years remaining, from numbers you enter.
          Seeded holds no cost-of-attendance or athletic-aid figures, so it does not estimate them.
        </p>
        <div className="-mx-5 mt-2 sm:-mx-8 lg:-mx-10">
          {/* The PLAYER's class year (not the signed-in parent's own row),
              so "Years remaining" starts from a real date or stays empty. */}
          <CostCalculatorView schools={schools} embedded playerGraduationYear={playerFacts.graduationYear} />
        </div>
      </div>
    </div>
  );
}
