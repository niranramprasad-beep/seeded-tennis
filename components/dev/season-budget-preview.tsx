"use client";

import type { SeasonBudgetSummary } from "@/lib/family-budget";
import { SeasonBudgetCard } from "@/components/seeded/family/season-budget-card";

// Internal tool only — renders SeasonBudgetCard against hardcoded numbers
// matching "18 Parent view + budget.png" exactly (no Supabase involved at
// all), for a direct pixel comparison of the card itself independent of
// any real account's data. Not a route meant to ship; see
// app/dev/season-budget-preview/page.tsx (404s in prod).
const SAMPLE_SUMMARY: SeasonBudgetSummary = {
  totalBudget: 3000,
  spent: 1840,
  remaining: 1160,
  entriesSpent: 520,
  travelSpent: 940,
  campsSpent: 380,
  lineItems: [
    { id: "1", date: "2026-10-30", label: "L3 Richmond Fall · entry + travel", cost: 410, chip: "good" },
    { id: "2", date: "2026-10-17", label: "L2 Norfolk · entry + travel", cost: 220, chip: "decent" },
    { id: "3", date: "2026-09-26", label: "Duke Tennis Camp", cost: 380, chip: "camps" },
  ],
  skippedBadFitCount: 2,
  skippedBadFitSaved: 620,
};

export function SeasonBudgetPreview() {
  return (
    <div className="mx-auto max-w-2xl p-10">
      <SeasonBudgetCard
        seasonLabel="Fall 2026"
        summary={SAMPLE_SUMMARY}
        onSaveBudget={async () => {}}
        onAddExpense={async () => {}}
      />
    </div>
  );
}
