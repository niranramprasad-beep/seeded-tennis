import { describe, expect, it } from "vitest";
import { buildRoadmap, calculateStreak, validateUtrEntryInput, type DailyCheckin } from "./plan";
import { getCurrentGrade, localDateKey } from "@/lib/time";
import { UTR_MAX, UTR_MIN } from "@/lib/tournament-fit";
import type { Player } from "@/lib/types";

// Far enough out that "current grade" stays comfortably below 12 no matter
// which calendar day this suite actually runs on.
const graduationYear = new Date().getFullYear() + 6;

const player: Player = {
  name: "Maya Chen",
  currentUTR: 8,
  graduationYear,
  commitmentDate: "2030-09-01",
  gender: "female",
  country: "United States",
  role: "player",
  targetSchoolSlugs: [],
  weaknesses: [],
  tournamentsPlayed: 0,
  tournamentsGoal: 12,
  onboarded: true,
  birthMonth: null,
  enrollmentTerm: null,
};

const GOAL = 11;

describe("buildRoadmap", () => {
  it("produces one checkpoint per remaining grade through 12th", () => {
    const years = buildRoadmap(player, GOAL);
    const currentGrade = Math.min(getCurrentGrade(player.graduationYear), 12);
    expect(years.length).toBe(12 - currentGrade);
    expect(years[years.length - 1].shortLabel).toBe("12th");
  });

  it("ramps to exactly the goal by the summer before senior year, never down", () => {
    const years = buildRoadmap(player, GOAL);
    expect(years[years.length - 1].utrTarget).toBe(GOAL);
    for (let i = 1; i < years.length; i++) {
      expect(years[i].utrTarget).toBeGreaterThanOrEqual(years[i - 1].utrTarget);
    }
  });

  it("puts every checkpoint on one straight line in time, at hundredth precision (C11)", () => {
    // The chart draws a straight dashed line through these; grade-step
    // progress put the first checkpoint a full 1/n of the gap away even
    // when it was months off.
    const now = new Date(2026, 10, 18);
    const p = { currentUTR: 5.95, graduationYear: 2029 };
    const years = buildRoadmap(p, 7.5, now);
    const goalT = new Date(2028, 5, 1).getTime();
    for (const y of years) {
      const t = new Date(y.calendarYear, 5, 1).getTime();
      const expected = 5.95 + (7.5 - 5.95) * ((t - now.getTime()) / (goalT - now.getTime()));
      expect(y.utrTarget).toBeCloseTo(expected, 2);
      expect(Math.round(y.utrTarget * 100) / 100).toBe(y.utrTarget);
    }
  });

  it("attaches real milestones for each grade, never an empty list", () => {
    const years = buildRoadmap(player, GOAL);
    for (const year of years) {
      expect(year.milestones.length).toBeGreaterThan(0);
    }
  });
});

