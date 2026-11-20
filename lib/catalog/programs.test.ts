import { describe, expect, it } from "vitest";
import { coverageTable, legacyCoverageTable } from "./coverage";
import {
  bandableRange,
  currentRange,
  daysSince,
  finalYearDisplay,
  formatIsoDate,
  LEVEL_NOT_RATED,
  rangeDisplay,
  type ImportedProgram,
  type TeamRange,
} from "./programs";
import { assertSafeImportTarget, projectRefFromJwtKey, projectRefFromUrl } from "./import-target";
import { assemblePrograms, teamRangeInputError } from "@/lib/db/programs";

const NOW = new Date(2026, 10, 19, 12); // local 2026-11-19

function range(over: Partial<TeamRange> = {}): TeamRange {
  return {
    low: 6,
    middle: 7,
    high: 8,
    sourceType: "hand_curated",
    source: "Test source",
    sourceUrl: null,
    sourceDate: "2026-11-01",
    createdAt: "2026-11-01T10:00:00Z",
    ...over,
  };
}

function program(over: Partial<ImportedProgram> = {}): ImportedProgram {
  return {
    id: "p1",
    slug: "test-college-a-women",
    school: "Test College A",
    gender: "women",
    division: "D3",
    conference: "NESCAC",
    rosterUrl: null,
    seasonShown: "2026-27",
    seasonStartYear: 2026,
    playersListed: 8,
    unknownClassCount: 0,
    sourceDate: "2026-11-19",
    sourceUrl: null,
    classCounts: [
      { classYear: 2027, players: 3 },
      { classYear: 2028, players: 2 },
      { classYear: 2030, players: 3 },
    ],
    ranges: [],
    ...over,
  };
}

describe("no range, no level — the gate", () => {
  it("a program with no range is 'Level not rated yet' and never bandable", () => {
    const p = program();
    expect(bandableRange(p, NOW)).toBeNull();
    expect(rangeDisplay(p, NOW)).toMatchObject({ headline: LEVEL_NOT_RATED, rated: false, sourceLine: null });
  });

  it("a current, sourced range is bandable as floor = low, middle = middle", () => {
    expect(bandableRange(program({ ranges: [range()] }), NOW)).toEqual({ minCompetitiveUTR: 6, avgRosterUTR: 7 });
  });

  it("a range over a year old is shown, greyed, and kept out of bands", () => {
    const p = program({ ranges: [range({ sourceDate: "2025-11-01" })] });
    expect(bandableRange(p, NOW)).toBeNull();
    const d = rangeDisplay(p, NOW);
    expect(d.stale).toBe(true);
    expect(d.rated).toBe(false);
    expect(d.sourceLine).toMatch(/over a year old, so not used for fit/);
  });

  it("an inconsistent or unsourced range is not a level at all", () => {
    for (const bad of [
      range({ low: 8, middle: 7 }),
      range({ high: 17 }),
      range({ source: "  " }),
      range({ sourceDate: "Nov 2026" }),
      range({ low: Number.NaN }),
    ]) {
      expect(bandableRange(program({ ranges: [bad] }), NOW)).toBeNull();
      expect(rangeDisplay(program({ ranges: [bad] }), NOW).headline).toBe(LEVEL_NOT_RATED);
    }
  });

  it("the newest range wins, by source date then entry time", () => {
    const older = range({ low: 5, sourceDate: "2026-09-01" });
    const newer = range({ low: 6.5, sourceDate: "2026-10-01", createdAt: "2026-10-01T00:00:00Z" });
    const sameDayLater = range({ low: 6.6, sourceDate: "2026-10-01", createdAt: "2026-10-02T00:00:00Z" });
    expect(currentRange({ ranges: [older, newer, sameDayLater] })?.low).toBe(6.6);
  });

  it("shows the source and date beside the number", () => {
    const d = rangeDisplay(program({ ranges: [range({ sourceUrl: "https://example.com/x" })] }), NOW);
    expect(d.headline).toBe("Team UTR 6.00–8.00 · middle 7.00");
    expect(d.sourceLine).toBe("Hand-curated from public sources: Test source, Nov 1, 2026");
    expect(d.sourceUrl).toBe("https://example.com/x");
  });
});

