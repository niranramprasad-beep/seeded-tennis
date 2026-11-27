import type { RecruitingTimeUtr } from "@/lib/fit";
import { projectionTargetLabel } from "@/lib/fit";
import { EARLY_DECISION_NOTE } from "@/lib/config/growth";
import { DataNote, EstimateChip } from "@/components/seeded/ui/data-note";
import { formatPlayerUtr, formatUtrEstimate } from "@/lib/utils";

/**
 * The one sentence every screen shows when its fit comes from the player's
 * Plan UTR or the PROJECTED rating rather than today's: which rating, for
 * when — and that top programs decide before then.
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
  const whose = who ? `${who}'s` : "your";
  // Judged on the player's own Plan UTR (2026-11-27): say so, with the
  // number exactly as they saved it — it is theirs, not an estimate.
  if (utr?.source === "plan") {
    return (
      <DataNote className={className}>
        Fit uses {whose} plan UTR for {projectionTargetLabel(utr.year)}, the summer before senior year:{" "}
        <span className="font-mono tabular-nums text-ink">{formatPlayerUtr(utr.value)}</span>.
        {withEarlyDecisionNote ? ` ${EARLY_DECISION_NOTE}` : null}
        {after ? ` ${after}` : null}
      </DataNote>
    );
  }
  if (!utr?.isProjected) return null;
  // Design system v2, rule 2: one calm data note — the dashed Estimate
  // chip, one sentence, and "About our data". The growth assumption lives
  // in /methodology, where it is the subject rather than a caveat on every
  // screen.
  return (
    <DataNote className={className}>
      <EstimateChip className="mr-1.5" />
      Fit uses {whose} estimated UTR for {projectionTargetLabel(utr.year)}, the summer before senior year:{" "}
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