describe("calculateStreak", () => {
  const todayKey = (d: Date) => localDateKey(d);
  const checkin = (date: string): DailyCheckin => ({ id: date, date, mood: 3, focusAreas: [], notes: "" });

  it("returns 0 with no check-ins", () => {
    expect(calculateStreak([])).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);

    const streak = calculateStreak([
      checkin(todayKey(now)),
      checkin(todayKey(yesterday)),
      checkin(todayKey(twoDaysAgo)),
    ]);
    expect(streak).toBe(3);
  });

  it("stops counting at the first gap", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const fourDaysAgo = new Date(now);
    fourDaysAgo.setDate(now.getDate() - 4);

    const streak = calculateStreak([checkin(todayKey(now)), checkin(todayKey(yesterday)), checkin(todayKey(fourDaysAgo))]);
    expect(streak).toBe(2);
  });

  // A streak only breaks after a missed FULL day. Before today's check-in,
  // a run ending yesterday is still alive and still counts.
  it("still counts a streak ending yesterday when today isn't logged yet", () => {
    const now = new Date();
    const daysAgo = (n: number) => {
      const d = new Date(now);
      d.setDate(now.getDate() - n);
      return todayKey(d);
    };
    expect(calculateStreak([checkin(daysAgo(1))])).toBe(1);
    expect(calculateStreak([checkin(daysAgo(1)), checkin(daysAgo(2)), checkin(daysAgo(3))])).toBe(3);
  });

  it("is 0 once a whole day has been missed", () => {
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    expect(calculateStreak([checkin(todayKey(twoDaysAgo)), checkin(todayKey(threeDaysAgo))])).toBe(0);
  });

  // Local dates, pinned clocks: one minute after local midnight and one
  // minute before it, plus a run that crosses a daylight-saving change
  // (US: 2026-03-08 / 2026-11-01; Auckland: 2026-04-05 / 2026-09-27). Run
  // under TZ=America/New_York and TZ=Pacific/Auckland as well as the
  // default — the keys are local, so each zone must agree with itself.
  it("uses LOCAL days at both edges of the day and across DST", () => {
    const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min);
    const key = (y: number, m: number, d: number) => localDateKey(new Date(y, m - 1, d, 12));

    // 00:01 on Nov 20, nothing logged today: Nov 17–19 still count.
    const run = [key(2026, 11, 19), key(2026, 11, 18), key(2026, 11, 17)].map(checkin);
    expect(calculateStreak(run, at(2026, 11, 20, 0, 1))).toBe(3);
    // 23:59 the same day — still not logged, still 3.
    expect(calculateStreak(run, at(2026, 11, 20, 23, 59))).toBe(3);
    // 00:01 on Nov 21: Nov 20 was missed entirely, so the streak is broken.
    expect(calculateStreak(run, at(2026, 11, 21, 0, 1))).toBe(0);
    // Logged today too → 4.
    expect(calculateStreak([...run, checkin(key(2026, 11, 20))], at(2026, 11, 20, 23, 59))).toBe(4);

    // Across both zones' DST changes: every day Feb 28 – Apr 10 logged.
    const days: DailyCheckin[] = [];
    for (let d = new Date(2026, 1, 28, 12); d <= new Date(2026, 3, 10, 12); d.setDate(d.getDate() + 1)) {
      days.push(checkin(localDateKey(d)));
    }
    expect(days.length).toBe(42);
    // Mar 10, logged today: Feb 28 + Mar 1–10, across the US change on Mar 8.
    expect(calculateStreak(days, at(2026, 3, 10, 8, 0))).toBe(11);
    // Apr 11, not logged yet: the whole run, across Auckland's on Apr 5.
    expect(calculateStreak(days, at(2026, 4, 11, 8, 0))).toBe(42);
  });
});

describe("validateUtrEntryInput", () => {
  const base = { utr: 9, recordedAt: "2026-01-15", note: "Starting UTR" };

  it("accepts a valid entry", () => {
    expect(validateUtrEntryInput(base)).toBeNull();
  });

  it("accepts an entry with no note", () => {
    expect(validateUtrEntryInput({ utr: 9, recordedAt: "2026-01-15" })).toBeNull();
  });

  it("rejects a UTR below UTR_MIN", () => {
    expect(validateUtrEntryInput({ ...base, utr: UTR_MIN - 0.1 })).toMatch(/UTR must be between/);
  });

  it("rejects a UTR above UTR_MAX", () => {
    expect(validateUtrEntryInput({ ...base, utr: UTR_MAX + 0.1 })).toMatch(/UTR must be between/);
  });

  it("accepts the boundary values", () => {
    expect(validateUtrEntryInput({ ...base, utr: UTR_MIN })).toBeNull();
    expect(validateUtrEntryInput({ ...base, utr: UTR_MAX })).toBeNull();
  });

  it("rejects a non-finite UTR", () => {
    expect(validateUtrEntryInput({ ...base, utr: NaN })).toMatch(/UTR must be between/);
  });

  it("rejects a missing date", () => {
    expect(validateUtrEntryInput({ ...base, recordedAt: "" })).toBe("Enter a valid date.");
  });

  it("rejects an unparseable date", () => {
    expect(validateUtrEntryInput({ ...base, recordedAt: "not-a-date" })).toBe("Enter a valid date.");
  });
});
