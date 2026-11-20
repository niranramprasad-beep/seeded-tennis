import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportSummary, renderImportReport, REPORT_BEGIN, REPORT_END, spliceReport } from "./import-report";
import { parseExpectedTsv, parseRosterTsv } from "./roster-import";

const fixture = (f: string) => readFileSync(join(__dirname, "testdata", f), "utf8");

function summary(withExpected: boolean, ranges = {}) {
  return buildImportSummary({
    inputFile: "rosters-fixture.tsv",
    checkedOn: "2026-11-19",
    parsed: parseRosterTsv(fixture("rosters-fixture.tsv")),
    expected: withExpected ? parseExpectedTsv(fixture("expected-fixture.tsv")) : null,
    rangesBySlug: ranges,
    legacySchools: [
      { slug: "legacy-m", name: "Legacy University", conference: "SEC", gender: "men", minCompetitiveUTR: 9.3, avgRosterUTR: 10.5 },
      { slug: "legacy-w", name: "Legacy University", conference: "SEC", gender: "women", minCompetitiveUTR: 6.5, avgRosterUTR: 8.5 },
      // The same team as the fixture's Test College B women: must not be counted twice.
      { slug: "test-college-b-w", name: "Test College B University", conference: "Ivy League", gender: "women", minCompetitiveUTR: 9, avgRosterUTR: 10 },
    ],
  });
}

describe("import summary from the fake fixture", () => {
  const s = summary(true);

  it("counts programs by conference and gender", () => {
    expect(s.totals).toEqual({ programs: 4, men: 2, women: 2, playersListed: 20, unknownClass: 2 });
    expect(s.byConference).toEqual([
      { conference: "Ivy League", division: "D1", men: 1, women: 1, playersListed: 8 },
      { conference: "NESCAC", division: "D3", men: 1, women: 1, playersListed: 12 },
    ]);
    expect(s.perConference).toEqual([
      { conference: "Ivy League", division: "D1", imported: 2, notRetrieved: 0, absent: 0, stale: 0, players: 8 },
      { conference: "NESCAC", division: "D3", imported: 2, notRetrieved: 0, absent: 0, stale: 1, players: 12 },
      { conference: "Patriot League", division: "D1", imported: 0, notRetrieved: 1, absent: 1, stale: 0, players: 0 },
    ]);
    expect(s.currentSeason).toBe("2026-27");
  });

  it("lists rosters from an earlier season, empty rosters and missing programs", () => {
    expect(s.earlierSeasonRosters).toEqual([
      { slug: "test-college-a-men", school: "Test College A", gender: "men", seasonShown: "2025-26" },
    ]);
    expect(s.notRetrieved.map((p) => p.slug)).toEqual(["test-college-c-men"]);
    // "missing" is what the file does not mention at all; C is reported above.
    expect(s.missing).toEqual([{ conference: "Patriot League", school: "Test College E", gender: "women" }]);
    expect(summary(false).missing).toBeNull(); // unknown, not "none missing"
  });

  it("every imported program is unrated until the owner enters a range", () => {
    expect(s.ranges).toEqual({ withRange: 0, withoutRange: 4 });
    expect(s.programs.every((p) => !p.hasRange)).toBe(true);
    expect(s.coverage.every((c) => c.target === 0 && c.likely === 0)).toBe(true);
  });

  it("counts a program once a sourced range exists", () => {
    const rated = summary(true, {
      "test-college-a-women": [
        { low: 6, middle: 7, high: 8, sourceType: "hand_curated", source: "Test source", sourceUrl: null, sourceDate: "2026-11-01", createdAt: "2026-11-01T00:00:00Z" },
      ],
    });
    expect(rated.ranges).toEqual({ withRange: 1, withoutRange: 3 });
    expect(rated.coverage.find((c) => c.gender === "women" && c.utr === 7)).toMatchObject({ likely: 1 });
  });

  it("carries no player name, hometown or coach name", () => {
    const text = JSON.stringify(s) + renderImportReport(s);
    expect(text).not.toMatch(/Player \d|Test Town|Test Coach/);
  });
});

