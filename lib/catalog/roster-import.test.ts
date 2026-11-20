import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFERENCE_DIVISION,
  missingPrograms,
  parseExpectedTsv,
  parseRosterTsv,
  programSlug,
  RosterFileError,
  ROSTER_COLUMNS,
  slugify,
} from "./roster-import";

// The fixture is fake from top to bottom: "Test College A", "Player 1",
// "Test Town", example.com URLs. The real input
// (docs/data/official_rosters_2026-27.tsv) has not been added to the repo.
const FIXTURE = readFileSync(join(__dirname, "testdata", "rosters-fixture.tsv"), "utf8");
const EXPECTED = readFileSync(join(__dirname, "testdata", "expected-fixture.tsv"), "utf8");
const HEADER = ROSTER_COLUMNS.join("\t");

describe("parseRosterTsv on the fake fixture", () => {
  const r = parseRosterTsv(FIXTURE);
  const bySlug = Object.fromEntries(r.programs.map((p) => [p.slug, p]));

  it("reads every row and reports the one bad one by line number", () => {
    expect(r.rowsRead).toBe(23);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].line).toBe(24);
    expect(r.errors[0].reason).toMatch(/unknown conference "Test Conference"/);
    expect(r.failed).toBe(false); // 1/23 is under 5%
  });

  it("groups into one program per school and gender, with the conference's division", () => {
    expect(Object.keys(bySlug).sort()).toEqual([
      "test-college-a-men",
      "test-college-a-women",
      "test-college-b-men",
      "test-college-b-women",
    ]);
    // Test College C has a row but no players: not imported, reported.
    expect(r.notRetrieved).toEqual([
      { slug: "test-college-c-men", conference: "Patriot League", school: "Test College C", gender: "men" },
    ]);
    expect(bySlug["test-college-a-women"].division).toBe("D3");
    expect(bySlug["test-college-b-women"].division).toBe("D1");
  });

  it("counts classes relative to the roster's own season", () => {
    const aw = bySlug["test-college-a-women"]; // 2026-27
    expect(aw.seasonShown).toBe("2026-27");
    expect(aw.classCounts).toEqual({ 2030: 1, 2029: 1, 2028: 1, 2027: 2 });
    expect(aw.finalYearCount).toBe(2); // Sr + Gr
    expect(aw.unknownClassCount).toBe(1); // "Fr/So"
    expect(aw.playersListed).toBe(6);
    expect(aw.duplicatesDropped).toBe(1);

    const am = bySlug["test-college-a-men"]; // 2025-26: a senior is class 2026
    expect(am.seasonShown).toBe("2025-26");
    expect(am.classCounts).toEqual({ 2029: 1, 2028: 1, 2027: 1, 2026: 3 });
    expect(am.finalYearCount).toBe(3); // 2 Senior + 5th Year
  });

  it("reads explicit class years and leaves an impossible one unknown", () => {
    const bw = bySlug["test-college-b-women"];
    expect(bw.seasonShown).toBe("2026-27"); // written with an en dash in the file
    expect(bw.classCounts).toEqual({ 2030: 1, 2029: 1, 2028: 1, 2027: 1 });
    expect(bw.unknownClassCount).toBe(1); // 2031
    expect(r.unknownLabels).toEqual({ "Fr/So": 1, "2031": 1 });
  });

  it("does not import a program whose roster listed nobody (it would read \"0 seniors\")", () => {
    expect(bySlug["test-college-c-men"]).toBeUndefined();
    expect(r.notRetrieved.map((p) => p.slug)).toEqual(["test-college-c-men"]);
    expect(r.errors.map((e) => e.line)).not.toContain(21); // not a row error either
  });

  it("never carries a player name or hometown anywhere in its output", () => {
    const out = JSON.stringify(r);
    expect(out).not.toMatch(/Player \d/);
    expect(out).not.toMatch(/Test Town/);
  });
});

