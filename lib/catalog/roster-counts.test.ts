import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRosterTsv, RosterFileError, ROSTER_COLUMNS } from "./roster-import";
import {
  COUNTS_LEAD_COLUMNS,
  COUNTS_TAIL_COLUMNS,
  isRawRosterHeader,
  parseRosterCountsTsv,
  parseRosterFile,
  personalValuesIn,
  redactForCounts,
  serializeRosterCounts,
  UNREADABLE_LABEL,
} from "./roster-counts";

const ROOT = join(__dirname, "..", "..");
const COUNTS_PATH = join(ROOT, "docs", "data", "roster_counts_2026-27.tsv");
const COUNTS = readFileSync(COUNTS_PATH, "utf8");
const FIXTURE = readFileSync(join(__dirname, "testdata", "rosters-fixture.tsv"), "utf8");
const RAW_ROSTERS = process.env.SEEDED_RAW_ROSTERS ?? join(homedir(), "seeded-private", "official_rosters_2026-27.tsv");

const SAME = ["programs", "notRetrieved", "unknownLabels", "rowsRead", "rowsUsed", "errors", "errorRate", "failed"] as const;

describe("round trip on the fake fixture", () => {
  const raw = parseRosterTsv(FIXTURE);
  const text = serializeRosterCounts(raw, { sourceFile: "rosters-fixture.tsv" });
  const back = parseRosterCountsTsv(text);
  const expected = redactForCounts(raw);

  it.each(SAME)("keeps %s identical (after redaction)", (key) => {
    expect(back[key]).toEqual(expected[key]);
  });

  it("redaction changes only quoted cell text in errors; counts and teams are untouched", () => {
    expect(expected.programs).toEqual(raw.programs);
    expect(expected.notRetrieved).toEqual(raw.notRetrieved);
    expect(raw.errors).toHaveLength(1);
    expect(back.errors).toEqual([{ line: raw.errors[0].line, reason: 'unknown conference "…" (no division on record for it)' }]);
  });

  it("writes no player name or hometown from the fixture", () => {
    expect(text).not.toMatch(/Player \d|Test Town/);
  });

  it("parseRosterFile picks the parser from the header", () => {
    expect(parseRosterFile(FIXTURE).programs).toEqual(raw.programs);
    expect(parseRosterFile(text).programs).toEqual(raw.programs);
  });
});

describe("the reader is strict", () => {
  const raw = parseRosterTsv(FIXTURE);
  const text = serializeRosterCounts(raw, { sourceFile: "f.tsv" });
  const lines = text.split("\n");
  const firstRow = lines.findIndex((l) => l.includes("\timported\t"));

  it("refuses a raw (per-player) file", () => {
    expect(() => parseRosterCountsTsv(FIXTURE)).toThrow(RosterFileError);
    expect(isRawRosterHeader(ROSTER_COLUMNS.join("\t"))).toBe(true);
  });

  it("refuses any Player, Hometown or Notes column added to the aggregate", () => {
    for (const col of ["Player", "Hometown", "Notes"]) {
      const header = lines.findIndex((l) => l.startsWith("Conference\t"));
      const bad = [...lines];
      bad[header] = `${bad[header]}\t${col}`;
      expect(() => parseRosterCountsTsv(bad.join("\n"))).toThrow(/raw roster file/);
    }
  });

  it("refuses an unknown column", () => {
    const header = lines.findIndex((l) => l.startsWith("Conference\t"));
    const bad = [...lines];
    bad[header] = bad[header].replace("Status", "Status2");
    expect(() => parseRosterCountsTsv(bad.join("\n"))).toThrow(/missing column|unexpected column/);
  });

  it("fails the file when a Total does not add up", () => {
    const bad = [...lines];
    const cells = bad[firstRow].split("\t");
    const totalAt = lines.find((l) => l.startsWith("Conference\t"))!.split("\t").indexOf("Total");
    cells[totalAt] = String(Number(cells[totalAt]) + 1);
    bad[firstRow] = cells.join("\t");
    const r = parseRosterCountsTsv(bad.join("\n"));
    expect(r.failed).toBe(true);
    expect(r.errors.some((e) => /Total/.test(e.reason))).toBe(true);
  });

  it("fails the file on a truncated row", () => {
    const bad = [...lines];
    bad[firstRow] = bad[firstRow].split("\t").slice(0, 5).join("\t");
    expect(parseRosterCountsTsv(bad.join("\n")).failed).toBe(true);
  });
});

