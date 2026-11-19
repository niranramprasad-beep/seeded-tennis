import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { groupByDate, weekOffsetForDate } from "./grid-math";

// /events, sweep C1: Week showed 0 sessions while Month showed dots on every
// day. Month grouped sessions by WEEKDAY (a "recurring template") and Week by
// real date, so the same old generated rows were invisible in one view and
// repeated across every month in the other. Both views now render from one
// `groupByDate(sessions)`.

const CARD = "components/seeded/events/events-calendar-card.tsx";

describe("one source of sessions for Week and Month", () => {
  it("groupByDate keys by the stored date and sorts each day by start time", () => {
    const map = groupByDate([
      { id: "b", date: "2026-11-18", startTime: "17:00", duration: 60 },
      { id: "a", date: "2026-11-18", startTime: "07:30", duration: 30 },
      { id: "c", date: "2026-11-25", startTime: "07:30", duration: 30 },
      { id: "d", date: "", startTime: "07:30", duration: 30 },
    ]);
    expect(map.get("2026-11-18")?.map((s) => s.id)).toEqual(["a", "b"]);
    // A session a week later is on ITS date only — not on every Wednesday.
    expect(map.get("2026-11-25")?.map((s) => s.id)).toEqual(["c"]);
    expect([...map.keys()].sort()).toEqual(["2026-11-18", "2026-11-25"]);
  });

  it("the calendar card groups once, by date, and hands the same map to every view", () => {
    const src = readFileSync(CARD, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src.match(/groupByDate\(/g)?.length).toBe(1);
    for (const view of ["WeekAgenda", "WeekGrid", "MonthGrid"]) {
      expect(src, `${view} must render from byDate`).toMatch(new RegExp(`<${view}[^>]*byDate=\\{byDate\\}`));
    }
    // The Month bug: grouping by weekday.
    expect(src).not.toMatch(/\.day\b/);
    expect(src).not.toMatch(/sessionsByDay/);
  });

  it("weekOffsetForDate inverts dateForWeekday across a month and a DST change", () => {
    const today = new Date(2026, 10, 18); // Wed 18 Nov 2026
    expect(weekOffsetForDate("2026-11-16", today)).toBe(0); // Monday this week
    expect(weekOffsetForDate("2026-11-22", today)).toBe(0); // Sunday this week
    expect(weekOffsetForDate("2026-11-23", today)).toBe(1);
    expect(weekOffsetForDate("2026-10-26", today)).toBe(-3); // across the US DST end (Nov 1)
  });
});
