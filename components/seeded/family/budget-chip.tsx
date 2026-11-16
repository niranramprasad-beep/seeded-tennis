import type { BudgetLineChip } from "@/lib/family-budget";
import { cn } from "@/lib/utils";

// Same "border + bg + text" chip language as VERDICT_META
// (components/seeded/tournament-fit/seeded-tournament-fit-view.tsx) for the
// good/decent/bad verdict colors — reused directly so a tournament never
// reads as a different fit color on /family than it does on
// /tournament-fit or /events. The 3 budget_expenses categories
// (entries/travel/camps) aren't fit-scored, so they get a single neutral
// chip style, matching "Camp" in "18 Parent view + budget.png".
const CHIP_CLASS: Record<BudgetLineChip, string> = {
  good: "border-grass-100 bg-grass-50 text-grass",
  decent: "border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] text-[rgb(var(--c-gold-tint-text))]",
  bad: "border-[rgb(var(--c-clay-tint-border))] bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text-strong))]",
  entries: "border-line bg-card text-stone",
  travel: "border-line bg-card text-stone",
  camps: "border-line bg-card text-stone",
};

const CHIP_LABEL: Record<BudgetLineChip, string> = {
  good: "Good fit",
  decent: "Decent fit",
  bad: "Bad fit",
  entries: "Entry",
  travel: "Travel",
  camps: "Camp",
};

export function BudgetChip({ chip, className }: { chip: BudgetLineChip; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        CHIP_CLASS[chip],
        className
      )}
    >
      {CHIP_LABEL[chip]}
    </span>
  );
}

/** The "Skipped: N bad-fit events" summary row's own chip — same green as a
 * "Good fit" (a skip IS the good outcome here: money the family didn't
 * spend on a bad-fit event), labeled "Saved" per the mockup. */
export function SavedChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        CHIP_CLASS.good,
        className
      )}
    >
      Saved
    </span>
  );
}
