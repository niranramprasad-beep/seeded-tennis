import { Check, HelpCircle, Lock, Minus, Target, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCHOOL_FIT_BAND_LABEL } from "@/lib/school-fit";

// THE fit band pill. Every Likely / Target / Reach / Out of range on the site
// — and the two non-band states, "No UTR yet" and "Locked" — is drawn here,
// or reads its label, colour and icon from here (the schools filter chips,
// the onboarding report tabs, the landing calculator's count tiles).
// lib/fit-pill-single-source.test.ts fails the build if another file grows
// its own band→label or band→colour table, or writes a band label as a pill.
//
// The words follow the rule the code applies (lib/school-fit.ts
// classifySchoolFit), not the other way round: Likely = at or above the
// team's avgRosterUTR; Target = at or above its minCompetitiveUTR; Reach =
// below that floor but the planning projection (at most
// PLANNING_PACE_CAP_PER_YEAR = 1.5 a year) reaches it by the summer before
// senior year, or fewer than three ratings are logged; Out of range = the
// projection does not reach it. Today every team's two numbers are hand-entered
// ESTIMATES (/methodology section 1): no checked-roster range feeds a band
// yet (lib/catalog/programs.ts bandableRange is not wired to /schools), so
// the words say "estimated floor" / "estimated average", never "median" or
// "quartile". A band is never a percent.

export type FitBand = "reach" | "target" | "likely" | "out-of-range" | "unverified";
/** What a pill can show: a band, or "locked" — the player HAS a rating the
 *  family's plan hides (final-check B8: "No UTR yet" said it was missing). */
export type FitPillState = FitBand | "locked";

export const FIT_BAND_LABEL: Record<FitPillState, string> = {
  ...SCHOOL_FIT_BAND_LABEL,
  // The band explainSchoolFit returns when there is no UTR to compare —
  // said as what it is (design system v2 rule 3/4), not "Unverified".
  unverified: "No UTR yet",
  locked: "Locked — Family plan",
};

/** The rule behind each state, in one sentence: the pill's tooltip and the
 *  methodology legend both read it. Worded to classifySchoolFit. */
export const FIT_BAND_RULE: Record<FitPillState, string> = {
  likely: "Rating at or above the team's estimated average.",
  target: "Rating at or above the team's estimated floor, but below its estimated average.",
  reach:
    "Rating below the team's estimated floor, but projected to reach it by the summer before senior year, planned at no more than 1.5 UTR a year — or fewer than three ratings are logged, so the gap can't be shown to be too big.",
  "out-of-range":
    "Rating below the team's estimated floor, and not projected to reach it by the summer before senior year, planned at no more than 1.5 UTR a year.",
  unverified: "No rating logged yet, so there is nothing to compare with the team's range.",
  locked: "The player has a rating; this plan hides it. The Family plan shows the band.",
};

/** What "floor" and "average" are TODAY (methodology section 1): hand-entered
 *  estimates. When checked-roster ranges (docs/DATA_QUALITY.md, "Second
 *  source") start feeding bands, this sentence and FIT_BAND_RULE change in
 *  the same commit — not before. */
export const FIT_RANGE_RULE =
  "The floor and the average are the team's two estimated numbers from section 1: entered by hand, with no published source or check date, and labelled an unverified estimate wherever they appear.";

// Pixel-exact to DesignSystem.dc.html's ".chip" base + fit-band colors.
export const FIT_BAND_TONE: Record<FitPillState, string> = {
  reach: "bg-[rgb(var(--c-clay-tint-bg))] text-[rgb(var(--c-clay-tint-text))] border-[rgb(var(--c-clay-tint-border))]",
  target: "bg-grass-50 text-grass border-grass-100",
  likely: "bg-[rgb(var(--c-sage-tint-bg))] text-[rgb(var(--c-sage-tint-text))] border-[rgb(var(--c-sage-tint-border))]",
  "out-of-range": "bg-card text-stone border-line",
  unverified: "bg-card text-stone border-line border-dashed",
  locked: "bg-card text-stone border-line border-dashed",
};

// Design polish round 1 (Figma 04b Fit band badges v2): an icon per band so
// it reads at a glance. Reach was an up-right arrow, the near-universal
// "opens a link" icon on a pill that is not a link (2026-11-22 clickable
// audit) — it is a rising line now. Locked is a padlock, not a question
// mark: nothing is unknown, it is hidden.
export const FIT_BAND_ICON: Record<FitPillState, LucideIcon> = {
  likely: Check,
  target: Target,
  reach: TrendingUp,
  "out-of-range": Minus,
  unverified: HelpCircle,
  locked: Lock,
};

export function FitBandIcon({ band, className }: { band: FitPillState; className?: string }) {
  const Icon = FIT_BAND_ICON[band];
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} strokeWidth={2.25} aria-hidden />;
}

export function FitBadge({
  band,
  className,
}: {
  band: FitPillState;
  className?: string;
}) {
  return (
    <span
      title={FIT_BAND_RULE[band]}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs font-semibold",
        FIT_BAND_TONE[band],
        className
      )}
    >
      <FitBandIcon band={band} />
      {FIT_BAND_LABEL[band]}
    </span>
  );
}
