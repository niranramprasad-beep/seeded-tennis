import type { ChartLegendItem } from "@/lib/chart-legend";
import { cn } from "@/lib/utils";

/** A short sample of each line, drawn the way the chart draws it. */
function Swatch({ kind }: { kind: ChartLegendItem["key"] }) {
  return (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden className="shrink-0">
      {kind === "logged" && <line x1="1" y1="6" x2="25" y2="6" stroke="rgb(var(--c-primary))" strokeWidth="3" />}
      {kind === "plan" && (
        <>
          <line x1="1" y1="6" x2="25" y2="6" stroke="rgb(var(--c-primary))" strokeWidth="2" strokeDasharray="6 5" />
          <rect x="15" y="2" width="8" height="8" fill="rgb(var(--c-gold))" transform="rotate(45 19 6)" />
        </>
      )}
      {kind === "estimate" && (
        <line x1="2" y1="6" x2="24" y2="6" stroke="rgb(var(--c-primary))" strokeWidth="2.5" strokeDasharray="0.5 6" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** The swatch legend under both UTR charts (lib/chart-legend.ts). */
export function ChartLegend({ items, className }: { items: ChartLegendItem[]; className?: string }) {
  return (
    <ul className={cn("mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-stone", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <Swatch kind={item.key} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
