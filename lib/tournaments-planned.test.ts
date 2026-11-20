import { describe, expect, it } from "vitest";
import {
  TOURNAMENTS_PLANNED_MAX,
  countPlayedThisSeason,
  formatTournamentsPlanned,
  parseTournamentsPlannedText,
  toTournamentsPlannedOrNull,
} from "./tournaments-planned";
import { seasonKey } from "./time";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("tournaments planned this season", () => {
  it("blank is Not set, not zero and not an error", () => {
    expect(parseTournamentsPlannedText("")).toEqual({ value: null, error: null });
    expect(parseTournamentsPlannedText("   ")).toEqual({ value: null, error: null });
    expect(formatTournamentsPlanned(null)).toBe("Not set");
    expect(formatTournamentsPlanned(0)).toBe("0");
  });

  it("accepts whole numbers 0–60 and nothing else", () => {
    expect(parseTournamentsPlannedText("0").value).toBe(0);
    expect(parseTournamentsPlannedText(" 8 ").value).toBe(8);
    expect(parseTournamentsPlannedText("60").value).toBe(60);
    for (const bad of ["61", "-1", "8.5", "1e1", "abc", "100"]) {
      const r = parseTournamentsPlannedText(bad);
      expect(r.value).toBeNull();
      expect(r.error).not.toBeNull();
    }
  });

  it("a stored value out of range reads as Not set, never coerced", () => {
    expect(toTournamentsPlannedOrNull(null)).toBeNull();
    expect(toTournamentsPlannedOrNull(undefined)).toBeNull();
    expect(toTournamentsPlannedOrNull(12)).toBe(12);
    expect(toTournamentsPlannedOrNull(-1)).toBeNull();
    expect(toTournamentsPlannedOrNull(61)).toBeNull();
    expect(toTournamentsPlannedOrNull(2.5)).toBeNull();
  });

  it("the ceiling matches migration 049's CHECK", () => {
    const sql = readFileSync(join("supabase", "migrations", "049_tournaments_planned_not_invented.sql"), "utf8");
    expect(sql).toContain(`tournaments_goal between 0 and ${TOURNAMENTS_PLANNED_MAX}`);
    expect(sql).toMatch(/alter column tournaments_goal drop not null/);
    expect(sql).toMatch(/alter column tournaments_goal drop default/);
  });
});

describe("season keys", () => {
  it("winter spans the new year as ONE season", () => {
    expect(seasonKey(new Date(2026, 11, 15))).toBe("winter-2027");
    expect(seasonKey(new Date(2027, 0, 10))).toBe("winter-2027");
    expect(seasonKey(new Date(2027, 1, 28))).toBe("winter-2027");
    expect(seasonKey(new Date(2027, 2, 1))).toBe("spring-2027");
  });

  it("last year's fall is not this fall", () => {
    expect(seasonKey(new Date(2025, 9, 1))).not.toBe(seasonKey(new Date(2026, 9, 1)));
  });
});

describe("played this season comes from tournament entries", () => {
  const NOW = new Date(2026, 10, 20); // fall 2026
  const e = (status: "saved" | "entered" | "played", eventDate: string) => ({ status, eventDate });

  it("counts only Played entries dated in the current season", () => {
    const entries = [
      e("played", "2026-09-12"), // fall 2026
      e("played", "2026-11-01"), // fall 2026
      e("entered", "2026-10-05"), // not played
      e("saved", "2026-10-06"), // planning
      e("played", "2025-10-01"), // last fall
      e("played", "2026-07-30"), // summer
      e("played", "2026-12-01"), // winter
    ];
    expect(countPlayedThisSeason(entries, NOW)).toBe(2);
  });

  it("zero entries is zero played — a real count, not a placeholder", () => {
    expect(countPlayedThisSeason([], NOW)).toBe(0);
  });

  it("reads event dates as local calendar days at the season edge", () => {
    // Aug 1 is the first day of fall; parsed as UTC it would be Jul 31 west of UTC.
    expect(countPlayedThisSeason([e("played", "2026-08-01")], NOW)).toBe(1);
  });
});
