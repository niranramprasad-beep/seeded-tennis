import { cn } from "@/lib/utils";

// The ONE way a number's change is drawn (docs/DECISIONS.md 2026-11-22):
// the percent leads, the raw change sits beside it as smaller secondary
// text — "+1.3% (+0.12)". With no honest percent (lib/utr-percent.ts returns
// null: a missing or placeholder rating, a zero base, a flat line) only the
// raw change shows, in the lead position. The raw number is never dropped.
export function ChangeFigure({
  amount,
  percent,
  className,
  secondaryClassName,
}: {
  /** "+0.12" — always rendered. */
  amount: string;
  /** "+1.3%" or null. Never a fit band: bands are never a percent. */
  percent: string | null | undefined;
  className?: string;
  /** Size/colour of the raw change when it is the secondary text (e.g. a
   * dark panel needs its own muted colour). */
  secondaryClassName?: string;
}) {
  if (!percent) {
    return <span className={cn("font-mono font-semibold tabular-nums", className)}>{amount}</span>;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1", className)}>
      <span className="font-mono font-semibold tabular-nums">{percent}</span>
      <span className={cn("font-mono text-[0.85em] font-normal tabular-nums text-stone", secondaryClassName)}>({amount})</span>
    </span>
  );
}
