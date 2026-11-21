import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { RoadmapYear } from "@/lib/types";
import {
  buildChartSeries,
  chartValuesAt,
  clientXToViewBoxX,
  cursorAfterKey,
  cursorTime,
  readoutAt,
  seriesPaths,
  stepMonths,
  type ChartSeries,
} from "./plan-trajectory-values";

// Clearly-fake fixture data — no real player.
const d = (y: number, m: number, day = 1) => new Date(y, m, day);
const t = (y: number, m: number, day = 1) => d(y, m, day).getTime();
const DAY = 86_400_000;

const TODAY = d(2026, 10, 21); // 21 Nov 2026
const logs = [
  { date: d(2026, 0, 10), utr: 6 },
  { date: d(2026, 3, 12), utr: 6.8 },
  { date: d(2026, 9, 1), utr: 8 }, // the last log, 1 Oct 2026
];
const roadmap: RoadmapYear[] = [
  { calendarYear: 2026, gradeLabel: "FAKE past", shortLabel: "P", utrTarget: 7, milestones: [] }, // before Now: dropped
  { calendarYear: 2028, gradeLabel: "FAKE pre-12", shortLabel: "P12", utrTarget: 10, milestones: [] },
  { calendarYear: 2027, gradeLabel: "FAKE pre-11", shortLabel: "P11", utrTarget: 9, milestones: [] },
];
const estimate = [
  { date: TODAY, low: 8, value: 8, high: 8 },
  { date: d(2028, 5, 1), low: 8.6, value: 9.2, high: 9.8 },
];
const series = buildChartSeries({ actualPoints: [...logs].reverse(), roadmap, estimate, today: TODAY })!;
// A simple, exact geometry: x = days since the first log, y = 100 × UTR.
const g = { x: (ms: number) => (ms - t(2026, 0, 10)) / DAY, y: (u: number) => 100 * u };

describe("clientXToViewBoxX — the crosshair is in viewBox units", () => {
  it("scales CSS pixels by viewBox width / rendered width", () => {
    // A 700-unit viewBox drawn 375px wide: 100px in is 100 * 700/375 units.
    expect(clientXToViewBoxX(110, { left: 10, width: 375 }, 700)).toBeCloseTo((100 * 700) / 375, 9);
    expect(clientXToViewBoxX(385, { left: 10, width: 375 }, 700)).toBeCloseTo(700, 9);
  });
  it("is the identity when the SVG is drawn at its viewBox width", () => {
    expect(clientXToViewBoxX(250, { left: 50, width: 900 }, 900)).toBe(200);
  });
  it("does not divide by zero before layout", () => {
    expect(clientXToViewBoxX(30, { left: 10, width: 0 }, 700)).toBe(20);
  });
});

describe("buildChartSeries — the one series the chart draws", () => {
  it("sorts the logs; Now is the last one", () => {
    expect(series.logged.map((p) => p.utr)).toEqual([6, 6.8, 8]);
    expect(series.now).toEqual(logs[2]);
  });
  it("keeps only checkpoints after Now, oldest first", () => {
    expect(series.checkpoints.map((c) => c.label)).toEqual(["FAKE pre-11", "FAKE pre-12"]);
  });
  it("the plan line starts at Now, then each checkpoint", () => {
    expect(series.plan[0]).toBe(series.now);
    expect(series.plan.map((p) => p.utr)).toEqual([8, 9, 10]);
  });
  it("no goal (no checkpoints): no plan line", () => {
    expect(buildChartSeries({ actualPoints: logs, roadmap: [], estimate, today: TODAY })!.plan).toEqual([]);
  });
  it("nothing logged (or only the 0 sentinel): no series", () => {
    expect(buildChartSeries({ actualPoints: [], roadmap, estimate })).toBeNull();
    expect(buildChartSeries({ actualPoints: [{ date: TODAY, utr: 0 }], roadmap, estimate })).toBeNull();
  });
  it("today defaults to the current date — a future-dated log is never Logged", () => {
    const future = d(2099, 0, 1);
    const s = buildChartSeries({ actualPoints: [...logs, { date: future, utr: 9 }], roadmap: [], estimate: [] })!;
    expect(Math.abs(s.today.getTime() - Date.now())).toBeLessThan(60_000);
    expect(chartValuesAt(s, future.getTime()).logged).toBeNull();
    expect(readoutAt(s, future.getTime(), g).rows.find((r) => r.key === "logged")).toBeUndefined();
  });
});

