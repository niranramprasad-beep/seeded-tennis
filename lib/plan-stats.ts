// Pure math for /plan's profile stat tiles and checklist — no React, no
// Supabase. Every number here traces back to a real logged entry; nothing
// is fabricated when history is thin, callers get `null` instead of a
// guessed value.
import type { UtrEntry } from "@/lib/db/plan";
import type { MatchRecord } from "@/lib/db/events";

const MS_PER_DAY = 86_400_000;

export interface UtrDeltaWithBaseline {
  delta: number;
  /** The real logged entry used as the comparison point — e.g. /family's
   * "+0.51 since May" reads its month straight from this, rather than
   * repeating utrDeltaOverMonths' own cutoff/sort logic a second time. */
  baselineDate: string;
}

/**
 * Same real "latest entry minus the most recent entry at/before the
 * cutoff" comparison as utrDeltaOverMonths, but also returns which real
 * entry was used as the baseline. Returns null under the same condition
 * (no entry old enough to compare against).
 */
export function utrDeltaWithBaseline(
  entries: UtrEntry[],
  months: number,
  now: Date = new Date()
): UtrDeltaWithBaseline | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const cutoff = now.getTime() - months * 30 * MS_PER_DAY;
  const baseline = [...sorted].reverse().find((e) => new Date(e.recordedAt).getTime() <= cutoff);
  if (!baseline) return null;
  return {
    delta: Math.round((latest.utr - baseline.utr) * 100) / 100,
    baselineDate: baseline.recordedAt,
  };
}

/**
 * UTR change over the last `months`: latest entry minus the most recent
 * entry recorded at or before the cutoff. Returns null when there's no
 * entry old enough to compare against (not enough history yet) rather than
 * inventing a delta from a shorter window.
 */
export function utrDeltaOverMonths(
  entries: UtrEntry[],
  months: number,
  now: Date = new Date()
): number | null {
  return utrDeltaWithBaseline(entries, months, now)?.delta ?? null;
}

export interface WinLossRecord {
  wins: number;
  losses: number;
}

/** Counts real logged wins/losses. Matches with no result yet don't count either way. */
export function winLossRecord(matches: MatchRecord[]): WinLossRecord {
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    if (m.result === "win") wins++;
    else if (m.result === "loss") losses++;
  }
  return { wins, losses };
}

export interface ChecklistItem {
  id: string;
  label: string;
  /** Real, computed boolean — never a guess. */
  done: boolean;
}

/**
 * Only the checklist items with a real, computable boolean behind them.
 * The mockup's "Highlight video," "NCAA Eligibility Center," and "Plan
 * spring events" have no corresponding app state, so they aren't rendered
 * as checkboxes at all — faking a checked state would be worse than
 * leaving them out.
 */
export function buildPlanChecklist(
  targetSchoolCount: number,
  contactedOrRepliedCount: number
): ChecklistItem[] {
  return [
    {
      id: "save-schools",
      label: `Save 10+ schools across 3 bands`,
      done: targetSchoolCount >= 10,
    },
    {
      id: "email-coaches",
      label: `Email 8 target coaches · ${contactedOrRepliedCount} sent`,
      done: contactedOrRepliedCount >= 8,
    },
  ];
}
