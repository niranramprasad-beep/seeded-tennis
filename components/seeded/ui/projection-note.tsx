import type { RecruitingTimeUtr } from "@/lib/fit";
import { paceUpsideSentence, projectionTargetLabel } from "@/lib/fit";
import { EARLY_DECISION_NOTE } from "@/lib/config/growth";
import { DataNote, EstimateChip } from "@/components/seeded/ui/data-note";
import { cn, formatUtrEstimate } from "@/lib/utils";

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
  after,
  withEarlyDecisionNote = false,
}: {
  utr: RecruitingTimeUtr | null | undefined;
  /** "Avery" on a parent's screen; omitted means "your". */
  who?: string | null;
  className?: string;
  /** A second short sentence about the same card's data, so the card still
   *  carries ONE note (rule 2) — e.g. the team-range caveat under a table. */
  after?: string;
  /**
   * Adds "Top D1 programs often decide earlier, during junior year." ONE
   * screen passes this: the /schools list (C16, 2026-11-18). It used to
   * ride along on every ProjectionNote — Today, Plan, the school page,
   * /family — four times in one session. Niran's 2026-11-16 call that the
   * line exists is kept; it now exists once, where a player picks schools.
   */
  withEarlyDecisionNote?: boolean;
}) {
  if (!utr?.isProjected) return null;
  const whose = who ? `${who}'s` : "your";
  // Design system v2, rule 2: one calm data note — the dashed Estimate
  // chip, one sentence, and "About our data". The growth assumption used to
  // be spelled out here too; it lives in /methodology and beside the what-if
  // slider, where it is the subject rather than a caveat on every screen.
  return (
    <DataNote className={className}>
      <EstimateChip className="mr-1.5" />
      Bands use {whose} estimated UTR for {projectionTargetLabel(utr.year)}, the summer before senior year:{" "}
      <span className="font-mono tabular-nums text-ink">{formatUtrEstimate(utr.value)}</span>.
      {withEarlyDecisionNote ? ` ${EARLY_DECISION_NOTE}` : null}
      {after ? ` ${after}` : null}
    </DataNote>
  );
}

/** "You (est. summer 2030)" / "Avery (est. summer 2030)" — the label beside a
 *  projected number on a range bar, so it is never read as today's. */
export function projectedYouLabel(utr: RecruitingTimeUtr | null | undefined, who?: string | null): string {
  const name = who ?? "You";
  return utr?.isProjected ? `${name} (est. ${projectionTargetLabel(utr.year)})` : name;
}

/**
 * The upside, said once beside the plan: "At your current pace you'd reach
 * 9.40, but we plan with 8.10. We plan with at most 1.5 UTR a year. That's
 * our planning rule, not a measured average."
 * Renders nothing unless the player's own pace is faster than the planning
 * cap (lib/fit.ts paceUpsideSentence) — it is shown, never banded.
 */
export function PaceUpsideNote({
  utr,
  who,
  className,
  withLink = false,
}: {
  utr: RecruitingTimeUtr | null | undefined;
  who?: string | null;
  className?: string;
  /** Render as the card's ONE data note (rule 2): info icon + "About our
   *  data" — /today's chart card, where this sentence replaces the caption. */
  withLink?: boolean;
}) {
  const sentence = paceUpsideSentence(utr, who);
  if (!sentence) return null;
  if (withLink) {
    return (
      <DataNote className={className}>
        <EstimateChip className="mr-1.5" />
        {sentence}
      </DataNote>
    );
  }
  return (
    <p className={cn("text-[15px] leading-relaxed text-stone", className)}>
      <EstimateChip className="mr-1.5" />
      {sentence}
    </p>
  );
}