describe("seriesPaths — the lines come from the same series", () => {
  const paths = seriesPaths(series, g);
  it("the dashed plan line begins at the Now point", () => {
    expect(paths.plan!.split(" ")[0]).toBe(`${g.x(series.now.date.getTime())},${g.y(8)}`);
    expect(paths.plan!.split(" ")).toHaveLength(3);
  });
  it("the solid line runs through every log", () => {
    expect(paths.logged!.split(" ")).toEqual(logs.map((p) => `${g.x(p.date.getTime())},${g.y(p.utr)}`));
  });
  it("the dotted line uses the middle value; the band runs high then low", () => {
    expect(paths.estimate).toBe(`${g.x(TODAY.getTime())},${g.y(8)} ${g.x(t(2028, 5, 1))},${g.y(9.2)}`);
    expect(paths.band).toBe(
      `M${g.x(TODAY.getTime())},${g.y(8)} L${g.x(t(2028, 5, 1))},${g.y(9.8)} L${g.x(t(2028, 5, 1))},${g.y(8.6)} L${g.x(
        TODAY.getTime()
      )},${g.y(8)} Z`
    );
  });
  it("one log, no goal, no estimate: no lines", () => {
    const one = buildChartSeries({ actualPoints: [logs[0]], roadmap: [], estimate: [], today: TODAY })!;
    expect(seriesPaths(one, g)).toEqual({ logged: null, plan: null, estimate: null, band: null });
  });
});

describe("chartValuesAt — only what is really on the chart", () => {
  it("before the first log: nothing", () => {
    expect(chartValuesAt(series, t(2025, 11, 1))).toEqual({ logged: null, plan: null, estimate: null });
  });
  it("exactly at a log: that entry", () => {
    expect(chartValuesAt(series, t(2026, 3, 12)).logged).toEqual(logs[1]);
    expect(chartValuesAt(series, t(2026, 0, 10)).logged).toEqual(logs[0]);
    expect(chartValuesAt(series, t(2026, 9, 1)).logged).toEqual(logs[2]);
  });
  it("between logs: the most recent REAL entry, never an interpolated rating", () => {
    const v = chartValuesAt(series, t(2026, 5, 20));
    expect(v.logged).toEqual(logs[1]);
    expect(v.plan).toBeNull();
    expect(v.estimate).toBeNull();
  });
  it("past the last log: no Logged — the plan line takes over", () => {
    const v = chartValuesAt(series, t(2026, 9, 15));
    expect(v.logged).toBeNull();
    expect(v.plan!).toBeGreaterThan(8);
  });
  it("after today: never Logged, even with a log dated after today", () => {
    const s: ChartSeries = { ...series, logged: [...series.logged, { date: d(2027, 0, 1), utr: 8.5 }] };
    expect(chartValuesAt(s, t(2026, 11, 1)).logged).toBeNull();
    expect(chartValuesAt(s, t(2027, 0, 1)).logged).toBeNull();
  });
  it("after today: Plan and the estimate each follow their own line", () => {
    const at = t(2027, 5, 1);
    const v = chartValuesAt(series, at);
    expect(v.logged).toBeNull();
    expect(v.plan).toBe(9);
    const f = (at - TODAY.getTime()) / (t(2028, 5, 1) - TODAY.getTime());
    expect(v.estimate!.value).toBeCloseTo(8 + 1.2 * f, 9);
    expect(v.estimate!.low).toBeCloseTo(8 + 0.6 * f, 9);
    expect(v.estimate!.high).toBeCloseTo(8 + 1.8 * f, 9);
    expect(chartValuesAt(series, t(2027, 11, 1)).plan).not.toBe(v.plan);
  });
  it("past the last checkpoint: the plan line stops, and so does its value", () => {
    expect(chartValuesAt(series, t(2028, 5, 1)).plan).toBe(10);
    expect(chartValuesAt(series, t(2028, 6, 1)).plan).toBeNull();
    expect(chartValuesAt(series, t(2029, 0, 1)).plan).toBeNull();
    expect(chartValuesAt(series, t(2028, 6, 1)).estimate).toBeNull();
  });
  it("no plan line (no goal): never a Plan value", () => {
    const noPlan: ChartSeries = { ...series, plan: [] };
    for (const at of [t(2026, 9, 15), t(2027, 5, 1), t(2028, 5, 1)]) expect(chartValuesAt(noPlan, at).plan).toBeNull();
    expect(chartValuesAt({ ...series, plan: [series.now] }, t(2027, 5, 1)).plan).toBeNull();
  });
  it("no estimate: never an estimate value", () => {
    expect(chartValuesAt({ ...series, estimate: [] }, t(2027, 5, 1)).estimate).toBeNull();
  });
});