describe("parseRosterTsv refuses what it cannot read", () => {
  it("an empty file", () => {
    expect(() => parseRosterTsv("")).toThrow(RosterFileError);
    expect(() => parseRosterTsv("\n\n")).toThrow(/empty/);
  });

  it("a header missing a column, naming the column", () => {
    const header = ROSTER_COLUMNS.filter((c) => c !== "Class").join("\t");
    expect(() => parseRosterTsv(header + "\n")).toThrow(/missing column\(s\): Class/);
  });

  it("accepts the columns in any order and with a BOM", () => {
    const cols = [...ROSTER_COLUMNS].reverse();
    const row: Record<string, string> = {
      Conference: "UAA", School: "Test College Z", Gender: "Women", HeadCoach: "", RosterURL: "",
      SeasonShown: "2026-27", Player: "Player 1", Class: "Sr", Hometown: "Test Town", Notes: "",
    };
    const text = "﻿" + cols.join("\t") + "\n" + cols.map((c) => row[c]).join("\t") + "\n";
    const r = parseRosterTsv(text);
    expect(r.errors).toEqual([]);
    expect(r.programs[0].finalYearCount).toBe(1);
  });

  it("row-level problems are errors with reasons, not guesses", () => {
    const rows = [
      "UAA\tTest College Z\tCoed\t\t\t2026-27\tPlayer 1\tSr\tTest Town\t",
      "UAA\tTest College Z\tWomen\t\t\tFall 2026\tPlayer 2\tSr\tTest Town\t",
      "UAA\tTest College Z\tWomen\t\tnot-a-url\t2026-27\tPlayer 3\tSr\tTest Town\t",
      "\tTest College Z\tWomen\t\t\t2026-27\tPlayer 4\tSr\tTest Town\t",
      "UAA\tTest College Z\tWomen\t\t\t2026-27\tPlayer 5\tSr\tTest Town\t\textra",
    ];
    const r = parseRosterTsv([HEADER, ...rows].join("\n"));
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
    expect(r.errors[0].reason).toMatch(/not men or women/);
    expect(r.errors[1].reason).toMatch(/not a season/);
    expect(r.errors[2].reason).toMatch(/not an http/);
    expect(r.errors[3].reason).toMatch(/missing Conference/);
    expect(r.errors[4].reason).toMatch(/cells/);
    // No error message repeats a player's name.
    expect(JSON.stringify(r.errors)).not.toMatch(/Player \d/);
    expect(r.failed).toBe(true);
  });

  it("fails the run above 5% row errors", () => {
    const good = Array.from({ length: 19 }, (_, i) => `UAA\tTest College Z\tWomen\t\t\t2026-27\tPlayer ${i}\tSr\tTest Town\t`);
    const bad = "UAA\tTest College Z\tX\t\t\t2026-27\tPlayer 99\tSr\tTest Town\t";
    expect(parseRosterTsv([HEADER, ...good, bad].join("\n")).failed).toBe(false); // 1/20 = 5%
    expect(parseRosterTsv([HEADER, ...good.slice(1), bad, bad].join("\n")).failed).toBe(true); // 2/20
  });

  it("refuses a school claimed by two conferences rather than picking one", () => {
    const rows = [
      "UAA\tTest College Z\tWomen\t\t\t2026-27\tPlayer 1\tSr\tTest Town\t",
      "SCIAC\tTest College Z\tWomen\t\t\t2026-27\tPlayer 2\tSr\tTest Town\t",
    ];
    const r = parseRosterTsv([HEADER, ...rows].join("\n"));
    expect(r.programs).toEqual([]);
    expect(r.errors[0].reason).toMatch(/appears under 2 conferences/);
  });

  it("flags program fields that disagree between rows and uses the most common", () => {
    const rows = [
      "UAA\tTest College Z\tWomen\t\thttps://example.com/a\t2026-27\tPlayer 1\tSr\tTest Town\t",
      "UAA\tTest College Z\tWomen\t\thttps://example.com/a\t2026-27\tPlayer 2\tJr\tTest Town\t",
      "UAA\tTest College Z\tWomen\t\thttps://example.com/b\t2026-27\tPlayer 3\tSo\tTest Town\t",
    ];
    const p = parseRosterTsv([HEADER, ...rows].join("\n")).programs[0];
    expect(p.rosterUrl).toBe("https://example.com/a");
    expect(p.inconsistentFields).toEqual(["RosterURL"]);
  });
});

describe("conference -> division map", () => {
  it("covers exactly the ten phase-1 conferences", () => {
    expect(Object.keys(CONFERENCE_DIVISION).sort()).toEqual(
      [
        "Atlantic 10", "CAA", "Centennial", "Ivy League", "Liberty League",
        "NESCAC", "ODAC", "Patriot League", "SCIAC", "UAA",
      ].sort()
    );
  });
});

describe("slugs and the missing-program list", () => {
  it("slugify is stable and ASCII", () => {
    expect(slugify("Test College A")).toBe("test-college-a");
    expect(slugify("Saint Test's College")).toBe("saint-tests-college");
    expect(slugify("Test & Test Univ.")).toBe("test-and-test-univ");
    expect(slugify("Tést Collège")).toBe("test-college");
    expect(programSlug("Test College A", "women")).toBe("test-college-a-women");
  });

  it("names expected programs that are not in the file", () => {
    const r = parseRosterTsv(FIXTURE);
    const missing = missingPrograms(parseExpectedTsv(EXPECTED), r.programs);
    // C is in the file but has no roster, so it is not imported either.
    expect(missing).toEqual([
      { conference: "Patriot League", school: "Test College C", gender: "men" },
      { conference: "Patriot League", school: "Test College E", gender: "women" },
    ]);
  });

  it("rejects an expected list without the required columns", () => {
    expect(() => parseExpectedTsv("School\nTest College A\n")).toThrow(RosterFileError);
  });
});