describe("final-year line", () => {
  it("carries the roster season and the date it was read", () => {
    const d = finalYearDisplay(program(), NOW);
    expect(d.text).toBe("3 seniors on the 2026-27 roster, checked Nov 19, 2026");
    expect(d.notes).toEqual([]);
  });

  it("says plainly when the roster is last season's", () => {
    const p = program({ seasonShown: "2025-26", seasonStartYear: 2025, classCounts: [{ classYear: 2026, players: 1 }] });
    const d = finalYearDisplay(p, NOW);
    expect(d.text).toBe("1 senior on the 2025-26 roster, checked Nov 19, 2026");
    expect(d.notes[0]).toMatch(/This is the 2025-26 roster, not the current season's\. Its seniors have already finished\./);
  });

  it("warns that unreadable class labels can make the count low", () => {
    const d = finalYearDisplay(program({ unknownClassCount: 2 }), NOW);
    expect(d.notes).toContain("2 of 8 listed players had a class year we could not read, so the count may be low.");
  });

  it("an empty roster is Not tracked, never zero seniors", () => {
    const d = finalYearDisplay(program({ playersListed: 0, classCounts: [] }), NOW);
    expect(d.text).toBe("Not tracked");
    expect(d.tracked).toBe(false);
  });
});

describe("dates do not move with the time zone", () => {
  it("formatIsoDate reads the string, not a Date", () => {
    expect(formatIsoDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatIsoDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("daysSince counts calendar days from local today", () => {
    expect(daysSince("2026-11-19", NOW)).toBe(0);
    expect(daysSince("2026-11-18", new Date(2026, 10, 19, 0, 5))).toBe(1);
    expect(daysSince("2025-11-19", NOW)).toBe(365);
  });
});

describe("coverage counts only rated programs", () => {
  it("with no ranges at all, every sample player sees zero Target/Likely from imports", () => {
    const rows = coverageTable([program(), program({ gender: "men" })], NOW);
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.target + r.likely).toBe(0);
      expect(r.ratedPrograms).toBe(0);
      expect(r.unratedPrograms).toBe(1);
    }
  });

  it("bands a rated program through the one fit path", () => {
    const rated = program({ ranges: [range({ low: 6, middle: 7, high: 8 })] });
    const rows = coverageTable([rated, program()], NOW);
    const w = (utr: number) => rows.find((r) => r.gender === "women" && r.utr === utr)!;
    expect(w(5)).toMatchObject({ target: 0, likely: 0, ratedPrograms: 1, unratedPrograms: 1 });
    expect(w(7)).toMatchObject({ target: 0, likely: 1 }); // at the middle = Likely
    expect(w(9)).toMatchObject({ target: 0, likely: 1 });
    expect(coverageTable([program({ ranges: [range({ low: 6.5, middle: 7.5 })] })], NOW).find((r) => r.gender === "women" && r.utr === 7)).toMatchObject({ target: 1, likely: 0 });
  });

  it("legacy coverage is computed from the catalog it is given", () => {
    const rows = legacyCoverageTable([{ gender: "men", minCompetitiveUTR: 9.3, avgRosterUTR: 10 }]);
    expect(rows.find((r) => r.gender === "men" && r.utr === 9)).toMatchObject({ programs: 1, target: 0, likely: 0 });
    expect(rows.find((r) => r.gender === "women" && r.utr === 9)).toMatchObject({ programs: 0 });
  });
});

describe("the importer refuses production", () => {
  const STAGING = "https://gnlcpnsweqbtwpaqhqqg.supabase.co";
  const PROD = "https://tfpjssmhiptbwigarxpx.supabase.co";
  const jwt = (ref: string) =>
    `x.${Buffer.from(JSON.stringify({ ref, role: "service_role" })).toString("base64url")}.y`;

  it("accepts staging", () => {
    expect(assertSafeImportTarget({ url: STAGING, key: "sb_secret_test" })).toBe("gnlcpnsweqbtwpaqhqqg");
    expect(assertSafeImportTarget({ url: STAGING, key: jwt("gnlcpnsweqbtwpaqhqqg") })).toBe("gnlcpnsweqbtwpaqhqqg");
  });

  it("refuses production by URL, by key, and even when 'allowed'", () => {
    expect(() => assertSafeImportTarget({ url: PROD, key: "sb_secret_test" })).toThrow(/PRODUCTION/);
    expect(() => assertSafeImportTarget({ url: PROD, key: "k", allowRef: "tfpjssmhiptbwigarxpx" })).toThrow(/PRODUCTION/);
    expect(() => assertSafeImportTarget({ url: STAGING, key: jwt("tfpjssmhiptbwigarxpx") })).toThrow(/PRODUCTION/);
  });

  it("refuses an unknown project unless named, and a key for another project", () => {
    const other = "https://abcdefghijklmnopqrst.supabase.co";
    expect(() => assertSafeImportTarget({ url: other, key: "k" })).toThrow(/not the staging project/);
    expect(assertSafeImportTarget({ url: other, key: "k", allowRef: "abcdefghijklmnopqrst" })).toBe("abcdefghijklmnopqrst");
    expect(() => assertSafeImportTarget({ url: STAGING, key: jwt("abcdefghijklmnopqrst") })).toThrow(/key is for/);
  });

  it("refuses missing settings and unreadable URLs", () => {
    expect(() => assertSafeImportTarget({ url: "", key: "k" })).toThrow(/SUPABASE_URL/);
    expect(() => assertSafeImportTarget({ url: STAGING, key: "" })).toThrow(/SERVICE_ROLE_KEY/);
    expect(() => assertSafeImportTarget({ url: "http://localhost:54321", key: "k" })).toThrow(/cannot read/);
    expect(projectRefFromUrl("not a url")).toBeNull();
    expect(projectRefFromJwtKey("sb_secret_abc")).toBeNull();
  });
});

describe("database rows -> programs", () => {
  it("joins counts and ranges and drops values outside the enums", () => {
    const base = {
      slug: "s", school: "Test College A", conference: "NESCAC", roster_url: null, season_shown: "2026-27",
      season_start_year: 2026, players_listed: 2, unknown_class_count: 0, source_date: "2026-11-19", source_url: null,
    };
    const out = assemblePrograms(
      [
        { ...base, id: "a", gender: "women", division: "D3" },
        { ...base, id: "b", gender: "coed", division: "D3" },
        { ...base, id: "c", gender: "men", division: "D9" },
      ],
      [{ program_id: "a", class_year: 2027, players: 2 }],
      [
        { program_id: "a", low: 6, middle: 7, high: 8, source_type: "hand_curated", source: "Test source", source_url: null, source_date: "2026-11-01", created_at: "2026-11-01T00:00:00Z" },
        { program_id: "a", low: 6, middle: 7, high: 8, source_type: "scraped", source: "x", source_url: null, source_date: "2026-11-01", created_at: "2026-11-01T00:00:00Z" },
      ]
    );
    expect(out.map((p) => p.id)).toEqual(["a"]);
    expect(out[0].classCounts).toEqual([{ classYear: 2027, players: 2 }]);
    expect(out[0].ranges).toHaveLength(1);
  });
});

describe("admin form input check", () => {
  const ok = {
    programId: "p1", low: 6, middle: 7, high: 8, sourceType: "hand_curated" as const,
    source: "Test source", sourceUrl: null, sourceDate: "2026-11-19",
  };
  it("accepts a complete range", () => {
    expect(teamRangeInputError(ok, "2026-11-19")).toBeNull();
  });
  it("names each problem", () => {
    expect(teamRangeInputError({ ...ok, programId: "" }, "2026-11-19")).toMatch(/program/);
    expect(teamRangeInputError({ ...ok, low: 9 }, "2026-11-19")).toMatch(/at or below/);
    expect(teamRangeInputError({ ...ok, high: 17 }, "2026-11-19")).toMatch(/16\.50/);
    expect(teamRangeInputError({ ...ok, source: "x" }, "2026-11-19")).toMatch(/where the range came from/);
    expect(teamRangeInputError({ ...ok, sourceUrl: "ftp://x" }, "2026-11-19")).toMatch(/http/);
    expect(teamRangeInputError({ ...ok, sourceDate: "2026-11-20" }, "2026-11-19")).toMatch(/future/);
    expect(teamRangeInputError({ ...ok, middle: Number.NaN }, "2026-11-19")).toMatch(/all three/);
  });
});
