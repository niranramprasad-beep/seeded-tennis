// Honest words for a count that is still zero (final-check PR B, A9/A10/A11/B7).
//
// A zero printed as if it were a result reads like one: a green "On track for
// 0 of 3 targets" pill, a "0–0 logged record", "0 emailed · 0 replied · 0
// follow-ups due". None of those is false, but each presents "nothing logged
// yet" as an outcome. These helpers say what is missing instead, and every
// screen that prints one of these lines takes it from here. Pure, so the
// rules are unit-tested (empty-state-copy.test.ts).

import { plural } from "@/lib/utils";

/** The Today pill beside the UTR chip. Green only when at least one target
 *  really is on track; with none it is a neutral, plain statement. */
export function onTrackPill(
  onTrack: number,
  targets: number,
  /** True when the tiers were judged on the player's Plan UTR: then the pill
   *  says so, because "on track" would read as a claim about their real
   *  progress (verifier MEDIUM, 2026-11-27). */
  onPlan = false
): { text: string; tone: "good" | "neutral" } | null {
  if (targets <= 0) return null;
  if (onPlan) {
    return onTrack <= 0
      ? { text: targets === 1 ? "Your target isn't in range at your plan UTR" : `None of your ${targets} targets in range at your plan UTR`, tone: "neutral" }
      : { text: `${onTrack} of ${plural(targets, "target", "targets")} in range at your plan UTR`, tone: "good" };
  }
  if (onTrack <= 0) {
    return {
      text: targets === 1 ? "Your target isn't on track yet" : `None of your ${targets} targets on track yet`,
      tone: "neutral",
    };
  }
  return { text: `On track for ${onTrack} of ${plural(targets, "target", "targets")}`, tone: "good" };
}

/** Today's "Done this week" line. */
export function doneThisWeekLine(matchesThisWeek: number): string {
  return matchesThisWeek > 0
    ? `Done this week: logged ${plural(matchesThisWeek, "match", "matches")}`
    : "Done this week: no matches logged yet";
}

/** Plan's record tile. "Not tracked" until a win or a loss is logged — a
 *  "0–0" is not a record. */
export function recordTile(record: { wins: number; losses: number } | null): { value: string; label: string } {
  if (!record || record.wins + record.losses === 0) {
    return { value: "Not tracked", label: "logged record · log a result to start it" };
  }
  return { value: `${record.wins}–${record.losses}`, label: "logged record" };
}

/** The line under the Outreach heading. Until a first email is marked sent
 *  (`contacted` = every program past "Researching", offers and commitments
 *  included) it says so, instead of three zeros. */
export function outreachSummaryLine(c: {
  programs: number;
  contacted: number;
  emailed: number;
  replied: number;
  due: number;
}): string {
  const programs = plural(c.programs, "program", "programs");
  if (c.programs <= 0) return "No target programs yet";
  if (c.contacted <= 0) {
    return `${programs} · no emails marked sent yet`;
  }
  return `${programs} · ${c.emailed} emailed · ${c.replied} replied · ${plural(c.due, "follow-up", "follow-ups")} due this week`;
}
