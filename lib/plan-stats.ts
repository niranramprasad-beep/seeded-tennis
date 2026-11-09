// Pure math for /plan's profile stat tiles and checklist — no React, no
// Supabase. Every number here traces back to a real logged entry; nothing
// is fabricated when history is thin, callers get `null` instead of a
// guessed value.
import type { UtrEntry } from "@/lib/supabase/utr";
import type { MatchRecord } from "@/lib/supabase/features";

const MS_PER_DAY = 86_400_000;

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
  if (entries.length === 0) return null;
  const sorted = [...entries].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const cutoff = now.getTime() - months * 30 * MS_PER_DAY;
  const baseline = [...sorted].reverse().find((e) => new Date(e.recordedAt).getTime() <= cutoff);
  if (!baseline) return null;
  return Math.round((latest.utr - baseline.utr) * 100) / 100;
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