describe("the report markdown", () => {
  const md = renderImportReport(summary(true));

  it("has every section the phase-1 doc promises", () => {
    for (const heading of [
      "### Programs by conference and gender",
      "### Per conference: imported, missing, stale",
      "### Teams missing",
      "### Already in the main catalog",
      "### Seniors leaving (current-season rosters only)",
      "### Where to enter team ranges first",
      "### Rosters from an earlier season",
      "### Unreadable class labels",
      "### Row errors",
      "### Team ranges",
      "### Coverage for sample players",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("| Women's UTR 7 |");
    expect(md).toContain("0 of 4 imported programs have a current, sourced team range");
  });

  it("splices into the doc between the markers and nowhere else", () => {
    const doc = `intro\n${REPORT_BEGIN}\npending\n${REPORT_END}\noutro\n`;
    const out = spliceReport(doc, "GENERATED");
    expect(out).toBe(`intro\n${REPORT_BEGIN}\nGENERATED\n${REPORT_END}\noutro\n`);
    expect(() => spliceReport("no markers", "x")).toThrow(/must contain/);
  });

  it("the committed doc holds the generated report for the real file, not a pending placeholder", () => {
    const doc = readFileSync(join(__dirname, "..", "..", "docs", "catalog", "phase-1-import.md"), "utf8");
    const block = doc.slice(doc.indexOf(REPORT_BEGIN), doc.indexOf(REPORT_END));
    expect(block).toContain("from `official_rosters_2026-27.tsv`, rosters read 2026-11-08");
    expect(block).not.toMatch(/\bpending\b/i);
  });
});

describe("legacy duplicates, seniors leaving and where to start", () => {
  const s = summary(true);

  it("matches an imported team to the same team in the legacy catalog and keeps it out of coverage", () => {
    expect(s.legacyMatches).toEqual([{ slug: "test-college-b-women", legacySlug: "test-college-b-w" }]);
    expect(s.coverage.find((c) => c.gender === "women")!.unratedPrograms).toBe(1); // A women only
  });

  it("counts seniors on current-season rosters only", () => {
    // A women (2026-27): Sr + Gr = 2. B women (2026-27): '27 = 1. B men: 2.
    // A men is 2025-26: its seniors have finished, so it is left out.
    expect(s.finalYearOnCurrentRosters).toEqual([
      { gender: "men", programs: 1, seniors: 2, untracked: 0 },
      { gender: "women", programs: 2, seniors: 3, untracked: 0 },
    ]);
  });

  it("orders where to start by seniors, D3 and non-Ivy D1 only, never a legacy duplicate", () => {
    // B men is Ivy (tier 2) and B women is a legacy duplicate: only A women qualifies.
    expect(s.startHere.map((r) => r.slug)).toEqual(["test-college-a-women"]);
  });
});

describe("the real 2026-27 file against the conferences' own team lists", () => {
  const data = (f: string) => readFileSync(join(__dirname, "..", "..", "docs", "data", f), "utf8");
  const s = buildImportSummary({
    inputFile: "official_rosters_2026-27.tsv",
    checkedOn: "2026-11-08",
    parsed: parseRosterTsv(data("official_rosters_2026-27.tsv")),
    expected: parseExpectedTsv(data("expected_programs_2026-27.tsv")),
    legacySchools: [],
  });

  it("every expected team is imported, marked not retrieved, or named as absent", () => {
    // 191 on the conferences' lists = 179 imported + 10 not retrieved + 2 absent.
    expect(parseExpectedTsv(data("expected_programs_2026-27.tsv"))).toHaveLength(191);
    expect(s.totals.programs).toBe(179);
    expect(s.notRetrieved).toHaveLength(10);
    expect(s.missing).toEqual([
      { conference: "Atlantic 10", school: "Saint Louis", gender: "men" },
      { conference: "Atlantic 10", school: "Saint Louis", gender: "women" },
    ]);
  });
});
