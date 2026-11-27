// Everything /family's overview (Board 22) says, as plain functions.
//
// No React, no Supabase. The page loads the child's real rows, builds the
// one fit report through useFitReport(), and hands both here; this module
// turns them into the sentences, numbers and bars the screen prints. Two
// reasons it is a module and not component code:
//
//   1. Every sentence on this page is a claim to a parent about their child
//      ("All 3 are Target or Likely", "Gear is $60 over"). Each one is
//      pinned by lib/parent-dashboard.test.ts against the counts it came
//      from, so the words cannot drift from the numbers.
//   2. The paywall's "Example" preview runs the same builders over sample
//      rows, so the preview is the real layout rather than a drawing of it.
//
// Projection numbers come from lib/fit.ts only (recruitingTimeUtr,
// projectionPath, projectionReachDate). Nothing here multiplies a growth
// rate.

import type { FitReport } from "@/lib/fit";
import { utrChange } from "@/lib/utr-percent";
import {
  projectionPath,
  projectionReachDate,
  projectionTargetDate,
  projectionTargetLabel,
  recruitingTimeUtr,
  utrHistoryFromEntries,
  type ProjectionSubject,
  type RecruitingTimeUtr,
  type RecruitingUtrSource,
} from "@/lib/fit";
import type { SchoolFitBand } from "@/lib/school-fit";
import type { SeasonBudgetSummary } from "@/lib/family-budget";
import type { BudgetExpense, BudgetExpenseCategory } from "@/lib/db/family";
import type { TournamentEntry } from "@/lib/db/events";
import { isCommittedStatus } from "@/lib/tournament-status";
import type { PlayerGender, SchoolLite } from "@/lib/types";
import { encodeTournamentFitShareParams, type TravelPill } from "@/lib/tournament-fit-share";
import { formatShortDate, localDateKey, parseLocalDate, startOfLocalDay } from "@/lib/time";
import { formatPlayerUtr, formatUtrEstimate, hasRealUtr } from "@/lib/utils";
import { DEFAULT_GROWTH_LABEL } from "@/lib/config/growth";

const MS_PER_DAY = 86_400_000;
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "$2,460" — whole dollars, the way the budget is entered. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    Math.round(value)
  );
}


