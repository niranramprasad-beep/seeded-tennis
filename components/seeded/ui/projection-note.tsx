import type { RecruitingTimeUtr } from "@/lib/fit";
import { projectionTargetLabel } from "@/lib/fit";
import { EARLY_DECISION_NOTE, GROWTH_ESTIMATE_CHIP } from "@/lib/config/growth";
import { cn } from "@/lib/utils";

/**
 * The one sentence every screen shows when its bands come from the
 * PROJECTED rating rather than today's: which rating, for when, on what
 * assumption — and that top programs decide before then.
 *
 * Before this, /schools printed the projection as plain "You 11.7" for a
 * player whose UTR is 8.7, and /today, /plan and /family banded schools on
 * it without saying so. Renders nothing when the bands use today's rating.
 */
export function ProjectionNote({
  utr,
  who,
  className,
}: {
  utr: RecruitingTimeUtr | null | undefined;
  /** "Avery" on a parent's screen; omitted means "your". */
  who?: string | null;
  className?: string;
}) {
  if (!utr?.isProjected) return null;
  const whose = who ? `${who}'s` : "your";
  return (
    <p className={cn("text-sm text-stone", className)}>
      <span className="mr-1.5 inline-flex items-center rounded-pill border border-[rgb(var(--c-gold-tint-border))] bg-[rgb(var(--c-gold-tint-bg))] px-2 py-0.5 text-xs font-semibold text-[rgb(var(--c-gold-tint-text))]">
        {GROWTH_ESTIMATE_CHIP}
      </span>
      Bands use {whose} projected UTR for {projectionTargetLabel(utr.year)} (the summer before senior
      year): <span className="font-mono tabular-nums text-ink">{utr.value.toFixed(1)}</span>.{" "}
      {utr.assumption} {EARLY_DECISION_NOTE}
    </p>
  );
}

/** "You (est. summer 2030)" / "Avery (est. summer 2030)" — the label beside a
 *  projected number on a range bar, so it is never read as today's. */
export function projectedYouLabel(utr: RecruitingTimeUtr | null | undefined, who?: string | null): string {
  const name = who ?? "You";
  return utr?.isProjected ? `${name} (est. ${projectionTargetLabel(utr.year)})` : name;
}
