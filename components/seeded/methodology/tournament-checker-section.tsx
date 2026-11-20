import { FIELD_BANDS, LEVELS, NOT_ENOUGH_INFO } from "@/lib/tournament-fit";

// /methodology's "Tournament checker" section. Every number below is read
// from lib/tournament-fit.ts (FIELD_BANDS, LEVELS), so the page cannot drift
// from the rule /tournament-fit and /events actually run. Kept in its own
// file: the projection section of this page is edited separately.

const n = (v: number) => v.toFixed(1);
const { inRange, stretchAbove, easyBelow } = FIELD_BANDS;
const matchesByLevel = LEVELS.filter((l) => l.value !== "utr")
  .map((l) => `${l.value} ${l.typicalMatches}`)
  .join(", ");
const utrMatches = LEVELS.find((l) => l.value === "utr")?.typicalMatches;

export const TOURNAMENT_CHECKER_TOC = { id: "tournament-checker", label: "Tournament checker" } as const;

export function TournamentCheckerMethod() {
  return (
    <>
      <p className="text-stone">
        The tournament checker judges an event from one number you give it: the draw&apos;s average UTR (average
        the ratings on the entry list, or use last year&apos;s draw), compared with your own UTR. Without it, the
        checker says &ldquo;{NOT_ENOUGH_INFO}&rdquo; and gives no verdict. It also needs the level and the entry
        fee.
      </p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-stone">
        <li>
          <span className="font-semibold text-ink">In range</span> &mdash; the draw averages from {n(inRange.below)}{" "}
          below to {n(inRange.above)} above your UTR. Wins here move a rating most. This is the only band that can
          be &ldquo;Worth it&rdquo;.
        </li>
        <li>
          <span className="font-semibold text-ink">A stretch</span> &mdash; more than {n(inRange.above)} and up to{" "}
          {n(stretchAbove)} above you. At best &ldquo;Worth a look&rdquo;.
        </li>
        <li>
          <span className="font-semibold text-ink">A bit easy</span> &mdash; more than {n(inRange.below)} and up to{" "}
          {n(easyBelow)} below you. At best &ldquo;Worth a look&rdquo;.
        </li>
        <li>
          <span className="font-semibold text-ink">Out of range</span> &mdash; more than {n(stretchAbove)} above or{" "}
          {n(easyBelow)} below you. &ldquo;Skip it&rdquo;, however cheap or close.
        </li>
      </ul>
      <p className="text-stone">
        Inside that ceiling, cost per expected match and travel time can pull a verdict down, never up. The level
        does not say how strong the field is &mdash; Seeded has no sourced table of ratings by level, and age
        division and section change it a lot &mdash; so it is used for two things only: how many matches to
        spread the cost over (Seeded&apos;s own working figures, not published ones: {matchesByLevel}, UTR events{" "}
        {utrMatches}), and forgiving long travel for national events (L1&ndash;L3).
      </p>
      <p className="text-stone">
        This is directional guidance. It can&apos;t know who withdraws, the seeding, or how you match up with a
        particular player.
      </p>
    </>
  );
}
