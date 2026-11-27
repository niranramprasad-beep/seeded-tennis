import { describe, expect, it } from "vitest";
import {
  budgetBar,
  budgetMessage,
  budgetStatus,
  buildParentDashboard,
  buildUtrChart,
  nextEvent,
  parentWeekActions,
  recentExpenses,
  seasonBudgetView,
  seasonSpendKpi,
  targetSchoolsKpi,
  tournamentCheckHref,
  utrChartAriaLabel,
  utrChartCaption,
  utrKpi,
  weeklyReportHasNews,
  type ChartInput,
} from "./parent-dashboard";
import { buildFitReport, recruitingTimeUtr, utrHistoryFromEntries } from "./fit";
import { formatShortDate } from "./time";
import type { TournamentEntry } from "./db/events";
import type { BudgetExpense } from "./db/family";
import type { SchoolLite } from "./types";

// Every sentence /family prints to a parent, pinned against the numbers it
// came from. All dates are injected and LOCAL (new Date(y, m, d)).

const NOW = new Date(2026, 10, 18, 10); // Wed Nov 18 2026, 10:00 local

const entry = (over: Partial<TournamentEntry>): TournamentEntry => ({
  id: "t1",
  userId: "kid",
  name: "Winter Open",
  level: "L4",
  eventDate: "2026-12-05",
  city: "Rockville",
  state: "MD",
  travelHours: 2,
  distanceMiles: 90,
  drawUtr: null,
  goalUtr: null,
  entryCost: 90,
  travelCost: 60,
  status: "saved",
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});

describe("budget status thresholds", () => {
  it("normal below 90%, near from 90% to the limit, over past it", () => {
    expect(budgetStatus(0, 1000)).toBe("normal");
    expect(budgetStatus(899, 1000)).toBe("normal");
    expect(budgetStatus(900, 1000)).toBe("near");
    expect(budgetStatus(1000, 1000)).toBe("near");
    expect(budgetStatus(1000.01, 1000)).toBe("over");
  });

  it("a bar with a limit carries its status, percent, room and overage", () => {
    const b = budgetBar({ key: "gear", label: "Gear", spent: 560, limit: 500 });
    expect(b).toMatchObject({ status: "over", usedPct: 112, left: 0, overBy: 60, widthPct: 100 });
    const n = budgetBar({ key: "x", label: "X", spent: 460, limit: 500 });
    expect(n).toMatchObject({ status: "near", usedPct: 92, left: 40, overBy: 0 });
  });

  it("a bar without a limit has no status at all — only its share of the total", () => {
    const b = budgetBar({ key: "travel", label: "Travel", spent: 750, limit: null, scale: 3000 });
    expect(b.status).toBeNull();
    expect(b.usedPct).toBeNull();
    expect(b.widthPct).toBe(25);
  });
});

describe("the budget message", () => {
  it("Board 22's example: says where it is over AND where money is left", () => {
    const total = budgetBar({ key: "total", label: "Season total", spent: 2460, limit: 3000 });
    const gear = budgetBar({ key: "gear", label: "Gear", spent: 360, limit: 300 });
    const lessons = budgetBar({ key: "lessons", label: "Lessons", spent: 820, limit: 1200 });
    expect(budgetMessage(total, [gear, lessons])).toEqual({
      tone: "over",
      text: "Gear is $60 over. Lessons has $380 left, so the season total is still under budget.",
    });
  });

  it("over in a category AND in total says both, never 'still under budget'", () => {
    const total = budgetBar({ key: "total", label: "Season total", spent: 3100, limit: 3000 });
    const gear = budgetBar({ key: "gear", label: "Gear", spent: 400, limit: 300 });
    const lessons = budgetBar({ key: "lessons", label: "Lessons", spent: 1100, limit: 1200 });
    expect(budgetMessage(total, [gear, lessons])!.text).toBe(
      "Gear is $100 over. Lessons has $100 left, but the season total is $100 over."
    );
  });

  it("with only a season total (today's data model): over names the biggest cost", () => {
    const v = seasonBudgetView({ totalBudget: 3000, spent: 3060, entriesSpent: 900, travelSpent: 1460, campsSpent: 700 });
    expect(v.total.status).toBe("over");
    expect(v.categories.every((c) => c.status === null)).toBe(true);
    expect(v.message).toEqual({
      tone: "over",
      text: "The season total is $60 over budget. Travel is the biggest cost so far, at $1,460.",
    });
  });

  it("near says how much is used and how much is left", () => {
    const v = seasonBudgetView({ totalBudget: 3000, spent: 2760, entriesSpent: 1000, travelSpent: 1000, campsSpent: 760 });
    expect(v.message).toEqual({ tone: "near", text: "92% of the season budget is used. $240 is left." });
  });

  it("normal and no-budget say nothing", () => {
    expect(seasonBudgetView({ totalBudget: 3000, spent: 2460, entriesSpent: 2460, travelSpent: 0, campsSpent: 0 }).message).toBeNull();
    expect(seasonBudgetView({ totalBudget: 0, spent: 300, entriesSpent: 300, travelSpent: 0, campsSpent: 0 }).message).toBeNull();
  });
});