describe("readoutAt — the words and where each dot sits", () => {
  it("between logs: 'Logged 6.80 · Apr 12', its dot ON that entry's point", () => {
    const r = readoutAt(series, t(2026, 5, 20), g);
    expect(r.date).toBe("Jun '26");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      key: "logged",
      label: "Logged",
      text: "6.80 · Apr 12",
      dot: { cx: g.x(t(2026, 3, 12)), cy: g.y(6.8) },
    });
    expect(r.sentence).toBe("Jun '26: Logged 6.80 · Apr 12");
  });
  it("names the entry's year when it differs from the cursor's", () => {
    const s = buildChartSeries({ actualPoints: [{ date: d(2025, 11, 20), utr: 6 }, logs[2]], roadmap: [], estimate: [], today: TODAY })!;
    expect(readoutAt(s, t(2026, 1, 1), g).rows[0].text).toBe("6.00 · Dec 20 '25");
  });
  it("after today: Plan and 'Planning estimate' dots under the crosshair, on their own lines", () => {
    const at = t(2027, 5, 1);
    const r = readoutAt(series, at, g, 10);
    expect(r.rows.map((x) => x.key)).toEqual(["plan", "estimate"]);
    const [plan, est] = r.rows;
    expect(plan).toMatchObject({ label: "Plan", text: "9.00", dot: { cx: g.x(at), cy: g.y(9) } });
    const v = chartValuesAt(series, at).estimate!;
    expect(est.label).toBe("Planning estimate");
    // The middle value — not the band's high or low edge.
    expect(est.dot).toEqual({ cx: g.x(at), cy: g.y(v.value) });
    expect(est.dot.cy).not.toBeCloseTo(g.y(v.high), 6);
    expect(est.text).toMatch(/^\d+\.\d \(\d+\.\d–\d+\.\d\)$/);
  });
  it("the last checkpoint prints the goal exactly as typed", () => {
    expect(readoutAt(series, t(2028, 5, 1), g, 10).rows.find((r) => r.key === "plan")!.text).toBe("10.00");
  });
  it("no row at all reads 'Not tracked'", () => {
    expect(readoutAt(series, t(2029, 0, 1), g).sentence).toBe("Jan '29: Not tracked");
  });
});

