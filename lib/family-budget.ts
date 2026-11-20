// Pure math for /family's "Season budget" card — no React, no Supabase, so
// it's unit-testable and shared verbatim between the Overview page's
// compact summary and the full /family/budget page. Combines TWO real data
// sources into one spend picture:
//   - `tournament_entries` (migration 013) rows with status "entered" or "played" (047) —
//     real tournaments the family actually paid for, fit-scored live via
//     lib/tournament-fit.ts's evaluateTournamentFit. entryCost/travelCost
//     feed the Entries/Travel spend buckets.
//   - `budget_expenses` (migration 015) rows — freeform costs (camps,
//     gear) that aren't a scored tournament. category feeds whichever of
//     the 3 spend buckets it was logged under.
// A third real signal, "Skipped: N bad-fit events," comes from
// tournament_entries rows that are still "saved" (never entered) AND score
// as a "bad" fit — money the family is on track to NOT spend because the
// fit-finder flagged the event, not a guess.
import type { BudgetExpense, BudgetExpenseCategory } from "@/lib/db/family";
import type { TournamentEntry } from "@/lib/db/events";
import { isCommittedStatus } from "@/lib/tournament-status";
import type { FamilyRole } from "@/lib/types";
import { checkTournamentFit, type FitResult, type Verdict } from "@/lib/tournament-fit";

/** Only a parent can write season_budgets/budget_expenses — migration
 * 019_rls_policy_hardening.sql tightens the RLS to match. Centralized here
 * (rather than inlined as `role === "parent"` at each call site) so
 * season-budget-card.tsx's edit affordances and the RLS policy they mirror
 * can never quietly drift apart. */
export function canEditBudget(role: FamilyRole): boolean {
  return role === "parent";
}

export type BudgetLineChip = Verdict | BudgetExpenseCategory;

export interface BudgetLineItem {
  id: string;
  date: string; // ISO yyyy-mm-dd
  label: string;
  cost: number;
  chip: BudgetLineChip;
}

export interface SeasonBudgetSummary {
  totalBudget: number;
  spent: number;
  remaining: number;
  entriesSpent: number;
  travelSpent: number;
  campsSpent: number;
  /** Soonest-first within "entered" tournaments + logged expenses, newest
   * overall first (table reads top-down like a statement). */
  lineItems: BudgetLineItem[];
  skippedBadFitCount: number;
  skippedBadFitSaved: number;
}

function entryTotalCost(entry: TournamentEntry): number {
  return Math.max(0, entry.entryCost ?? 0) + Math.max(0, entry.travelCost ?? 0);
}

function entryLabel(entry: TournamentEntry): string {
  const parts: string[] = [];
  if (entry.entryCost != null) parts.push("entry");
  if (entry.travelCost != null) parts.push("travel");
  const suffix = parts.length ? ` · ${parts.join(" + ")}` : "";
  return `${entry.name}${suffix}`;
}