describe("KPI sentences", () => {
  it("season spend: '$2,460 / of $3,000 · 82% used'", () => {
    const v = seasonBudgetView({ totalBudget: 3000, spent: 2460, entriesSpent: 2460, travelSpent: 0, campsSpent: 0 });
    expect(seasonSpendKpi(v)).toEqual({ value: "$2,460", detail: "of $3,000 · 82% used", status: "normal" });
    const none = seasonBudgetView({ totalBudget: 0, spent: 120, entriesSpent: 120, travelSpent: 0, campsSpent: 0 });
    expect(seasonSpendKpi(none)).toEqual({ value: "$120", detail: "No season budget set yet", status: null });
  });

  it("target schools: a true sentence from the report's own in-range count", () => {
    expect(targetSchoolsKpi({ inRange: 3 }, 3).sentence).toBe("All 3 are in range.");
    expect(targetSchoolsKpi({ inRange: 2 }, 2).sentence).toBe("Both are in range.");
    expect(targetSchoolsKpi({ inRange: 1 }, 1).sentence).toBe("It's in range: a Good match or Safe bet.");
    expect(targetSchoolsKpi({ inRange: 2 }, 5).sentence).toBe("2 of 5 are in range.");
    expect(targetSchoolsKpi({ inRange: 1 }, 5).sentence).toBe("1 of 5 is in range.");
    expect(targetSchoolsKpi({ inRange: 0 }, 4).sentence).toBe("None of the 4 are in range yet.");
    expect(targetSchoolsKpi(null, 4).sentence).toBe("No UTR yet, so no fit.");
    expect(targetSchoolsKpi({ inRange: 0 }, 0).sentence).toBe("No target schools saved yet.");
  });

  it("target schools: agrees with buildFitReport for real schools", () => {
    const schools = [
      { slug: "a", minCompetitiveUTR: 8, avgRosterUTR: 9 },
      { slug: "b", minCompetitiveUTR: 9, avgRosterUTR: 10 },
      { slug: "c", minCompetitiveUTR: 13, avgRosterUTR: 14 },
    ] as SchoolLite[];
    const report = buildFitReport({ currentUtr: 9.2, graduationYear: 2027, gender: "male", schools, now: NOW })!;
    expect(targetSchoolsKpi(report, 3).sentence).toBe(`${report.inRange} of 3 are in range.`);
  });

  it("UTR: two decimals, a real delta with its month, and never a number nobody logged", () => {
    const entries = [
      { utr: 7.0, recordedAt: "2026-02-10" },
      { utr: 7.2, recordedAt: "2026-06-01" },
      { utr: 7.5, recordedAt: "2026-11-01" },
    ];
    expect(utrKpi(entries, 7.5, NOW)).toEqual({
      hasUtr: true,
      value: "7.50",
      delta: 0.5,
      deltaText: "+7.1% (+0.50) since February",
      deltaAmount: "+0.50",
      deltaPercent: "+7.1%",
      since: "February",
      direction: "up",
    });
    expect(utrKpi(entries, null, NOW)).toMatchObject({ hasUtr: false, value: "No UTR yet", deltaText: null });
    expect(utrKpi(entries, 0, NOW).value).toBe("No UTR yet");
    expect(utrKpi([{ utr: 7.5, recordedAt: "2026-11-01" }], 7.5, NOW).deltaText).toBeNull();
  });

  it("UTR: a fall reads as a fall, with a minus sign, and a stale baseline names its year", () => {
    const down = utrKpi(
      [
        { utr: 8.1, recordedAt: "2025-03-02" },
        { utr: 7.9, recordedAt: "2026-10-01" },
      ],
      7.9,
      NOW
    );
    expect(down.deltaText).toBe("−2.5% (−0.20) since March 2025");
    expect(down.direction).toBe("down");
  });

  it("UTR: a YYYY-MM-DD is a LOCAL date (Feb 1 is never 'since January')", () => {
    const k = utrKpi(
      [
        { utr: 6.0, recordedAt: "2026-02-01" },
        { utr: 6.4, recordedAt: "2026-11-01" },
      ],
      6.4,
      NOW
    );
    expect(k.deltaText).toBe("+6.7% (+0.40) since February");
    expect(formatShortDate("2026-12-01")).toBe("Dec 1");
  });

  it("next event: soonest on or after today (local), with its place", () => {
    const e = nextEvent(
      [
        entry({ id: "past", eventDate: "2026-11-17" }),
        entry({ id: "today", eventDate: "2026-11-18", name: "Today Classic" }),
        entry({ id: "later", eventDate: "2026-12-20" }),
      ],
      NOW
    )!;
    expect(e.id).toBe("today");
    expect(e.daysAway).toBe(0);
    expect(e.dateLabel).toBe("Wed, Nov 18");
    expect(e.place).toBe("Rockville, MD");
    expect(nextEvent([entry({ eventDate: "2026-01-01" })], NOW)).toBeNull();
  });
});