describe("stepMonths and the keyboard cursor", () => {
  it("moves whole calendar months both ways", () => {
    expect(stepMonths(t(2026, 10, 15), 1)).toBe(t(2026, 11, 15));
    expect(stepMonths(t(2026, 11, 15), 1)).toBe(t(2027, 0, 15));
    expect(stepMonths(t(2026, 0, 15), -1)).toBe(t(2025, 11, 15));
  });
  it("clamps to a shorter month without drifting the anchor day", () => {
    expect(stepMonths(t(2027, 0, 31), 1)).toBe(t(2027, 1, 28));
    expect(stepMonths(t(2027, 0, 31), 2)).toBe(t(2027, 2, 31));
    const bounds = { min: t(2026, 0, 1), max: t(2029, 0, 1) };
    let c = cursorAfterKey({ anchor: t(2027, 0, 31), months: 0 }, "ArrowRight", bounds, 0)!;
    expect(cursorTime(c, bounds)).toBe(t(2027, 1, 28));
    c = cursorAfterKey(c, "ArrowRight", bounds, 0)!;
    expect(cursorTime(c, bounds)).toBe(t(2027, 2, 31)); // not Mar 28
  });
  it("first arrow lands on Now; Home/End the ends; Escape clears; other keys are not the chart's", () => {
    const bounds = { min: t(2026, 0, 1), max: t(2028, 5, 1) };
    const start = t(2026, 9, 1);
    expect(cursorTime(cursorAfterKey(null, "ArrowRight", bounds, start)!, bounds)).toBe(start);
    expect(cursorTime(cursorAfterKey(null, "Home", bounds, start)!, bounds)).toBe(bounds.min);
    expect(cursorTime(cursorAfterKey(null, "End", bounds, start)!, bounds)).toBe(bounds.max);
    expect(cursorAfterKey({ anchor: start, months: 2 }, "Escape", bounds, start)).toBeNull();
    expect(cursorAfterKey(null, "Enter", bounds, start)).toBeUndefined();
    // Stepping past an end stops on it.
    const atEnd = cursorAfterKey({ anchor: bounds.max, months: 0 }, "ArrowRight", bounds, start)!;
    expect(cursorTime(atEnd, bounds)).toBe(bounds.max);
  });
});

describe("the chart draws from the helpers, nothing of its own", () => {
  const src = readFileSync("components/seeded/roadmap/plan-trajectory-chart.tsx", "utf8");
  it("pointer events scaled into viewBox units; pan-y pinch-zoom", () => {
    expect(src).toMatch(/clientXToViewBoxX\(e\.clientX, e\.currentTarget\.getBoundingClientRect\(\), W\)/);
    expect(src).toMatch(/onPointerMove=/);
    expect(src).not.toMatch(/onMouseMove=/);
    expect(src).toMatch(/touchAction: "pan-y pinch-zoom"/);
  });
  it("series, paths and dots come from the helper module", () => {
    expect(src).toMatch(/buildChartSeries\(\{ actualPoints, roadmap, estimate, today \}\)/);
    expect(src).toMatch(/seriesPaths\(series, geometry\)/);
    expect(src).toMatch(/readoutAt\(series, cursor, geometry, goal\?\.value\)/);
    for (const k of ["logged", "plan", "estimate", "band"]) expect(src).toMatch(new RegExp(`paths\\.${k}`));
    expect(src).toMatch(/cx=\{r\.dot\.cx\} cy=\{r\.dot\.cy\}/);
    // No series built in the component.
    expect(src).not.toMatch(/\[now, \.\.\.checkpoints\]/);
    expect(src).not.toMatch(/new Date\(\)/);
    expect(src).not.toMatch(/chartValuesAt\(/);
  });
  it("a focusable chart group, announced on keyboard steps only", () => {
    expect(src).toMatch(/role="group"/);
    expect(src).toMatch(/aria-roledescription="chart"/);
    expect(src).not.toMatch(/role="img"/);
    expect(src).toMatch(/tabIndex=\{0\}/);
    expect(src).toMatch(/aria-live="polite"/);
    // setAnnouncement only inside onKey.
    const onPointer = src.slice(src.indexOf("const onPointer"), src.indexOf("const onKey"));
    expect(onPointer).not.toMatch(/setAnnouncement/);
    expect(src.slice(src.indexOf("const onKey"), src.indexOf("const onBlur"))).toMatch(/setAnnouncement/);
  });
});
