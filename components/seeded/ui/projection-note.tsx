import type { RecruitingTimeUtr } from "@/lib/fit";
import { projectionTargetLabel } from "@/lib/fit";
import { EARLY_DECISION_NOTE } from "@/lib/config/growth";
import { DataNote, EstimateChip } from "@/components/seeded/ui/data-note";

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
}: {
  utr: RecruitingTimeUtr | null | undefined;
  /** "Avery" on a parent's screen; omitted means "your". */
  who?: string | null;
  className?: string;
  /** A second short sentence about the same card's data, so the card still
   *  carries ONE note (rule 2) — e.g. the team-range caveat under a table. */
  after?: string;
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
      <span className="font-mono tabular-nums text-ink">{utr.value.toFixed(1)}</span>. {EARLY_DECISION_NOTE}
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
