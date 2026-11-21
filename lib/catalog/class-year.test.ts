import { describe, expect, it } from "vitest";
import {
  currentSeasonStartYear,
  finalYearClass,
  graduationClassYear,
  parseRosterSeason,
  parseSeason,
  plausibleClassYear,
  seasonStartYearForIsoDate,
} from "./class-year";

// Catalog phase 1. Every roster prints class years its own way, and the
// "final-year players" count is only honest if every spelling lands on the
// same class — and anything ambiguous lands on null (counted as unknown),
// never on the nearest guess.

const S = 2026; // a 2026-27 roster

describe("graduationClassYear — year-of-study labels on a 2026-27 roster", () => {
  const cases: [string, number][] = [
    // first year
    ["Fr", 2030], ["Fr.", 2030], ["FR", 2030], ["fr.", 2030], ["Fy", 2030], ["FY", 2030],
    ["Freshman", 2030], ["First-Year", 2030], ["First Year", 2030], ["first-year", 2030],
    ["1st", 2030], ["1st Year", 2030], ["1st-year", 2030],
    // second
    ["So", 2029], ["So.", 2029], ["Soph", 2029], ["Soph.", 2029], ["Sophomore", 2029],
    ["2nd", 2029], ["Second-Year", 2029],
    // third
    ["Jr", 2028], ["Jr.", 2028], ["JR.", 2028], ["Junior", 2028], ["3rd", 2028], ["Third-Year", 2028],
    // fourth
    ["Sr", 2027], ["Sr.", 2027], ["Senior", 2027], ["4th", 2027], ["Fourth-Year", 2027],
    // final season beyond the fourth
    ["Gr", 2027], ["Gr.", 2027], ["GS", 2027], ["Grad", 2027], ["Graduate", 2027],
    ["Graduate Student", 2027], ["5th", 2027], ["5th Year", 2027], ["5th-Year", 2027],
    ["Fifth-Year", 2027], ["6th", 2027], ["Sixth-Year", 2027],
  ];
  for (const [label, year] of cases) {
    it(`"${label}" -> ${year}`, () => {
      expect(graduationClassYear(label, S)).toBe(year);
    });
  }

  it("ignores surrounding whitespace, odd spacing and full-width forms", () => {
    expect(graduationClassYear("  Jr.  ", S)).toBe(2028);
    expect(graduationClassYear("First   Year", S)).toBe(2030);
    expect(graduationClassYear("ＦＲ", S)).toBe(2030); // NFKC
    expect(graduationClassYear("First–Year", S)).toBe(2030); // en dash
  });
});

describe("graduationClassYear — redshirt labels map by eligibility year", () => {
  const cases: [string, number][] = [
    ["R-Fr", 2030], ["R-Fr.", 2030], ["RS Fr", 2030], ["RS-Fr", 2030], ["RFr", 2030], ["RSFr", 2030],
    ["Redshirt Freshman", 2030], ["R-So", 2029], ["RS-So", 2029], ["Redshirt Sophomore", 2029],
    ["R-Jr", 2028], ["Redshirt Junior", 2028], ["R-Sr", 2027], ["RS Sr", 2027],
    ["Fr (RS)", 2030], ["So RS", 2029],
  ];
  for (const [label, year] of cases) {
    it(`"${label}" -> ${year}`, () => {
      expect(graduationClassYear(label, S)).toBe(year);
    });
  }

  it("does not invent a meaning for 'redshirt graduate'", () => {
    expect(graduationClassYear("R-Gr", S)).toBeNull();
    expect(graduationClassYear("Redshirt Graduate", S)).toBeNull();
  });
});

describe("graduationClassYear — explicit class years", () => {
  it("reads '30, 2030 and 'Class of 2030' as class 2030", () => {
    expect(graduationClassYear("'30", S)).toBe(2030);
    expect(graduationClassYear("’30", S)).toBe(2030); // curly apostrophe
    expect(graduationClassYear("2030", S)).toBe(2030);
    expect(graduationClassYear("Class of 2030", S)).toBe(2030);
    expect(graduationClassYear("c/o 2028", S)).toBe(2028);
    expect(graduationClassYear("'27", S)).toBe(2027);
  });

  it("refuses a class year no player on this roster can hold", () => {
    // 2026 graduated before the 2026-27 season began; 2031 has not enrolled.
    expect(graduationClassYear("2026", S)).toBeNull();
    expect(graduationClassYear("'26", S)).toBeNull();
    expect(graduationClassYear("2031", S)).toBeNull();
    expect(graduationClassYear("1999", S)).toBeNull();
  });

  it("is relative to the roster's season, not to today", () => {
    // The same label on last season's roster is a year earlier.
    expect(graduationClassYear("Sr", 2025)).toBe(2026);
    expect(graduationClassYear("Fr", 2025)).toBe(2029);
    expect(graduationClassYear("2026", 2025)).toBe(2026);
  });
});

describe("graduationClassYear — unknown stays unknown", () => {
  const unknown = [
    "", "   ", "—", "-", "?", "N/A", "TBD", "1", "4", "5",
    "Fr/So", "Fr./So.", "Senior?", "Freshmen and sophomores", "Redshirt", "RS",
    "Walk-on", "Junior College", "Sr-ish", "Fresh", "S", "J",
  ];
  for (const label of unknown) {
    it(`"${label}" -> null`, () => {
      expect(graduationClassYear(label, S)).toBeNull();
    });
  }

  it("null/undefined label and a nonsense season are unknown", () => {
    expect(graduationClassYear(null, S)).toBeNull();
    expect(graduationClassYear(undefined, S)).toBeNull();
    expect(graduationClassYear("Sr", Number.NaN)).toBeNull();
    expect(graduationClassYear("Sr", 1850)).toBeNull();
    expect(graduationClassYear("Sr", 2026.5)).toBeNull();
  });
});

