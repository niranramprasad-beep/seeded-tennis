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
      { gender: "men", minCompetitiveUTR: 9.3, avgRosterUTR: 10.5 },
      { gender: "women", minCompetitiveUTR: 6.5, avgRosterUTR: 8.5 },
    ],
  });
}

describe("import summary from the fake fixture", () => {
  const s = summary(true);

  it("counts programs by conference and gender", () => {
    expect(s.totals).toEqual({ programs: 5, men: 3, women: 2, playersListed: 20, unknownClass: 2 });
    expect(s.byConference).toEqual([
      { conference: "Ivy League", division: "D1", men: 1, women: 1, playersListed: 8 },
      { conference: "NESCAC", division: "D3", men: 1, women: 1, playersListed: 12 },
      { conference: "Patriot League", division: "D1", men: 1, women: 0, playersListed: 0 },
    ]);
    expect(s.currentSeason).toBe("2026-27");
  });

  it("lists rosters from an earlier season, empty rosters and missing programs", () => {
    expect(s.earlierSeasonRosters).toEqual([
      { slug: "test-college-a-men", school: "Test College A", gender: "men", seasonShown: "2025-26" },
    ]);
    expect(s.noPlayersListed).toEqual(["test-college-c-men"]);
    expect(s.missing).toEqual([{ conference: "Patriot League", school: "Test College E", gender: "women" }]);
    expect(summary(false).missing).toBeNull(); // unknown, not "none missing"
  });

  it("every imported program is unrated until the owner enters a range", () => {
    expect(s.ranges).toEqual({ withRange: 0, withoutRange: 5 });
    expect(s.programs.every((p) => !p.hasRange)).toBe(true);
    expect(s.coverage.every((c) => c.target === 0 && c.likely === 0)).toBe(true);
  });

  it("counts a program once a sourced range exists", () => {
    const rated = summary(true, {
      "test-college-a-women": [
        { low: 6, middle: 7, high: 8, sourceType: "hand_curated", source: "Test source", sourceUrl: null, sourceDate: "2026-11-01", createdAt: "2026-11-01T00:00:00Z" },
      ],
    });
    expect(rated.ranges).toEqual({ withRange: 1, withoutRange: 4 });
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
      "### Programs missing",
      "### Rosters from an earlier season",
      "### Unreadable class labels",
      "### Row errors",
      "### Team ranges",
      "### Coverage for sample players",
    ]) {
      expect(md).toContain(heading);
    }
    expect(md).toContain("| Women's UTR 7 |");
    expect(md).toContain("0 of 5 imported programs have a current, sourced team range");
  });

  it("splices into the doc between the markers and nowhere else", () => {
    const doc = `intro\n${REPORT_BEGIN}\npending\n${REPORT_END}\noutro\n`;
    const out = spliceReport(doc, "GENERATED");
    expect(out).toBe(`intro\n${REPORT_BEGIN}\nGENERATED\n${REPORT_END}\noutro\n`);
    expect(() => spliceReport("no markers", "x")).toThrow(/must contain/);
  });

  it("the committed doc still has its markers, and holds no numbers until the file arrives", () => {
    const doc = readFileSync(join(__dirname, "..", "..", "docs", "catalog", "phase-1-import.md"), "utf8");
    const block = doc.slice(doc.indexOf(REPORT_BEGIN), doc.indexOf(REPORT_END));
    expect(block.length).toBeGreaterThan(REPORT_BEGIN.length);
    // When the real TSV is imported, the script rewrites this block and this
    // assertion should be deleted in the same commit.
    expect(block).toMatch(/pending/i);
  });
});