describe("cell text that lands in the wrong column never reaches the aggregate", () => {
  // Made-up rows only. Each one is a real way a scraped roster goes wrong.
  const HEADER = ROSTER_COLUMNS.join("\t");
  const row = (cells: string[]) => cells.join("\t");
  const team = ["NESCAC", "Test College Z", "Women", "Test Coach Z", "https://example.com/z", "2026-27"];
  const good = row([...team, "Player 3", "Jr.", "Test Town", ""]);
  const cases: Record<string, string> = {
    "a hometown shifted into Class": row([...team, "Player 1", "Faketown, Fakestate", "", ""]),
    "Player and Class swapped": row([...team, "Sr.", "Zelda Quokkason", "Test Town", ""]),
    "a name in the Conference cell": row(["Zelda Quokkason", "Test College Z", "Women", "", "", "2026-27", "Player 2", "Sr.", "", ""]),
  };
  for (const [name, bad] of Object.entries(cases)) {
    it(name, () => {
      const rawText = [HEADER, good, bad].join("\n");
      const text = serializeRosterCounts(parseRosterTsv(rawText), { sourceFile: "z.tsv" });
      expect(text).not.toMatch(/Faketown|Fakestate|Zelda|Quokkason/);
      expect(personalValuesIn(rawText, text)).toEqual([]);
      expect(() => parseRosterCountsTsv(text)).not.toThrow();
    });
  }

  it("an unreadable label is counted as (unreadable), not printed", () => {
    const rawText = [HEADER, row([...team, "Player 1", "Faketown, Fakestate", "", ""])].join("\n");
    expect(redactForCounts(parseRosterTsv(rawText)).unknownLabels).toEqual({ [UNREADABLE_LABEL]: 1 });
  });

  it("personalValuesIn catches a name anywhere; a surname shared with a coach is not a false alarm", () => {
    const rawText = [
      HEADER,
      row([...team, "Zelda Coachname", "Jr.", "Faketown", ""]),
      row(["NESCAC", "Test College Y", "Men", "Pat Coachname", "", "2026-27", "Player 4", "So.", "", ""]),
    ].join("\n");
    expect(personalValuesIn(rawText, "... Zelda ...")).toEqual(["Zelda"]);
    expect(personalValuesIn(rawText, "Faketown")).toEqual(["Faketown"]);
    expect(personalValuesIn(rawText, "coach Pat Coachname")).toEqual([]);
  });
});

