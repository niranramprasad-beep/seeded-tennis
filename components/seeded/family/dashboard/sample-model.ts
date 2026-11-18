import { buildFitReport, utrHistoryFromEntries } from "@/lib/fit";
import { buildParentDashboard, type ParentDashboardModel } from "@/lib/parent-dashboard";
import type { TournamentEntry } from "@/lib/db/events";
import type { BudgetExpense } from "@/lib/db/family";
import { buildSeasonBudgetSummary } from "@/lib/family-budget";
import type { SchoolLite } from "@/lib/types";

// SAMPLE DATA — the paywall's "Example" preview and nothing else.
//
// CLAUDE.md forbids made-up data anywhere a real number could be read. This
// is the one deliberate exception, and it is fenced three ways: it only
// renders inside the preview, which wears a dashed "Example" chip and is
// hidden from assistive tech (sr-only text says it is an example); no row
// names a real school ("School A"), so it can never read as a band claim
// about a real program; and it runs through the same builders as the real
// page, so the preview cannot show a layout the product does not have.

const NOW = new Date(2026, 10, 18, 10);

const SCHOOLS = [
  { slug: "example-a", shortName: "School A", name: "School A", minCompetitiveUTR: 7.6, avgRosterUTR: 8.8 },
  { slug: "example-b", shortName: "School B", name: "School B", minCompetitiveUTR: 8.1, avgRosterUTR: 9.3 },
  { slug: "example-c", shortName: "School C", name: "School C", minCompetitiveUTR: 8.4, avgRosterUTR: 9.6 },
] as unknown as SchoolLite[];

const UTR_ENTRIES = [
  { utr: 6.95, recordedAt: "2026-02-08" },
  { utr: 7.1, recordedAt: "2026-05-02" },
  { utr: 7.3, recordedAt: "2026-08-15" },
  { utr: 7.45, recordedAt: "2026-11-14" },
];

const entry = (id: string, name: string, eventDate: string, status: "saved" | "entered", entryCost: number, travelCost: number) =>
  ({
    id,
    userId: "example",
    name,
    level: "L4",
    eventDate,
    city: "Example City",
    state: "",
    travelHours: 2,
    distanceMiles: 90,
    drawUtr: null,
    goalUtr: null,
    entryCost,
    travelCost,
    status,
    createdAt: "",
  }) as TournamentEntry;

const ENTRIES = [
  entry("e1", "Fall Open", "2026-10-24", "entered", 95, 180),
  entry("e2", "Winter Classic", "2026-12-05", "saved", 110, 240),
];

const EXPENSES: BudgetExpense[] = [
  { id: "x1", category: "camps", label: "Holiday camp", amount: 640, expenseDate: "2026-11-12", createdAt: "" },
  { id: "x2", category: "travel", label: "Hotel", amount: 210, expenseDate: "2026-11-03", createdAt: "" },
  { id: "x3", category: "entries", label: "Section entry fees", amount: 300, expenseDate: "2026-10-10", createdAt: "" },
  { id: "x4", category: "travel", label: "Gas and parking", amount: 85, expenseDate: "2026-09-21", createdAt: "" },
];

let cached: ParentDashboardModel | null = null;

export function sampleParentDashboard(): ParentDashboardModel {
  if (cached) return cached;
  const fitReport = buildFitReport({
    currentUtr: 7.45,
    graduationYear: 2028,
    gender: "female",
    schools: SCHOOLS,
    // The same rows the chart draws, as useFitReport passes them on the real
    // page — so the sample's bands and its chart follow one projection rule.
    projectionInput: { utrHistory: utrHistoryFromEntries(UTR_ENTRIES), graduationYear: 2028, gender: "female", now: NOW },
    now: NOW,
  });
  cached = buildParentDashboard({
    childFirst: "Alex",
    classYear: 2028,
    gender: "female",
    currentUtr: 7.45,
    utrEntries: UTR_ENTRIES,
    fitReport,
    targetSchools: SCHOOLS,
    // Derived from the same rows the statement lists, by the engine the
    // real page uses — so each category is the sum of its rows and the
    // total is the sum of the categories. It used to be typed in by hand and
    // did not add up (camps $1,590 beside a single $640 camp row).
    budgetSummary: buildSeasonBudgetSummary({
      totalBudget: 3000,
      playerUtr: 7.45,
      entries: ENTRIES,
      expenses: EXPENSES,
    }),
    childEntries: ENTRIES,
    familyEntries: ENTRIES,
    expenses: EXPENSES,
    outreachUpdatedAt: [],
    now: NOW,
  });
  return cached;
}