describe("recent expenses and the week's actions", () => {
  const expenses: BudgetExpense[] = [
    { id: "x1", category: "camps", label: "Racquet restring", amount: 40, expenseDate: "2026-11-15", createdAt: "" },
    { id: "x2", category: "travel", label: "Hotel", amount: 210, expenseDate: "2026-10-02", createdAt: "" },
  ];

  it("newest first, entered tournaments only, local dates, whole dollars", () => {
    const rows = recentExpenses(
      [entry({ id: "e1", status: "entered", eventDate: "2026-11-01" }), entry({ id: "s1", status: "saved" })],
      expenses
    );
    expect(rows.map((r) => r.id)).toEqual(["x1", "e1", "x2"]);
    expect(rows[0]).toEqual({ id: "x1", dateLabel: "Nov 15", item: "Racquet restring", category: "Camps", amount: "$40" });
    expect(rows[1]).toMatchObject({ item: "Winter Open", category: "Tournament", amount: "$150" });
  });

  it("the report is 'ready' only when something happened this week", () => {
    const quiet = { utrEntries: [], outreachUpdatedAt: [], expenses: [], entries: [], now: NOW };
    expect(weeklyReportHasNews(quiet)).toBe(false);
    expect(weeklyReportHasNews({ ...quiet, utrEntries: [{ recordedAt: "2026-11-16" }] })).toBe(true);
    expect(weeklyReportHasNews({ ...quiet, utrEntries: [{ recordedAt: "2026-11-01" }] })).toBe(false);
    expect(weeklyReportHasNews({ ...quiet, entries: [{ eventDate: "2026-11-22" }] })).toBe(true);
    expect(weeklyReportHasNews({ ...quiet, outreachUpdatedAt: ["2026-11-17T20:00:00Z"] })).toBe(true);
  });

  it("only real actions; 'Read it' is the one primary", () => {
    const over = seasonBudgetView({ totalBudget: 1000, spent: 1060, entriesSpent: 1060, travelSpent: 0, campsSpent: 0 });
    const ok = seasonBudgetView({ totalBudget: 1000, spent: 100, entriesSpent: 100, travelSpent: 0, campsSpent: 0 });
    const ev = nextEvent([entry({})], NOW);
    const all = parentWeekActions({ childFirst: "Maya", reportHasNews: true, budget: over, nextEvent: ev, checkHref: "/tournament-fit?x" });
    expect(all.map((a) => [a.id, a.label])).toEqual([
      ["report", "Read it"],
      ["budget", "Adjust"],
      ["event", "Check"],
    ]);
    expect(all.filter((a) => a.primary).map((a) => a.id)).toEqual(["report"]);
    expect(all[1].text).toBe("The season budget is $60 over.");
    expect(parentWeekActions({ childFirst: "Maya", reportHasNews: false, budget: ok, nextEvent: null, checkHref: null })).toEqual([]);
  });

  it("'Check' opens the tournament checker with the event filled in", () => {
    const href = tournamentCheckHref(entry({}), 7.45);
    expect(href.startsWith("/tournament-fit?")).toBe(true);
    const p = new URLSearchParams(href.split("?")[1]);
    expect(p.get("name")).toBe("Winter Open");
    expect(p.get("utr")).toBe("7.45");
    expect(p.get("travel")).toBe("short");
    expect(new URLSearchParams(tournamentCheckHref(entry({}), null).split("?")[1]).get("utr")).toBeNull();
  });
});