describe("hand edits the reader refuses", () => {
  const text = serializeRosterCounts(parseRosterTsv(FIXTURE), { sourceFile: "f.tsv" });
  const lines = text.split("\n");
  const headerAt = lines.findIndex((l) => l.startsWith("Conference\t"));
  const header = lines[headerAt].split("\t");
  const rowAt = lines.findIndex((l) => l.includes("\timported\t") && l.includes("\t2026-27\t"));
  const withLine = (i: number, line: string) => lines.map((l, j) => (j === i ? line : l)).join("\n");
  const setCell = (col: string, value: string) => {
    const cells = lines[rowAt].split("\t");
    cells[header.indexOf(col)] = value;
    return withLine(rowAt, cells.join("\t"));
  };
  const throws = (t: string) => expect(() => parseRosterCountsTsv(t)).toThrow(RosterFileError);
  const fails = (t: string) => expect(parseRosterCountsTsv(t).failed).toBe(true);
  const beforeHeader = (meta: string) => withLine(headerAt, `${meta}\n${lines[headerAt]}`);

  it("is fine with the writer's own output", () => {
    expect(parseRosterCountsTsv(text).errors.filter((e) => e.reason.startsWith("counts file"))).toEqual([]);
  });
  it("a source-row-error with a non-integer line, or quoting cell text", () => {
    throws(beforeHeader('# source-row-error: {"line":"abc","reason":"x"}'));
    throws(beforeHeader('# source-row-error: {"line":5,"reason":"bad \\"Zelda\\""}'));
  });
  it("missing, repeated or malformed source-rows-read", () => {
    throws(text.replace(/^# source-rows-read: .*\n/m, ""));
    throws(text.replace(/^(# source-rows-read: .*\n)/m, "$1$1"));
    throws(text.replace(/^# source-rows-read: (\d+)/m, "# source-rows-read: 1,947"));
  });
  it("a commented-out team below the header", () => {
    fails(withLine(rowAt, "# " + lines[rowAt]));
  });
  it("bad JSON or the wrong JSON in unknown-class-labels", () => {
    throws(text.replace(/^# unknown-class-labels: .*$/m, "# unknown-class-labels: {oops"));
    throws(text.replace(/^# unknown-class-labels: .*$/m, "# unknown-class-labels: [1,2]"));
    throws(text.replace(/^# unknown-class-labels: .*$/m, '# unknown-class-labels: {"Zelda Quokkason":1}'));
  });
  it("a repeated or impossible class-year column", () => {
    const yearCol = header.find((h) => /^Class of/.test(h))!;
    throws(withLine(headerAt, `${lines[headerAt]}\t${yearCol}`));
    fails(withLine(headerAt, lines[headerAt].replace(yearCol, "Class of 2099")));
  });
  it("a Total that does not add up, or labels that do not match UnknownClass", () => {
    fails(setCell("Total", "9999"));
    fails(text.replace(/^# unknown-class-labels: .*$/m, '# unknown-class-labels: {"Rs.":40}'));
  });
  it("teams listing more players than source-rows-used", () => {
    fails(text.replace(/^# source-rows-used: \d+/m, "# source-rows-used: 1").replace(/^# source-rows-read: \d+/m, "# source-rows-read: 2"));
  });
});

describe("the committed aggregate, docs/data/roster_counts_2026-27.tsv", () => {
  const r = parseRosterCountsTsv(COUNTS);
  const headerLine = COUNTS.split("\n").find((l) => l.startsWith("Conference\t"))!;

  it("has only team-level columns: no player, hometown or notes", () => {
    const cols = headerLine.split("\t");
    for (const c of ["Player", "Hometown", "Notes", "Class"]) expect(cols).not.toContain(c);
    expect(cols.slice(0, COUNTS_LEAD_COLUMNS.length)).toEqual([...COUNTS_LEAD_COLUMNS]);
    expect(cols.slice(-COUNTS_TAIL_COLUMNS.length)).toEqual([...COUNTS_TAIL_COLUMNS]);
    expect(cols.slice(COUNTS_LEAD_COLUMNS.length, -COUNTS_TAIL_COLUMNS.length).every((c) => /^Class of \d{4}$/.test(c))).toBe(true);
  });

  it("reads cleanly: 179 teams, 10 not retrieved, from 1,947 roster rows", () => {
    expect(r.failed).toBe(false);
    expect(r.errors).toEqual([]);
    expect(r.rowsRead).toBe(1947);
    expect(r.programs).toHaveLength(179);
    expect(r.notRetrieved).toHaveLength(10);
    expect(r.unknownLabels).toEqual({ "Rs.": 1, "(blank)": 10 });
    expect(r.programs.reduce((n, p) => n + p.playersListed, 0)).toBe(1947 - 10 - r.programs.reduce((n, p) => n + p.duplicatesDropped, 0));
  });

  it("a not-retrieved row with anything in its other cells fails the file", () => {
    const lines = COUNTS.split("\n");
    const header = lines.find((l) => l.startsWith("Conference\t"))!.split("\t");
    const nr = lines.findIndex((l) => l.includes("\tnot retrieved\t"));
    const cells = lines[nr].split("\t");
    cells[header.indexOf("HeadCoach")] = "Someone";
    expect(parseRosterCountsTsv(lines.map((l, i) => (i === nr ? cells.join("\t") : l)).join("\n")).failed).toBe(true);
  });

  it("re-serializes byte for byte (catches formatting edits; only the local raw-file test catches a count edited consistently)", () => {
    expect(serializeRosterCounts(r, { sourceFile: "official_rosters_2026-27.tsv" })).toBe(COUNTS);
  });
});

const FAKE_RAW_FIXTURES = new Set(["lib/catalog/testdata/rosters-fixture.tsv"]);

function parseRawCells(text: string): { player: string; hometown: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split("\t").map((h) => h.trim());
  const p = header.indexOf("Player");
  const h = header.indexOf("Hometown");
  return lines.slice(1).map((l) => {
    const c = l.split("\t");
    return { player: (c[p] ?? "").trim(), hometown: (c[h] ?? "").trim() };
  });
}

describe("no raw roster file is in the repo", () => {
  let tracked: string[] | null = null;
  try {
    tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    tracked = null; // not a git checkout (e.g. an exported tarball)
  }

  it("no tracked .tsv/.csv anywhere has a per-player header (tab- or comma-separated)", () => {
    const files = tracked ?? readdirSync(join(ROOT, "docs", "data")).map((f) => `docs/data/${f}`);
    const tables = files.filter((f) => /\.(tsv|csv)$/i.test(f));
    expect(tables.length).toBeGreaterThan(0);
    for (const f of tables) {
      const path = join(ROOT, f);
      if (!existsSync(path) || !statSync(path).isFile()) continue;
      const content = readFileSync(path, "utf8");
      const first = content.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#")) ?? "";
      if (FAKE_RAW_FIXTURES.has(f)) {
        // The parser's own test fixture is raw-shaped on purpose; it may only
        // ever hold made-up players ("Player 7") and towns ("Test Town").
        const rows = parseRawCells(content);
        expect(rows.every((r) => /^(Player \d+)?$/.test(r.player) && /^(Test Town)?$/.test(r.hometown)), f).toBe(true);
        continue;
      }
      expect(isRawRosterHeader(first) || isRawRosterHeader(first.split(",").join("\t")), f).toBe(false);
    }
  });

  it("git tracks no official_rosters_* file and .gitignore blocks the pattern", () => {
    if (tracked) expect(tracked.filter((f) => /(^|\/)official_rosters_[^/]*$/i.test(f))).toEqual([]);
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(ignore).toMatch(/^\*\*\/official_rosters_\*$/m);
    expect(ignore).toMatch(/^seeded-private\/$/m);
  });
});

describe.skipIf(!existsSync(RAW_ROSTERS))("the raw file on this machine (local only)", () => {
  // describe.skipIf still runs this body, so read only when the file exists.
  const rawText = existsSync(RAW_ROSTERS) ? readFileSync(RAW_ROSTERS, "utf8") : "";

  it("aggregates to exactly the committed file", () => {
    expect(serializeRosterCounts(parseRosterTsv(rawText), { sourceFile: basename(RAW_ROSTERS) })).toBe(COUNTS);
  });

  it("no personal value (any non-team cell, or a word of a player's name) appears in the committed file", () => {
    expect(personalValuesIn(rawText, COUNTS)).toEqual([]);
  });
});
