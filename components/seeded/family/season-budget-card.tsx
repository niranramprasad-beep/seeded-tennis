"use client";

import Link from "next/link";
import { useState } from "react";
import type { SeasonBudgetSummary } from "@/lib/family-budget";
import type { BudgetExpenseCategory } from "@/lib/supabase/budget";
import { cn } from "@/lib/utils";
import { SeededButton } from "@/components/seeded/ui/button";
import { EmptyState } from "@/components/seeded/ui/empty-state";
import { BudgetChip, SavedChip } from "./budget-chip";
import { AddExpenseModal, EditBudgetModal } from "./budget-modals";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

// Progress-bar segment colors sampled directly off "18 Parent view +
// budget.png" (no existing token matched closely enough) — same discipline
// as FitBadge's reach band / VERDICT_META's decent-fit colors, both
// one-off hex values measured from a mockup rather than forced onto an
// unrelated token.
const SEGMENT_COLOR = {
  entries: "#1F6B4A",
  travel: "#9CC8B0",
  camps: "#C2643A",
};

export function SeasonBudgetCard({
  seasonLabel,
  summary,
  compact = false,
  onSaveBudget,
  onAddExpense,
}: {
  seasonLabel: string;
  summary: SeasonBudgetSummary;
  /** Overview's condensed card shows only the 3 most recent line items and
   * links out to the full /family/budget table; the Budget page itself
   * passes compact=false for the complete list. */
  compact?: boolean;
  onSaveBudget: (input: { seasonLabel: string; totalBudget: number }) => Promise<void>;
  onAddExpense: (input: {
    category: BudgetExpenseCategory;
    label: string;
    amount: number;
    expenseDate: string;
  }) => Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { totalBudget, spent } = summary;
  const hasBudget = totalBudget > 0;
  const pct = (value: number) => (hasBudget ? Math.min(100, (Math.max(0, value) / totalBudget) * 100) : 0);
  const remainingPct = hasBudget
    ? Math.max(0, 100 - pct(summary.entriesSpent) - pct(summary.travelSpent) - pct(summary.campsSpent))
    : 100;

  const rows = compact ? summary.lineItems.slice(0, 3) : summary.lineItems;

  return (
    <div className="rounded-xl border border-line bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Season budget · {seasonLabel}</h2>
        <div className="flex items-center gap-2.5">
          <SeededButton variant="secondary" className="min-h-[38px] px-4" onClick={() => setEditOpen(true)}>
            Edit budget
          </SeededButton>
          <SeededButton className="min-h-[38px] px-4" onClick={() => setAddOpen(true)}>
            Add expense
          </SeededButton>
        </div>
      </div>

      {!hasBudget ? (
        <div className="mt-4">
          <EmptyState
            title="No season budget set yet."
            description="Set a total to start tracking spend against it."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between gap-2 font-mono text-sm">
            <span className="font-semibold text-ink">{money(spent)} spent</span>
            <span className="text-stone">of {money(totalBudget)}</span>
          </div>
          <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-pill bg-line">
            <div style={{ width: `${pct(summary.entriesSpent)}%`, background: SEGMENT_COLOR.entries }} />
            <div style={{ width: `${pct(summary.travelSpent)}%`, background: SEGMENT_COLOR.travel }} />
            <div style={{ width: `${pct(summary.campsSpent)}%`, background: SEGMENT_COLOR.camps }} />
            <div style={{ width: `${remainingPct}%` }} />
          </div>
          <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone">
            <span>
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: SEGMENT_COLOR.entries }} />
              Entries {money(summary.entriesSpent)}
            </span>
            <span>
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: SEGMENT_COLOR.travel }} />
              Travel {money(summary.travelSpent)}
            </span>
            <span>
              <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: SEGMENT_COLOR.camps }} />
              Camps {money(summary.campsSpent)}
            </span>
          </p>
        </>
      )}

      {rows.length > 0 || summary.skippedBadFitCount > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-stone">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">Fit</th>
                <th className="py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap py-3 pr-3 font-mono text-stone">{shortDate(row.date)}</td>
                  <td className="py-3 pr-3 text-ink">{row.label}</td>
                  <td className="py-3 pr-3">
                    <BudgetChip chip={row.chip} />
                  </td>
                  <td className="whitespace-nowrap py-3 text-right font-mono text-ink">{money(row.cost)}</td>
                </tr>
              ))}
              {summary.skippedBadFitCount > 0 && (
                <tr className="last:border-0">
                  <td className="py-3 pr-3 text-stone">—</td>
                  <td className="py-3 pr-3 text-ink">
                    Skipped: {summary.skippedBadFitCount} bad-fit event{summary.skippedBadFitCount === 1 ? "" : "s"}
                  </td>
                  <td className="py-3 pr-3">
                    <SavedChip />
                  </td>
                  <td className="whitespace-nowrap py-3 text-right font-mono text-grass">
                    -{money(summary.skippedBadFitSaved)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {compact && summary.lineItems.length > rows.length && (
            <Link href="/family/budget" className="mt-3 inline-block text-sm font-semibold text-grass">
              See full budget →
            </Link>
          )}
        </div>
      ) : (
        <div className={cn(hasBudget && "mt-5")}>
          <EmptyState
            title="No spend logged yet."
            description="Entered tournaments and logged expenses will show up here."
          />
        </div>
      )}

      <EditBudgetModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initialLabel={seasonLabel}
        initialTotal={totalBudget}
        onSave={onSaveBudget}
      />
      <AddExpenseModal open={addOpen} onClose={() => setAddOpen(false)} onSave={onAddExpense} />
    </div>
  );
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