function monthYear(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/* ------------------------------------------------------------- budget */

/** A bar turns amber at 90% of its limit and red past it. */
const NEAR_LIMIT_RATIO = 0.9;

export type BudgetStatus = "normal" | "near" | "over";

export function budgetStatus(spent: number, limit: number): BudgetStatus {
  if (spent > limit) return "over";
  if (spent >= limit * NEAR_LIMIT_RATIO) return "near";
  return "normal";
}

const BUDGET_CATEGORY_LABEL: Record<BudgetExpenseCategory, string> = {
  entries: "Entries",
  travel: "Travel",
  camps: "Camps",
};

export interface BudgetBar {
  key: string;
  label: string;
  spent: number;
  /** The limit this bar is judged against. Null = no limit of its own, so
   *  no status: the bar shows its share of the season total and nothing
   *  more. Today every category is null — `season_budgets` holds one total
   *  per family, not one per category (see docs/DECISIONS.md, PR B). */
  limit: number | null;
  status: BudgetStatus | null;
  /** 0–100, for the bar's fill. */
  widthPct: number;
  /** Rounded percent of the limit used, or null with no limit. */
  usedPct: number | null;
  left: number | null;
  overBy: number | null;
}

export function budgetBar(args: {
  key: string;
  label: string;
  spent: number;
  limit: number | null;
  /** What the fill is measured against when there is no limit. */
  scale?: number;
}): BudgetBar {
  const spent = Math.max(0, args.spent);
  const limit = args.limit != null && args.limit > 0 ? args.limit : null;
  const denom = limit ?? (args.scale && args.scale > 0 ? args.scale : 0);
  const widthPct = denom > 0 ? Math.min(100, (spent / denom) * 100) : 0;
  if (limit == null) {
    return { key: args.key, label: args.label, spent, limit: null, status: null, widthPct, usedPct: null, left: null, overBy: null };
  }
  return {
    key: args.key,
    label: args.label,
    spent,
    limit,
    status: budgetStatus(spent, limit),
    widthPct,
    usedPct: Math.round((spent / limit) * 100),
    left: Math.max(0, limit - spent),
    overBy: Math.max(0, spent - limit),
  };
}

export interface BudgetMessage {
  tone: "over" | "near";
  text: string;
}

/**
 * The one calm sentence under the bars. Says where the money went over and
 * where some is left — never only that something is wrong. Null when
 * nothing is near or over.
 *
 *   "Gear is $60 over. Lessons has $380 left, so the season total is still
 *    under budget."
 */
export function budgetMessage(total: BudgetBar, categories: BudgetBar[]): BudgetMessage | null {
  if (total.limit == null) return null;
  const over = categories.filter((c) => c.status === "over");
  const withRoom = categories
    .filter((c) => c.limit != null && (c.left ?? 0) > 0)
    .sort((a, b) => (b.left ?? 0) - (a.left ?? 0));
  const totalOver = total.status === "over";

  if (over.length > 0) {
    const first = `${joinAnd(over.map((c) => `${c.label} is ${formatMoney(c.overBy ?? 0)} over`))}.`;
    const room = withRoom[0];
    if (room) {
      const tail = totalOver
        ? `, but the season total is ${formatMoney(total.overBy ?? 0)} over.`
        : ", so the season total is still under budget.";
      return { tone: "over", text: `${first} ${room.label} has ${formatMoney(room.left ?? 0)} left${tail}` };
    }
    return {
      tone: "over",
      text: totalOver
        ? `${first} The season total is ${formatMoney(total.overBy ?? 0)} over.`
        : `${first} The season total is still under budget.`,
    };
  }

  if (totalOver) {
    const biggest = [...categories].sort((a, b) => b.spent - a.spent)[0];
    const where = biggest && biggest.spent > 0 ? ` ${biggest.label} is the biggest cost so far, at ${formatMoney(biggest.spent)}.` : "";
    return { tone: "over", text: `The season total is ${formatMoney(total.overBy ?? 0)} over budget.${where}` };
  }

  if (total.status === "near") {
    return {
      tone: "near",
      text: `${total.usedPct}% of the season budget is used. ${formatMoney(total.left ?? 0)} is left.`,
    };
  }
  return null;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export interface SeasonBudgetView {
  hasBudget: boolean;
  total: BudgetBar;
  categories: BudgetBar[];
  message: BudgetMessage | null;
}

export function seasonBudgetView(
  summary: Pick<SeasonBudgetSummary, "totalBudget" | "spent" | "entriesSpent" | "travelSpent" | "campsSpent">,
  categoryLimits: Partial<Record<BudgetExpenseCategory, number>> = {}
): SeasonBudgetView {
  const hasBudget = summary.totalBudget > 0;
  const total = budgetBar({ key: "total", label: "Season total", spent: summary.spent, limit: hasBudget ? summary.totalBudget : null });
  const spentBy: Record<BudgetExpenseCategory, number> = {
    entries: summary.entriesSpent,
    travel: summary.travelSpent,
    camps: summary.campsSpent,
  };
  const categories = (Object.keys(BUDGET_CATEGORY_LABEL) as BudgetExpenseCategory[]).map((key) =>
    budgetBar({
      key,
      label: BUDGET_CATEGORY_LABEL[key],
      spent: spentBy[key],
      limit: categoryLimits[key] ?? null,
      scale: summary.totalBudget,
    })
  );
  return { hasBudget, total, categories, message: hasBudget ? budgetMessage(total, categories) : null };
}

/* ---------------------------------------------------------------- KPIs */

export interface UtrKpi {
  hasUtr: boolean;
  /** "7.45" or "No UTR yet" — never a number nobody entered. */
  value: string;
  delta: number | null;
  /** "+0.50 since February" */
  deltaText: string | null;
  /** The two halves of deltaText, for a screen that sets the number in mono:
   *  "+0.50" / "February". */
  deltaAmount: string | null;
  /** "+5.6%", shown LEADING with deltaAmount beside it as secondary text
   *  (never instead of it); null when flat or either rating is not a real
   *  logged one. */
  deltaPercent?: string | null;
  since: string | null;
  direction: "up" | "down" | "flat" | null;
}

/**
 * The UTR tile. The delta is the newest logged rating minus a logged
 * baseline: the newest one at least six months old, or failing that the
 * oldest one logged. Both are real rows; with fewer than two there is no
 * delta at all.
 */
export function utrKpi(
  entries: { utr: number; recordedAt: string }[],
  currentUtr: number | null,
  now: Date
): UtrKpi {
  if (!hasRealUtr(currentUtr)) {
    return { hasUtr: false, value: "No UTR yet", delta: null, deltaText: null, deltaAmount: null, since: null, direction: null };
  }
  const value = formatPlayerUtr(currentUtr);
  const sorted = entries
    .map((e) => ({ utr: e.utr, date: parseLocalDate(e.recordedAt) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const none: UtrKpi = { hasUtr: true, value, delta: null, deltaText: null, deltaAmount: null, since: null, direction: null };
  if (sorted.length < 2) return none;

  const latest = sorted[sorted.length - 1];
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
  const baseline =
    [...sorted].reverse().find((e) => e.date.getTime() <= cutoff.getTime()) ??
    (sorted[0].date.getTime() < latest.date.getTime() ? sorted[0] : null);
  if (!baseline) return none;

  // lib/utr-percent.ts is the one helper for a change: the same rounding
  // and sign everywhere, and no percent of a non-rating.
  const change = utrChange(baseline.utr, latest.utr);
  if (!change) return none;
  const delta = Math.round((latest.utr - baseline.utr) * 100) / 100;
  const monthsAgo = (now.getFullYear() - baseline.date.getFullYear()) * 12 + now.getMonth() - baseline.date.getMonth();
  const since = monthsAgo <= 11 ? MONTHS[baseline.date.getMonth()] : monthYear(baseline.date);
  const direction = change.direction;
  const deltaAmount = direction === "flat" ? "No change" : change.amount;
  const deltaPercent = change.percent;
  // The sentence form leads with the percent, like the tile does.
  const lead = deltaPercent ? `${deltaPercent} (${deltaAmount})` : deltaAmount;
  return { hasUtr: true, value, delta, deltaText: `${lead} since ${since}`, deltaAmount, deltaPercent, since, direction };
}

export interface TargetSchoolsKpi {
  value: string;
  sentence: string;
}

/** A true sentence from the fit report's own counts ("inRange" = Target +
 *  Likely, the product's one definition — lib/fit.ts). */
export function targetSchoolsKpi(report: Pick<FitReport, "inRange"> | null, targetCount: number): TargetSchoolsKpi {
  const value = String(targetCount);
  if (targetCount === 0) return { value, sentence: "No target schools saved yet." };
  if (!report) return { value, sentence: "No UTR yet, so no fit." };
  const n = report.inRange;
  if (n === targetCount) {
    return {
      value,
      sentence:
        targetCount === 1
          ? "It's in range: a Good match or Safe bet."
          : targetCount === 2
            ? "Both are in range."
            : `All ${targetCount} are in range.`,
    };
  }
  if (n === 0) {
    return {
      value,
      sentence: targetCount === 1 ? "It's not in range yet." : `None of the ${targetCount} are in range yet.`,
    };
  }
  return { value, sentence: `${n} of ${targetCount} ${n === 1 ? "is" : "are"} in range.` };
}

export interface SeasonSpendKpi {
  value: string;
  detail: string;
  status: BudgetStatus | null;
}

export function seasonSpendKpi(budget: SeasonBudgetView): SeasonSpendKpi {
  const { total } = budget;
  if (!budget.hasBudget || total.limit == null) {
    return { value: formatMoney(total.spent), detail: "No season budget set yet", status: null };
  }
  return {
    value: formatMoney(total.spent),
    detail: `of ${formatMoney(total.limit)} · ${total.usedPct}% used`,
    status: total.status,
  };
}

export interface NextEvent {
  id: string;
  name: string;
  /** "Sat, Dec 6" */
  dateLabel: string;
  /** "Rockville, MD", or "" when no place was entered. */
  place: string;
  daysAway: number;
  entry: TournamentEntry;
}

/** The soonest event on or after today (local), from the child's own
 *  tournament_entries — saved or entered. */
export function nextEvent(entries: TournamentEntry[], now: Date): NextEvent | null {
  const today = localDateKey(now);
  const next = [...entries]
    .filter((e) => e.eventDate.slice(0, 10) >= today)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate))[0];
  if (!next) return null;
  const date = parseLocalDate(next.eventDate.slice(0, 10));
  const startOfToday = parseLocalDate(today);
  return {
    id: next.id,
    name: next.name,
    dateLabel: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    place: [next.city, next.state].map((s) => (s ?? "").trim()).filter(Boolean).join(", "),
    daysAway: Math.round((date.getTime() - startOfToday.getTime()) / MS_PER_DAY),
    entry: next,
  };
}

function travelPillFor(hours: number | null): TravelPill {
  if (hours == null || hours <= 1) return "local";
  if (hours <= 3.5) return "short";
  return "overnight";
}

/** A /tournament-fit link with the event already filled in. */
export function tournamentCheckHref(entry: TournamentEntry, playerUtr: number | null): string {
  const params = encodeTournamentFitShareParams({
    name: entry.name,
    level: entry.level,
    playerUtr: hasRealUtr(playerUtr) ? playerUtr : null,
    travel: travelPillFor(entry.travelHours),
    entryCost: entry.entryCost,
    travelCost: entry.travelCost,
    // The verdict needs it (D5) — without it the link opened on "Not enough info".
    drawUtr: entry.drawUtr,
  });
  return `/tournament-fit?${params.toString()}`;
}

/* ---------------------------------------------------- recent expenses */

export interface ExpenseRow {
  id: string;
  dateLabel: string;
  item: string;
  category: string;
  amount: string;
}

/** The newest `limit` rows of the season statement: entered tournaments
 *  and logged expenses, newest first. */
export function recentExpenses(
  entries: Pick<TournamentEntry, "id" | "name" | "status" | "entryCost" | "travelCost" | "eventDate">[],
  expenses: Pick<BudgetExpense, "id" | "label" | "category" | "amount" | "expenseDate">[],
  limit = 5
): ExpenseRow[] {
  const rows = [
    ...entries
      .filter((e) => isCommittedStatus(e.status))
      .map((e) => ({
        id: e.id,
        date: e.eventDate.slice(0, 10),
        item: e.name,
        category: "Tournament",
        amount: Math.max(0, e.entryCost ?? 0) + Math.max(0, e.travelCost ?? 0),
      })),
    ...expenses.map((x) => ({
      id: x.id,
      date: x.expenseDate.slice(0, 10),
      item: x.label,
      category: BUDGET_CATEGORY_LABEL[x.category] ?? "Other",
      amount: Math.max(0, x.amount),
    })),
  ];
  return rows
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((r) => ({ id: r.id, dateLabel: formatShortDate(r.date), item: r.item, category: r.category, amount: formatMoney(r.amount) }));
}

/* --------------------------------------------------- for you this week */

/** True when this week's report has something in it: a rating logged, a
 *  coach row touched, money logged in the last 7 days, or an event within
 *  7 days either side. The report is built live from the same rows. */
export function weeklyReportHasNews(input: {
  utrEntries: { recordedAt: string }[];
  outreachUpdatedAt: string[];
  expenses: { expenseDate: string }[];
  entries: { eventDate: string }[];
  now: Date;
}): boolean {
  const { now } = input;
  const startOfToday = startOfLocalDay(now).getTime();
  const weekAgo = startOfToday - 6 * MS_PER_DAY;
  const weekAhead = startOfToday + 7 * MS_PER_DAY;
  const inLastWeek = (d: Date) => d.getTime() >= weekAgo && d.getTime() <= now.getTime();
  return (
    input.utrEntries.some((e) => inLastWeek(parseLocalDate(e.recordedAt))) ||
    input.outreachUpdatedAt.some((u) => inLastWeek(parseLocalDate(u))) ||
    input.expenses.some((x) => inLastWeek(parseLocalDate(x.expenseDate))) ||
    input.entries.some((e) => {
      const t = parseLocalDate(e.eventDate.slice(0, 10)).getTime();
      return t >= weekAgo && t <= weekAhead;
    })
  );
}

export interface WeekAction {
  id: "report" | "budget" | "event";
  text: string;
  label: string;
  href: string;
  /** The screen's one green button — only "Read it". */
  primary: boolean;
}

/** Only things that are true and actionable today. An empty list is a
 *  real answer ("nothing needs you this week"). */
export function parentWeekActions(input: {
  childFirst: string;
  reportHasNews: boolean;
  budget: SeasonBudgetView;
  nextEvent: NextEvent | null;
  checkHref: string | null;
}): WeekAction[] {
  const out: WeekAction[] = [];
  const { childFirst, budget } = input;
  if (input.reportHasNews) {
    out.push({
      id: "report",
      text: `${childFirst}'s weekly report is ready.`,
      label: "Read it",
      href: "/family/weekly-reports",
      primary: true,
    });
  }
  const overCategory = budget.categories.find((c) => c.status === "over");
  if (budget.total.status === "over") {
    out.push({
      id: "budget",
      text: `The season budget is ${formatMoney(budget.total.overBy ?? 0)} over.`,
      label: "Adjust",
      href: "/family/budget",
      primary: false,
    });
  } else if (overCategory) {
    out.push({
      id: "budget",
      text: `${overCategory.label} is ${formatMoney(overCategory.overBy ?? 0)} over.`,
      label: "Adjust",
      href: "/family/budget",
      primary: false,
    });
  }
  if (input.nextEvent && input.checkHref && input.nextEvent.daysAway <= 30) {
    out.push({
      id: "event",
      text: `${input.nextEvent.name} is on ${input.nextEvent.dateLabel}. See if it fits.`,
      label: "Check",
      href: input.checkHref,
      primary: false,
    });
  }
  return out;
}

/* ------------------------------------------------------------ the chart */

export interface UtrChartPoint {
  date: Date;
  utr: number;
}

export interface UtrChartModel {
  logged: UtrChartPoint[];
  today: UtrChartPoint;
  projection: {
    end: Date;
    /** Rounded as lib/fit.ts rounds it — the number the label prints. */
    value: number;
    low: number;
    high: number;
    year: number;
    /** Which rule drew the line: the child's own logged pace or the
     *  typical-growth assumption (recruitingTimeUtr). */
    source: RecruitingUtrSource;
    /** The logged pace went down, so the line is held at today's rating. */
    held: boolean;
    /** Normal, slow and fast pace from today to the end, for the line and
     *  the band (all three equal for a logged pace). The last point is the
     *  labelled one. */
    path: { date: Date; normal: number; slow: number; fast: number }[];
  } | null;
  targetFloor: number | null;
  domain: { start: Date; end: Date; min: number; max: number };
}

export interface ChartInput {
  entries: { utr: number; recordedAt: string }[];
  currentUtr: number | null;
  graduationYear: number | null;
  gender: PlayerGender | null;
  targetFloor: number | null;
  now: Date;
}

/** Where target schools start: the lowest team floor on the child's list. */
function lowestTargetFloor(schools: Pick<SchoolLite, "minCompetitiveUTR">[]): number | null {
  const floors = schools.map((s) => s.minCompetitiveUTR).filter((v) => Number.isFinite(v) && v > 0);
  return floors.length ? Math.min(...floors) : null;
}

/** The child's projection subject — WITH their logged history, so the chart
 *  follows the same rule as the fit report beside it (useFitReport reads the
 *  same rows): their own pace when a rating is 5–13 months old, typical
 *  growth otherwise. */
function subjectFor(input: ChartInput): ProjectionSubject | null {
  if (input.graduationYear == null || input.gender == null) return null;
  return {
    currentUtr: input.currentUtr,
    graduationYear: input.graduationYear,
    gender: input.gender,
    now: input.now,
    history: utrHistoryFromEntries(input.entries),
  };
}

function projectionFor(input: ChartInput): RecruitingTimeUtr | null {
  const subject = subjectFor(input);
  return subject ? recruitingTimeUtr(subject) : null;
}

/** Null when there is no rating to draw. */
export function buildUtrChart(input: ChartInput): UtrChartModel | null {
  const { currentUtr, now } = input;
  if (!hasRealUtr(currentUtr)) return null;

  const logged = input.entries
    .map((e) => ({ date: parseLocalDate(e.recordedAt), utr: e.utr }))
    .filter((p) => p.date.getTime() <= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const today = { date: now, utr: currentUtr };

  const rtu = projectionFor(input);
  let projection: UtrChartModel["projection"] = null;
  if (rtu && rtu.isProjected && input.graduationYear != null && input.gender != null) {
    const end = projectionTargetDate(input.graduationYear);
    // lib/fit.ts projectionPath: straight lines from today's rating to the
    // report's own low / value / high — the same path /today and /plan
    // shade, deciding nothing itself (lib/projection-single-source.test.ts).
    const path = projectionPath({
      estimate: rtu,
      currentUtr,
      graduationYear: input.graduationYear,
      now,
      steps: 13,
    }).map((pt) => ({ date: pt.date, normal: pt.value, slow: pt.low, fast: pt.high }));
    projection = {
      end,
      value: rtu.value,
      low: rtu.low,
      high: rtu.high,
      year: rtu.year,
      source: rtu.source,
      held: rtu.source === "logged-pace" && (rtu.pace?.perMonth ?? 0) < 0,
      path,
    };
  }

  const firstLogged = logged[0]?.date ?? now;
  const twoMonthsBack = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
  const start = firstLogged.getTime() < twoMonthsBack.getTime() ? firstLogged : twoMonthsBack;
  const end = projection?.end ?? new Date(now.getFullYear(), now.getMonth() + 2, now.getDate());

  const values = [currentUtr, ...logged.map((p) => p.utr)];
  if (projection) values.push(projection.low, projection.high);
  if (input.targetFloor != null) values.push(input.targetFloor);
  const min = Math.floor((Math.min(...values) - 0.25) * 2) / 2;
  const max = Math.ceil((Math.max(...values) + 0.25) * 2) / 2;

  return { logged, today, projection, targetFloor: input.targetFloor, domain: { start, end, min, max } };
}

/** The sentence under the chart. Always true; says so when the answer is
 *  "not by then" rather than inventing a month. */
export function utrChartCaption(model: UtrChartModel | null, input: ChartInput & { childFirst: string }): string {
  const child = input.childFirst;
  if (!model) return `${child} hasn't logged a UTR yet, so there is no trend to show.`;
  const floor = input.targetFloor;
  const current = model.today.utr;
  if (floor == null) return `${child} has no target schools yet, so there is no target range to compare against.`;
  if (current >= floor) return `${child} is already at or above where their target schools start.`;

  const proj = model.projection;
  const subject = subjectFor(input);
  if (proj && subject) {
    // Same rule as the line and the fit report: the child's own logged pace
    // when there is one, typical growth otherwise — and the sentence names
    // which.
    const at = proj.held
      ? `Held at today's rating (${child}'s has gone down lately)`
      : proj.source === "logged-pace"
        ? `At the pace in ${child}'s logged ratings`
        : `At our default assumption of ${DEFAULT_GROWTH_LABEL}`;
    const reach = projectionReachDate({ ...subject, currentUtr: current }, floor);
    if (reach) return `${at}, ${child} reaches the start of their target range around ${monthYear(reach)}.`;
    const gap = Math.round((floor - proj.value) * 10) / 10;
    if (gap <= 0) {
      return `${at}, ${child} reaches the start of their target range around ${monthYear(proj.end)}.`;
    }
    return `${at}, ${child} is about ${formatUtrEstimate(gap)} short of where their target schools start by ${projectionTargetLabel(proj.year)}.`;
  }
  if (input.graduationYear == null) {
    return `${child} is ${formatUtrEstimate(floor - current)} below where their target schools start. With no class year set, there is no estimate.`;
  }
  return `${child} is ${formatUtrEstimate(floor - current)} below where their target schools start.`;
}

const SHORT_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonthYear = (d: Date) => `${SHORT_MONTH[d.getMonth()]} ${d.getFullYear()}`;

/** The chart's full-sentence accessible name: everything the picture shows. */
export function utrChartAriaLabel(model: UtrChartModel, childFirst: string): string {
  const parts: string[] = [`${childFirst}'s UTR trend.`];
  const n = model.logged.length;
  if (n === 0) parts.push(`No ratings logged yet. Today: ${formatPlayerUtr(model.today.utr)}.`);
  else if (n === 1) parts.push(`One rating logged, in ${shortMonthYear(model.logged[0].date)}. Today: ${formatPlayerUtr(model.today.utr)}.`);
  else
    parts.push(
      `${n} ratings logged from ${shortMonthYear(model.logged[0].date)} to ${shortMonthYear(model.logged[n - 1].date)}. Today: ${formatPlayerUtr(model.today.utr)}.`
    );
  if (model.projection) {
    const p = model.projection;
    parts.push(
      p.low === p.high
        ? `Estimate for ${projectionTargetLabel(p.year)}, the summer before senior year: about ${formatUtrEstimate(p.value)}.`
        : `Estimate for ${projectionTargetLabel(p.year)}, the summer before senior year: about ${formatUtrEstimate(p.value)}, between ${formatUtrEstimate(p.low)} and ${formatUtrEstimate(p.high)}.`
    );
  }
  if (model.targetFloor != null) parts.push(`Target schools start at ${formatUtrEstimate(model.targetFloor)}.`);
  return parts.join(" ");
}

/* --------------------------------------------------------- target rows */

export interface TargetRow {
  slug: string;
  name: string;
  /** "unverified" renders as "No UTR yet". */
  band: SchoolFitBand | "unverified";
}

function targetRows(
  schools: Pick<SchoolLite, "slug" | "shortName">[],
  report: Pick<FitReport, "bandBySlug"> | null
): TargetRow[] {
  return schools.map((s) => ({
    slug: s.slug,
    name: s.shortName,
    band: report?.bandBySlug.get(s.slug) ?? "unverified",
  }));
}

/* ------------------------------------------------------- the whole page */

export interface ParentDashboardModel {
  childFirst: string;
  classYear: number | null;
  utr: UtrKpi;
  targets: TargetSchoolsKpi & { rows: TargetRow[]; judging: RecruitingTimeUtr | null };
  spend: SeasonSpendKpi;
  nextEvent: NextEvent | null;
  chart: UtrChartModel | null;
  chartCaption: string;
  chartAriaLabel: string | null;
  budget: SeasonBudgetView;
  expenses: ExpenseRow[];
  actions: WeekAction[];
}

export function buildParentDashboard(input: {
  childFirst: string;
  classYear: number | null;
  gender: PlayerGender | null;
  currentUtr: number | null;
  utrEntries: { utr: number; recordedAt: string }[];
  fitReport: FitReport | null;
  targetSchools: Pick<SchoolLite, "slug" | "shortName" | "minCompetitiveUTR">[];
  budgetSummary: Pick<SeasonBudgetSummary, "totalBudget" | "spent" | "entriesSpent" | "travelSpent" | "campsSpent">;
  /** The CHILD's events (next event, "Check"). */
  childEntries: TournamentEntry[];
  /** The family's entries + expenses (the season statement). */
  familyEntries: TournamentEntry[];
  expenses: BudgetExpense[];
  outreachUpdatedAt: string[];
  now: Date;
}): ParentDashboardModel {
  const { childFirst, now } = input;
  const budget = seasonBudgetView(input.budgetSummary);
  const floor = lowestTargetFloor(input.targetSchools);
  const chartInput: ChartInput = {
    entries: input.utrEntries,
    currentUtr: input.currentUtr,
    graduationYear: input.classYear,
    gender: input.gender,
    targetFloor: floor,
    now,
  };
  const chart = buildUtrChart(chartInput);
  const next = nextEvent(input.childEntries, now);
  return {
    childFirst,
    classYear: input.classYear,
    utr: utrKpi(input.utrEntries, input.currentUtr, now),
    targets: {
      ...targetSchoolsKpi(input.fitReport, input.targetSchools.length),
      rows: targetRows(input.targetSchools, input.fitReport),
      judging: input.fitReport?.utr ?? null,
    },
    spend: seasonSpendKpi(budget),
    nextEvent: next,
    chart,
    chartCaption: utrChartCaption(chart, { ...chartInput, childFirst }),
    chartAriaLabel: chart ? utrChartAriaLabel(chart, childFirst) : null,
    budget,
    expenses: recentExpenses(input.familyEntries, input.expenses),
    actions: parentWeekActions({
      childFirst,
      reportHasNews: weeklyReportHasNews({
        utrEntries: input.utrEntries,
        outreachUpdatedAt: input.outreachUpdatedAt,
        expenses: input.expenses,
        entries: input.childEntries,
        now,
      }),
      budget,
      nextEvent: next,
      checkHref: next ? tournamentCheckHref(next.entry, input.currentUtr) : null,
    }),
  };
}