describe("plausibleClassYear / finalYearClass", () => {
  it("window is season start + 1 through + 4", () => {
    expect(plausibleClassYear(2026, S)).toBe(false);
    expect(plausibleClassYear(2027, S)).toBe(true);
    expect(plausibleClassYear(2030, S)).toBe(true);
    expect(plausibleClassYear(2031, S)).toBe(false);
  });

  it("the final-year class of a 2026-27 roster is 2027", () => {
    expect(finalYearClass(2026)).toBe(2027);
    expect(graduationClassYear("Sr", 2026)).toBe(finalYearClass(2026));
    expect(graduationClassYear("Gr", 2026)).toBe(finalYearClass(2026));
  });
});

describe("parseSeason", () => {
  it("accepts the usual spellings and canonicalises them", () => {
    expect(parseSeason("2026-27")).toEqual({ startYear: 2026, label: "2026-27" });
    expect(parseSeason("2026–27")).toEqual({ startYear: 2026, label: "2026-27" });
    expect(parseSeason("2026-2027")).toEqual({ startYear: 2026, label: "2026-27" });
    expect(parseSeason("2025/26")).toEqual({ startYear: 2025, label: "2025-26" });
    expect(parseSeason(" 2025 - 26 ")).toEqual({ startYear: 2025, label: "2025-26" });
    expect(parseSeason("2099-00")).toEqual({ startYear: 2099, label: "2099-00" });
  });

  it("rejects ambiguous or inconsistent seasons", () => {
    expect(parseSeason("2026")).toBeNull();
    expect(parseSeason("2026-28")).toBeNull();
    expect(parseSeason("2026-2026")).toBeNull();
    expect(parseSeason("Fall 2026")).toBeNull();
    expect(parseSeason("")).toBeNull();
    expect(parseSeason(null)).toBeNull();
  });
});

describe("the season under way on a date", () => {
  it("switches in August, from local date parts", () => {
    expect(currentSeasonStartYear(new Date(2026, 10, 19))).toBe(2026);
    expect(currentSeasonStartYear(new Date(2026, 6, 31))).toBe(2025);
    expect(currentSeasonStartYear(new Date(2026, 7, 1))).toBe(2026);
    expect(currentSeasonStartYear(new Date(2027, 0, 5))).toBe(2026);
  });

  it("does the same from a yyyy-mm-dd string, with no Date parsing", () => {
    expect(seasonStartYearForIsoDate("2026-11-19")).toBe(2026);
    expect(seasonStartYearForIsoDate("2026-07-31")).toBe(2025);
    expect(seasonStartYearForIsoDate("2026-08-01")).toBe(2026);
    expect(seasonStartYearForIsoDate("Nov 19")).toBeNull();
    expect(seasonStartYearForIsoDate("2026-13-01")).toBeNull();
  });
});

describe("labels found on the real 2026-27 rosters", () => {
  const S = 2026;
  it("reads a year label and an explicit year written together when they agree", () => {
    expect(graduationClassYear("Fr. '30", S)).toBe(2030);
    expect(graduationClassYear("So. '29", S)).toBe(2029);
    expect(graduationClassYear("Jr. '28", S)).toBe(2028);
    expect(graduationClassYear("Sr. '27", S)).toBe(2027);
    expect(graduationClassYear("Sr. 2027", S)).toBe(2027);
  });

  it("refuses a combined label that contradicts itself", () => {
    expect(graduationClassYear("Fr. '28", S)).toBeNull();
    expect(graduationClassYear("Sr. '30", S)).toBeNull();
    expect(graduationClassYear("Fr/So '30", S)).toBeNull();
  });

  it("still refuses a redshirt marker with no year", () => {
    expect(graduationClassYear("Rs.", S)).toBeNull();
  });

  it("reads the other spellings the file uses", () => {
    expect(graduationClassYear("Fy.", S)).toBe(2030);
    expect(graduationClassYear("FY", S)).toBe(2030);
    expect(graduationClassYear("First Year", S)).toBe(2030);
    expect(graduationClassYear("1st", S)).toBe(2030);
    expect(graduationClassYear("4th", S)).toBe(2027);
    expect(graduationClassYear("5th", S)).toBe(2027);
    expect(graduationClassYear("R-Sr.", S)).toBe(2027);
    expect(graduationClassYear("Gr.", S)).toBe(2027);
  });
});

describe("parseRosterSeason", () => {
  it("reads a single spring year as the season that spring ends", () => {
    expect(parseRosterSeason("2026")).toEqual({ startYear: 2025, label: "2025-26", fromSpringYear: true });
    expect(parseRosterSeason("Spring 2026")).toEqual({ startYear: 2025, label: "2025-26", fromSpringYear: true });
  });
  it("is parseSeason for everything else, and parseSeason stays strict", () => {
    expect(parseRosterSeason("2026-27")).toEqual({ startYear: 2026, label: "2026-27" });
    expect(parseRosterSeason("2025-2026")).toEqual({ startYear: 2025, label: "2025-26" });
    expect(parseRosterSeason("Fall 2026")).toBeNull();
    expect(parseRosterSeason("")).toBeNull();
    expect(parseRosterSeason(null)).toBeNull();
    expect(parseSeason("2026")).toBeNull();
  });
});
