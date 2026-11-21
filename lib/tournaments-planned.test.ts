import { describe, expect, it } from "vitest";
import {
  SEASON_KEY_PATTERN,
  TOURNAMENTS_PLANNED_MAX,
  formatTournamentsPlanned,
  isSeasonKey,
  parseTournamentsPlannedText,
  plannedThisSeason,
  stampTournamentsPlanned,
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

describe("a planned count belongs to one season (049's tournaments_planned_season)", () => {
  const FALL = new Date(2026, 10, 20); // fall-2026
  const WINTER = new Date(2027, 0, 10); // winter-2027

  it("stamps the season it is set in, and clears both together", () => {
    expect(stampTournamentsPlanned(8, FALL)).toEqual({ tournamentsPlanned: 8, tournamentsPlannedSeason: "fall-2026" });
    expect(stampTournamentsPlanned(null, FALL)).toEqual({ tournamentsPlanned: null, tournamentsPlannedSeason: null });
  });

  it("a value for the current season shows", () => {
    expect(plannedThisSeason({ tournamentsPlanned: 8, tournamentsPlannedSeason: "fall-2026" }, FALL)).toBe(8);
    expect(plannedThisSeason({ tournamentsPlanned: 0, tournamentsPlannedSeason: "fall-2026" }, FALL)).toBe(0);
  });

  it("a STALE season renders as not set — a fall plan is not shown in winter", () => {
    const fallPlan = { tournamentsPlanned: 8, tournamentsPlannedSeason: "fall-2026" };
    expect(plannedThisSeason(fallPlan, WINTER)).toBeNull();
    expect(formatTournamentsPlanned(plannedThisSeason(fallPlan, WINTER))).toBe("Not set");
    // Last year's fall is not this fall either.
    expect(plannedThisSeason({ tournamentsPlanned: 8, tournamentsPlannedSeason: "fall-2025" }, FALL)).toBeNull();
  });

  it("a count with no season (the old app's 12 in the deploy window) is not set", () => {
    expect(plannedThisSeason({ tournamentsPlanned: 12, tournamentsPlannedSeason: null }, FALL)).toBeNull();
  });

  it("the season shape matches seasonKey() and 049's CHECK", () => {
    expect(isSeasonKey(seasonKey(FALL))).toBe(true);
    expect(isSeasonKey(seasonKey(WINTER))).toBe(true);
    expect(isSeasonKey("autumn-2026")).toBe(false);
    expect(isSeasonKey("fall-26")).toBe(false);
    const sql = readFileSync(join("supabase", "migrations", "049_tournaments_planned_not_invented.sql"), "utf8");
    expect(sql).toContain("add column if not exists tournaments_planned_season text");
    expect(sql).toContain(`'${SEASON_KEY_PATTERN.source}'`);
  });
});
