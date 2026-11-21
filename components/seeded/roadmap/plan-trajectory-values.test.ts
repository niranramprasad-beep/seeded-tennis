import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { chartValuesAt, clientXToViewBoxX, stepMonths, type ChartSeries } from "./plan-trajectory-values";

// Clearly-fake fixture data — no real player.
const d = (y: number, m: number, day = 1) => new Date(y, m, day);
const t = (y: number, m: number, day = 1) => d(y, m, day).getTime();

const TODAY = d(2026, 10, 21); // 21 Nov 2026
const lastLog = { date: d(2026, 9, 1), utr: 8 }; // 1 Oct 2026
const series: ChartSeries = {
  logged: [{ date: d(2026, 0, 1), utr: 6 }, { date: d(2026, 3, 1), utr: 7 }, lastLog],
  // The dashed line: the last log, then two checkpoints. It stops at Jun '28.
  plan: [lastLog, { date: d(2027, 5, 1), utr: 9 }, { date: d(2028, 5, 1), utr: 10 }],
  estimate: [
    { date: TODAY, low: 8, value: 8, high: 8 },
    { date: d(2028, 5, 1), low: 8.6, value: 9.2, high: 9.8 },
  ],
  today: TODAY,
};

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

describe("chartValuesAt — a value only where its line is drawn", () => {
  it("before the first log: nothing logged", () => {
    const v = chartValuesAt(series, t(2025, 11, 1));
    expect(v.logged).toBeNull();
    expect(v.plan).toBeNull();
    expect(v.estimate).toBeNull();
  });

  it("exactly at a log: that logged value", () => {
    expect(chartValuesAt(series, t(2026, 3, 1)).logged).toBe(7);
    expect(chartValuesAt(series, t(2026, 0, 1)).logged).toBe(6);
    expect(chartValuesAt(series, lastLog.date.getTime()).logged).toBe(8);
  });

  it("between logs: the value the solid line draws there", () => {
    const a = t(2026, 0, 1);
    const b = t(2026, 3, 1);
    const mid = a + (b - a) / 2;
    expect(chartValuesAt(series, mid).logged).toBeCloseTo(6.5, 9);
    // No plan or estimate before the last log.
    expect(chartValuesAt(series, mid).plan).toBeNull();
    expect(chartValuesAt(series, mid).estimate).toBeNull();
  });

  it("past the last log: no Logged value — it never sticks at the last log", () => {
    const v = chartValuesAt(series, t(2026, 9, 15));
    expect(v.logged).toBeNull();
    // ...and the plan line, which starts at the last log, takes over.
    expect(v.plan).not.toBeNull();
    expect(v.plan!).toBeGreaterThan(8);
  });

  it("after today: never a logged value, even with a log dated in the future", () => {
    const withFutureLog: ChartSeries = { ...series, logged: [...series.logged, { date: d(2027, 0, 1), utr: 8.5 }] };
    expect(chartValuesAt(withFutureLog, t(2026, 11, 1)).logged).toBeNull();
    expect(chartValuesAt(withFutureLog, t(2027, 0, 1)).logged).toBeNull();
  });

  it("after today: Plan and Estimate each follow their own line", () => {
    const at = t(2027, 5, 1);
    const v = chartValuesAt(series, at);
    expect(v.logged).toBeNull();
    expect(v.plan).toBe(9); // exactly on the checkpoint
    const f = (at - TODAY.getTime()) / (t(2028, 5, 1) - TODAY.getTime());
    expect(v.estimate!.value).toBeCloseTo(8 + 1.2 * f, 9);
    expect(v.estimate!.low).toBeCloseTo(8 + 0.6 * f, 9);
    expect(v.estimate!.high).toBeCloseTo(8 + 1.8 * f, 9);
    // Two dates after today read two different plan values — no stuck dot.
    expect(chartValuesAt(series, t(2027, 11, 1)).plan).not.toBe(v.plan);
  });

  it("past the last checkpoint: the plan line stops, and so does its value", () => {
    expect(chartValuesAt(series, t(2028, 5, 1)).plan).toBe(10);
    expect(chartValuesAt(series, t(2028, 6, 1)).plan).toBeNull();
    expect(chartValuesAt(series, t(2029, 0, 1)).plan).toBeNull();
    // The estimate stops at its own end too.
    expect(chartValuesAt(series, t(2028, 6, 1)).estimate).toBeNull();
  });

  it("no plan line (no goal): never a Plan value", () => {
    const noPlan: ChartSeries = { ...series, plan: [] };
    for (const at of [t(2026, 9, 15), t(2027, 5, 1), t(2028, 5, 1)]) {
      expect(chartValuesAt(noPlan, at).plan).toBeNull();
    }
    // A lone start point is not a line either.
    expect(chartValuesAt({ ...series, plan: [lastLog] }, t(2027, 5, 1)).plan).toBeNull();
  });

  it("no estimate: never an Estimate value", () => {
    expect(chartValuesAt({ ...series, estimate: [] }, t(2027, 5, 1)).estimate).toBeNull();
  });

  it("never returns the 0 sentinel as a value", () => {
    const sentinel: ChartSeries = { ...series, logged: [{ date: d(2026, 0, 1), utr: 0 }] };
    expect(chartValuesAt(sentinel, t(2026, 0, 1)).logged).toBeNull();
  });

  it("one log: a value only exactly on it", () => {
    const one: ChartSeries = { ...series, logged: [lastLog] };
    expect(chartValuesAt(one, lastLog.date.getTime()).logged).toBe(8);
    expect(chartValuesAt(one, lastLog.date.getTime() + 86_400_000).logged).toBeNull();
  });
});

describe("stepMonths — the arrow keys' step", () => {
  it("moves whole calendar months both ways", () => {
    expect(stepMonths(t(2026, 10, 15), 1)).toBe(t(2026, 11, 15));
    expect(stepMonths(t(2026, 11, 15), 1)).toBe(t(2027, 0, 15));
    expect(stepMonths(t(2026, 0, 15), -1)).toBe(t(2025, 11, 15));
  });

  it("clamps to the end of a shorter month", () => {
    expect(stepMonths(t(2027, 0, 31), 1)).toBe(t(2027, 1, 28));
  });
});

describe("the chart uses the pure helpers", () => {
  const src = readFileSync("components/seeded/roadmap/plan-trajectory-chart.tsx", "utf8");
  it("pointer events, scaled into viewBox units, with pan-y", () => {
    expect(src).toMatch(/clientXToViewBoxX\(e\.clientX, e\.currentTarget\.getBoundingClientRect\(\), W\)/);
    expect(src).toMatch(/onPointerMove=/);
    expect(src).toMatch(/onPointerDown=/);
    expect(src).not.toMatch(/onMouseMove=/);
    expect(src).toMatch(/touch-pan-y/);
  });
  it("reads values through chartValuesAt and announces them", () => {
    expect(src).toMatch(/chartValuesAt\(series, cursor\)/);
    expect(src).toMatch(/aria-live="polite"/);
    expect(src).toMatch(/tabIndex=\{0\}/);
  });
});
