import { describe, expect, it } from "vitest";
import { buildRoadmap, calculateStreak, type DailyCheckin } from "./plan";
import { getCurrentGrade, localDateKey } from "@/lib/time";
import type { Player, School } from "@/lib/types";

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
};

const target: Pick<School, "minCompetitiveUTR"> = { minCompetitiveUTR: 11 };

describe("buildRoadmap", () => {
  it("produces one checkpoint per remaining grade through 12th", () => {
    const years = buildRoadmap(player, [target]);
    const currentGrade = Math.min(getCurrentGrade(player.graduationYear), 12);
    expect(years.length).toBe(12 - currentGrade);
    expect(years[years.length - 1].shortLabel).toBe("12th");
  });

  it("ramps the UTR target up to the highest target school's minCompetitiveUTR by grade 12", () => {
    const years = buildRoadmap(player, [target, { minCompetitiveUTR: 9.5 }]);
    const last = years[years.length - 1];
    expect(last.utrTarget).toBeCloseTo(11, 1);
    // monotonically non-decreasing toward the goal
    for (let i = 1; i < years.length; i++) {
      expect(years[i].utrTarget).toBeGreaterThanOrEqual(years[i - 1].utrTarget);
    }
  });

  it("falls back to current UTR + 2.5 (capped at the gender ceiling) with no target schools", () => {
    const years = buildRoadmap(player, []);
    const last = years[years.length - 1];
    expect(last.utrTarget).toBeCloseTo(player.currentUTR + 2.5, 1);
  });

  it("caps the fallback goal at the realistic ceiling for the player's gender", () => {
    const nearCeiling = { ...player, currentUTR: 12 }; // 12 + 2.5 = 14.5 > female ceiling (12.5)
    const years = buildRoadmap(nearCeiling, []);
    const last = years[years.length - 1];
    expect(last.utrTarget).toBeLessThanOrEqual(12.5);
  });

  it("attaches real milestones for each grade, never an empty list", () => {
    const years = buildRoadmap(player, [target]);
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

  it("is 0 when today hasn't been logged, even with a long prior streak", () => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    expect(calculateStreak([checkin(todayKey(yesterday))])).toBe(0);
  });
});