/* What the real 2026-27 roster file broke, pinned with synthetic rows. */
describe("shapes found in the real roster file", () => {
  const row = (cells: Partial<Record<(typeof ROSTER_COLUMNS)[number], string>>) =>
    ROSTER_COLUMNS.map((c) => cells[c] ?? "").join("\t");
  const base = { Conference: "UAA", School: "Test College Z", Gender: "W", RosterURL: "https://example.com/z" };

  it("a placeholder row with a blank season and no player is 'not retrieved', not an error", () => {
    const r = parseRosterTsv(
      [HEADER, row({ ...base, Notes: "Roster page failed to load; e.g. Player 9 on the 2026-27 roster" })].join("\n")
    );
    expect(r.errors).toEqual([]);
    expect(r.programs).toEqual([]);
    expect(r.notRetrieved).toEqual([
      { slug: "test-college-z-women", conference: "UAA", school: "Test College Z", gender: "women" },
    ]);
    // The Notes cell (which on the real file names players) never leaks.
    expect(JSON.stringify(r)).not.toMatch(/Player 9|failed to load/);
    expect(r.failed).toBe(false);
  });

  it("a placeholder row next to real rows for the same team is ignored", () => {
    const r = parseRosterTsv(
      [HEADER, row(base), row({ ...base, SeasonShown: "2026-27", Player: "Player 1", Class: "Sr." })].join("\n")
    );
    expect(r.notRetrieved).toEqual([]);
    expect(r.programs).toHaveLength(1);
    expect(r.programs[0].finalYearCount).toBe(1);
  });

  it("a single spring year ('2026') is the 2025-26 season, flagged", () => {
    const r = parseRosterTsv(
      [HEADER, row({ ...base, SeasonShown: "2026", Player: "Player 1", Class: "Sr." }), row({ ...base, SeasonShown: "2026", Player: "Player 2", Class: "Fr." })].join("\n")
    );
    expect(r.errors).toEqual([]);
    const p = r.programs[0];
    expect(p.seasonShown).toBe("2025-26");
    expect(p.seasonFromSpringYear).toBe(true);
    expect(p.finalYearCount).toBe(1); // a 2025-26 senior is class 2026
    expect(p.classCounts).toEqual({ 2026: 1, 2029: 1 });
  });

  it("'2025-2026' and '2026-2027' are read like '2025-26'", () => {
    const r = parseRosterTsv(
      [HEADER, row({ ...base, SeasonShown: "2026-2027", Player: "Player 1", Class: "Jr." })].join("\n")
    );
    expect(r.programs[0]).toMatchObject({ seasonShown: "2026-27", seasonFromSpringYear: false });
  });

  it("a roster with no class column counts its players, all as unknown", () => {
    const rows = [1, 2, 3].map((i) => row({ ...base, SeasonShown: "2025-26", Player: `Player ${i}`, Class: "" }));
    const r = parseRosterTsv([HEADER, ...rows].join("\n"));
    expect(r.programs[0]).toMatchObject({ playersListed: 3, unknownClassCount: 3, finalYearCount: 0 });
    expect(r.unknownLabels).toEqual({ "(blank)": 3 });
  });

  it("a blank hometown does not make two different players a duplicate", () => {
    const r = parseRosterTsv(
      [HEADER, row({ ...base, SeasonShown: "2026-27", Player: "Player 1", Class: "Sr." }), row({ ...base, SeasonShown: "2026-27", Player: "Player 2", Class: "Sr." })].join("\n")
    );
    expect(r.programs[0]).toMatchObject({ playersListed: 2, duplicatesDropped: 0 });
  });
});

describe("the real 2026-27 roster file", () => {
  const path = join(__dirname, "..", "..", "docs", "data", "official_rosters_2026-27.tsv");
  const real = parseRosterTsv(readFileSync(path, "utf8"));

  it("imports with no row errors", () => {
    expect(real.rowsRead).toBe(1947);
    expect(real.errors).toEqual([]);
    expect(real.failed).toBe(false);
  });

  it("imports 179 teams and reports the 10 whose roster was not retrieved", () => {
    expect(real.programs).toHaveLength(179);
    expect(real.notRetrieved.map((p) => p.slug).sort()).toEqual(
      [
        "brown-men", "carnegie-mellon-men", "carnegie-mellon-women", "dartmouth-men", "george-mason-men",
        "george-mason-women", "princeton-women", "richmond-men", "st-bonaventure-men", "st-bonaventure-women",
      ].sort()
    );
  });

  it("leaves only labels that genuinely cannot be read as unknown", () => {
    // "Rs." names no year; the blanks are one roster that prints no class column.
    expect(real.unknownLabels).toEqual({ "Rs.": 1, "(blank)": 10 });
  });

  it("never carries a player name, hometown or note into its output", () => {
    const out = JSON.stringify(real);
    // Every Player / Hometown / Notes cell in the file, read from the file
    // itself so no name is copied into this test.
    const lines = readFileSync(path, "utf8").split(/\r?\n/).slice(1).filter(Boolean);
    const cols = ["Player", "Hometown", "Notes"].map((c) => ROSTER_COLUMNS.indexOf(c as (typeof ROSTER_COLUMNS)[number]));
    const cells = new Set(lines.flatMap((l) => cols.map((i) => (l.split("\t")[i] ?? "").trim())).filter((v) => v.length >= 5));
    expect(cells.size).toBeGreaterThan(1500);
    const leaked = [...cells].filter((v) => out.includes(v));
    expect(leaked).toEqual([]);
  });
});