describe("the UTR chart: every number from lib/fit.ts, every sentence true", () => {
  // No logged rating 5–13 months old (Nov 1 is 17 days ago), so the chart —
  // like the fit report beside it — uses the typical-growth assumption.
  const input: ChartInput = {
    entries: [
      { utr: 7.0, recordedAt: "2025-09-10" },
      { utr: 7.5, recordedAt: "2026-11-01" },
    ],
    currentUtr: 7.5,
    graduationYear: 2029,
    gender: "female",
    targetFloor: 8.5,
    now: NOW,
  };
  // A rating dated Feb 10 2026 (about 9.3 months ago) is a year-ago rating:
  // the chart now follows Maya's own pace, exactly as recruitingTimeUtr does.
  const logged: ChartInput = {
    ...input,
    entries: [
      { utr: 7.0, recordedAt: "2026-02-10" },
      { utr: 7.5, recordedAt: "2026-11-01" },
    ],
  };
  const rtuFor = (i: ChartInput) =>
    recruitingTimeUtr({
      currentUtr: i.currentUtr,
      graduationYear: i.graduationYear!,
      gender: i.gender!,
      now: NOW,
      history: utrHistoryFromEntries(i.entries),
    })!;

  it("the projection's end is recruitingTimeUtr's, exactly (typical growth)", () => {
    const model = buildUtrChart(input)!;
    const rtu = rtuFor(input);
    expect(rtu.source).toBe("typical-growth");
    expect(rtu).toEqual(recruitingTimeUtr({ currentUtr: 7.5, graduationYear: 2029, gender: "female", now: NOW }));
    expect(model.projection!.source).toBe("typical-growth");
    expect(model.projection!.value).toBe(rtu.value);
    expect(model.projection!.low).toBe(rtu.low);
    expect(model.projection!.high).toBe(rtu.high);
    const last = model.projection!.path[model.projection!.path.length - 1];
    expect([last.slow, last.normal, last.fast]).toEqual([rtu.low, rtu.value, rtu.high]);
    expect(model.projection!.path[0].normal).toBe(7.5);
    expect(model.domain.min).toBeLessThanOrEqual(7.0);
    expect(model.domain.max).toBeGreaterThanOrEqual(rtu.high);
  });

  it("with a logged rating in the window, the line is the child's own pace — the fit report's number, no range", () => {
    const model = buildUtrChart(logged)!;
    const rtu = rtuFor(logged);
    expect(rtu.source).toBe("logged-pace");
    // (7.5 − 7.0) over ~9.27 months, carried ~18.4 months to June 1 2028.
    expect(rtu.value).toBe(8.5);
    expect(model.projection!.source).toBe("logged-pace");
    expect(model.projection!.value).toBe(rtu.value);
    expect(model.projection!.low).toBe(rtu.value);
    expect(model.projection!.high).toBe(rtu.value);
    // Every step of the line has one value at every pace (no invented band),
    // and it never dips below today.
    for (const step of model.projection!.path) {
      expect(step.slow).toBe(step.normal);
      expect(step.fast).toBe(step.normal);
      expect(step.normal).toBeGreaterThanOrEqual(7.5);
    }
    // The same report the page bands with (useFitReport passes these rows).
    const report = buildFitReport({
      currentUtr: 7.5,
      graduationYear: 2029,
      gender: "female",
      schools: [],
      projectionInput: { utrHistory: utrHistoryFromEntries(logged.entries), graduationYear: 2029, gender: "female" },
      now: NOW,
    })!;
    expect(report.utr.value).toBe(model.projection!.value);
  });

  it("no rating, no chart — and the caption says so", () => {
    const none = buildUtrChart({ ...input, currentUtr: null });
    expect(none).toBeNull();
    expect(utrChartCaption(none, { ...input, childFirst: "Maya" })).toBe(
      "Maya hasn't logged a UTR yet, so there is no trend to show."
    );
  });

  it("caption: the month the typical pace reaches the target range", () => {
    const model = buildUtrChart(input)!;
    // 1.0 points at 1.0/yr from Nov 18 2026 -> about Nov 2027
    expect(utrChartCaption(model, { ...input, childFirst: "Maya" })).toBe(
      "At our default assumption of 1.0 UTR a year, Maya reaches the start of their target range around November 2027."
    );
  });

  it("caption: names the logged pace when that is what the line follows", () => {
    const at82 = { ...logged, targetFloor: 8.2 };
    // 0.7 points at ~0.054 a month: about 13 months, December 2027.
    expect(utrChartCaption(buildUtrChart(at82), { ...at82, childFirst: "Maya" })).toBe(
      "At the pace in Maya's logged ratings, Maya reaches the start of their target range around December 2027."
    );
    const far = { ...logged, targetFloor: 11 };
    expect(utrChartCaption(buildUtrChart(far), { ...far, childFirst: "Maya" })).toBe(
      "At the pace in Maya's logged ratings, Maya is still short of where their target schools start (11.xx) by summer 2028."
    );
  });

  it("caption: a falling logged rating is held at today, and says so", () => {
    const falling = { ...logged, entries: [{ utr: 8.0, recordedAt: "2026-02-10" }] };
    const model = buildUtrChart(falling)!;
    expect(model.projection!.held).toBe(true);
    expect(model.projection!.value).toBe(7.5);
    expect(utrChartCaption(model, { ...falling, childFirst: "Maya" })).toBe(
      "Held at today's rating (Maya's has gone down lately), Maya is still short of where their target schools start (8.xx) by summer 2028."
    );
  });

  it("caption: honest when the pace does not get there by senior summer", () => {
    const far = { ...input, targetFloor: 11 };
    const model = buildUtrChart(far)!;
    expect(utrChartCaption(model, { ...far, childFirst: "Maya" })).toMatch(
      /^At our default assumption of 1\.0 UTR a year, Maya is still short of where their target schools start \(11\.xx\) by summer 2028\.$/
    );
  });

  it("caption: already there, or no targets", () => {
    const there = { ...input, targetFloor: 7 };
    expect(utrChartCaption(buildUtrChart(there), { ...there, childFirst: "Maya" })).toBe(
      "Maya is already at or above where their target schools start."
    );
    const none = { ...input, targetFloor: null };
    expect(utrChartCaption(buildUtrChart(none), { ...none, childFirst: "Maya" })).toMatch(/no target schools yet/);
  });

  it("a senior gets no projection (today IS the recruiting rating)", () => {
    const senior = { ...input, graduationYear: 2027 };
    expect(buildUtrChart(senior)!.projection).toBeNull();
  });

  it("the aria-label is a full sentence of what the picture shows", () => {
    const model = buildUtrChart(input)!;
    const rtu = rtuFor(input);
    expect(utrChartAriaLabel(model, "Maya")).toBe(
      `Maya's UTR trend. 2 ratings logged from Sep 2025 to Nov 2026. Today: 7.50. ` +
        `Estimate for summer 2028, the summer before senior year: about ${rtu.value.toFixed(1)}, ` +
        `between ${rtu.low.toFixed(1)} and ${rtu.high.toFixed(1)}. Target schools start at 8.xx.`
    );
    // A logged pace has no range, so the label claims none.
    expect(utrChartAriaLabel(buildUtrChart(logged)!, "Maya")).toBe(
      `Maya's UTR trend. 2 ratings logged from Feb 2026 to Nov 2026. Today: 7.50. ` +
        `Estimate for summer 2028, the summer before senior year: about 8.5. Target schools start at 8.xx.`
    );
  });
});

describe("the whole page model", () => {
  it("a child with no UTR gets no fake number anywhere", () => {
    const m = buildParentDashboard({
      childFirst: "Maya",
      classYear: 2029,
      gender: "female",
      currentUtr: null,
      utrEntries: [],
      fitReport: null,
      targetSchools: [{ slug: "a", shortName: "School A", minCompetitiveUTR: 8 }],
      budgetSummary: { totalBudget: 0, spent: 0, entriesSpent: 0, travelSpent: 0, campsSpent: 0 },
      childEntries: [],
      familyEntries: [],
      expenses: [],
      outreachUpdatedAt: [],
      now: NOW,
    });
    expect(m.utr.value).toBe("No UTR yet");
    expect(m.chart).toBeNull();
    expect(m.chartAriaLabel).toBeNull();
    expect(m.targets.rows).toEqual([{ slug: "a", name: "School A", band: "unverified" }]);
    expect(m.targets.sentence).toBe("No UTR yet, so no fit.");
    expect(m.actions).toEqual([]);
  });
});