export function buildSeasonBudgetSummary(args: {
  totalBudget: number;
  /** NULL when the player has no recorded UTR. Every fit verdict below is
   * computed FROM the UTR, so without one there is no honest verdict to
   * show: the line item falls back to its plain "entries" category chip and
   * the bad-fit rollup stays at zero. Previously /family passed a
   * placeholder number, which produced real-looking "bad fit" chips for a
   * rating nobody had entered. */
  playerUtr: number | null;
  entries: TournamentEntry[];
  expenses: BudgetExpense[];
  /** Whose rating `playerUtr` is. The budget's entries span every player in
   * the family; only this player's are judged against this rating. A
   * sibling's entry still counts toward spend and shows its plain category
   * chip — judging it against someone else's UTR would be a verdict about
   * the wrong child. Omitted = judge every entry (single-player callers). */
  judgedUserId?: string | null;
}): SeasonBudgetSummary {
  const { totalBudget, playerUtr, entries, expenses, judgedUserId } = args;

  let entriesSpent = 0;
  let travelSpent = 0;
  let campsSpent = 0;
  const lineItems: BudgetLineItem[] = [];

  for (const entry of entries) {
    // Entered or played: both are money the family paid (047 added played).
    if (!isCommittedStatus(entry.status)) continue;
    const judged = judgedUserId == null || entry.userId === judgedUserId;
    // No verdict without a UTR, a fee AND the draw's average UTR — the
    // line then shows its plain "entries" chip (checkTournamentFit → null).
    const fit =
      playerUtr == null || !judged
        ? null
        : checkTournamentFit({
            name: entry.name,
            level: entry.level,
            playerUtr,
            goalUtr: entry.goalUtr,
            drawUtr: entry.drawUtr,
            travelHours: entry.travelHours,
            distanceMiles: entry.distanceMiles,
            entryCost: entry.entryCost,
            travelCost: entry.travelCost,
          });
    entriesSpent += Math.max(0, entry.entryCost ?? 0);
    travelSpent += Math.max(0, entry.travelCost ?? 0);
    lineItems.push({
      id: entry.id,
      date: entry.eventDate,
      label: entryLabel(entry),
      cost: entryTotalCost(entry),
      chip: fit ? fit.verdict : "entries",
    });
  }

  for (const expense of expenses) {
    const amount = Math.max(0, expense.amount);
    if (expense.category === "entries") entriesSpent += amount;
    else if (expense.category === "travel") travelSpent += amount;
    else campsSpent += amount;
    lineItems.push({
      id: expense.id,
      date: expense.expenseDate,
      label: expense.label,
      cost: amount,
      chip: expense.category,
    });
  }

  lineItems.sort((a, b) => b.date.localeCompare(a.date));

  const spent = entriesSpent + travelSpent + campsSpent;

  let skippedBadFitCount = 0;
  let skippedBadFitSaved = 0;
  for (const entry of entries) {
    if (entry.status !== "saved") continue;
    if (playerUtr == null) continue;
    if (judgedUserId != null && entry.userId !== judgedUserId) continue;
    const fit = checkTournamentFit({
      name: entry.name,
      level: entry.level,
      playerUtr,
      goalUtr: entry.goalUtr,
      drawUtr: entry.drawUtr,
      travelHours: entry.travelHours,
      distanceMiles: entry.distanceMiles,
      entryCost: entry.entryCost,
      travelCost: entry.travelCost,
    });
    if (fit?.verdict === "bad") {
      skippedBadFitCount += 1;
      skippedBadFitSaved += entryTotalCost(entry);
    }
  }

  return {
    totalBudget,
    spent,
    remaining: totalBudget - spent,
    entriesSpent,
    travelSpent,
    campsSpent,
    lineItems,
    skippedBadFitCount,
    skippedBadFitSaved,
  };
}

export interface PendingSkipDecision {
  entry: TournamentEntry;
  fit: FitResult;
  wouldSave: number;
}

/** Real, saved-but-not-entered tournaments that score as a "bad" fit —
 * the same rows buildSeasonBudgetSummary() aggregates into "Skipped: N
 * bad-fit events," surfaced individually (soonest first) so /family's
 * "Needs a parent decision" card can offer a real "Skip {event}?" per
 * event instead of just the rollup. There is no real "coach invited to a
 * camp" signal anywhere in this app (no camp-invite data model exists), so
 * this is the only real decision type that card shows. */
export function pendingSkipDecisions(
  entries: TournamentEntry[],
  playerUtr: number | null,
  /** Only this player's saved entries are judged against `playerUtr`. */
  judgedUserId?: string | null
): PendingSkipDecision[] {
  if (playerUtr == null) return [];
  const decisions: PendingSkipDecision[] = [];
  for (const entry of entries) {
    // Only Planning rows are still a decision; Entered and Played are paid.
    if (entry.status !== "saved") continue;
    if (judgedUserId != null && entry.userId !== judgedUserId) continue;
    // A row with no draw average (or no fee) has no verdict — it is never
    // offered as a "skip it" decision on a guess.
    const fit = checkTournamentFit({
      name: entry.name,
      level: entry.level,
      playerUtr,
      goalUtr: entry.goalUtr,
      drawUtr: entry.drawUtr,
      travelHours: entry.travelHours,
      distanceMiles: entry.distanceMiles,
      entryCost: entry.entryCost,
      travelCost: entry.travelCost,
    });
    if (fit?.verdict === "bad") decisions.push({ entry, fit, wouldSave: entryTotalCost(entry) });
  }
  return decisions.sort((a, b) => a.entry.eventDate.localeCompare(b.entry.eventDate));
}

/** Short, real (derived-from-the-actual-score-breakdown) phrase for why a
 * saved-but-not-entered tournament scored "bad" — used by /family's "Needs
 * a parent decision" card instead of dumping the full reasons list inline.
 * Picks whichever of the 3 weighted factors is the clearest drag on the
 * score, cost/competition/travel in that priority order when more than one
 * is weak, since a family reads "too expensive" before "field mismatch" as
 * the more actionable flag. */
export function shortBadFitReason(fit: FitResult): string {
  if (fit.costScore <= 40) return "Costly for the matches it likely offers.";
  // The field band decides it, not a regex over the reason text.
  if (fit.fieldBand === "too-weak") return "Field too weak.";
  if (fit.fieldBand === "too-strong") return "Field too strong.";
  if (fit.competitionScore <= 40) return fit.fieldGap < 0 ? "Field too weak." : "Field too strong.";
  if (fit.travelScore <= 40) return "Too much travel for the return.";
  return "Doesn't score as a good fit right now.";
}
