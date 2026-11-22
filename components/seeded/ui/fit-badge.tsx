import { ArrowUpRight, Check, HelpCircle, Minus, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FitBand = "reach" | "target" | "likely" | "out-of-range" | "unverified";

const LABEL: Record<FitBand, string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
  "out-of-range": "Out of range",
  // The band explainSchoolFit returns when there is no UTR to compare —
  // said as what it is (design system v2 rule 3/4), not "Unverified".
  unverified: "No UTR yet",
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

// Design polish round 1 (Figma "WD — NiranRamprasad — Seeded", 04b Fit band
// badges v2): an icon per band so the band reads at a glance without more
// words. Same tints as before — the palette is unchanged.
const BAND_ICON: Record<FitBand, LucideIcon> = {
  likely: Check,
  target: Target,
  reach: ArrowUpRight,
  "out-of-range": Minus,
  unverified: HelpCircle,
};

/** `label` overrides the band's words for one case only: a parent on Free
 *  whose child HAS a rating that the plan hides — "No UTR yet" said the
 *  rating was missing when it is locked (final-check B8). */
export function FitBadge({ band, className, label }: { band: FitBand; className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        BAND_CLASS[band],
        className
      )}
    >
      {(() => {
        const Icon = BAND_ICON[band];
        return <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} aria-hidden />;
      })()}
      {label ?? LABEL[band]}
    </span>
  );
}
