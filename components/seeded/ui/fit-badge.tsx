import { cn } from "@/lib/utils";

export type FitBand = "reach" | "target" | "likely" | "out-of-range" | "unverified";

const LABEL: Record<FitBand, string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
  "out-of-range": "Out of range",
  unverified: "Unverified",
};

// Pixel-exact to DesignSystem.dc.html's ".chip" base + fit-band colors: pill,
// 4px/10px padding, 12px/600 text, 1px border.
const BAND_CLASS: Record<FitBand, string> = {
  reach: "bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text))] border-[rgb(var(--c-clay-tint-border))]",
  target: "bg-grass-50 text-grass border-grass-100",
  likely: "bg-[rgb(var(--c-sage-tint-bg))] text-[rgb(var(--c-sage-tint-text))] border-[rgb(var(--c-sage-tint-border))]",
  "out-of-range": "bg-card text-stone border-line",
  unverified: "bg-card text-stone border-line border-dashed",
};

export function FitBadge({ band, className }: { band: FitBand; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        BAND_CLASS[band],
        className
      )}
    >
      {LABEL[band]}
    </span>
  );
}
