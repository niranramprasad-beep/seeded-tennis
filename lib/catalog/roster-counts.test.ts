import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  serializeRosterCounts,
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

  it.each(SAME)("keeps %s identical", (key) => {
    expect(back[key]).toEqual(raw[key]);
  });

  it("carries the raw file's row error with its original line number", () => {
    expect(raw.errors).toHaveLength(1);
    expect(back.errors).toEqual(raw.errors);
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

  it("writes back byte for byte (it is the writer's own output)", () => {
    expect(serializeRosterCounts(r, { sourceFile: "official_rosters_2026-27.tsv" })).toBe(COUNTS);
  });
});

describe("no raw roster file is in the repo", () => {
  it("nothing under docs/data has a per-player header", () => {
    const dir = join(ROOT, "docs", "data");
    for (const f of readdirSync(dir)) {
      const first = readFileSync(join(dir, f), "utf8").split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#")) ?? "";
      expect(isRawRosterHeader(first), f).toBe(false);
    }
  });

  it("git tracks no official_rosters_* file and .gitignore blocks the pattern", () => {
    let tracked = "";
    try {
      tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
    } catch {
      return; // not a git checkout (e.g. an exported tarball): nothing to check
    }
    expect(tracked.split("\n").filter((f) => /(^|\/)official_rosters_[^/]*\.tsv$/.test(f))).toEqual([]);
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    expect(ignore).toMatch(/^\*\*\/official_rosters_\*\.tsv$/m);
    expect(ignore).toMatch(/^seeded-private\/$/m);
  });
});

describe.skipIf(!existsSync(RAW_ROSTERS))("the raw file on this machine (local only)", () => {
  // describe.skipIf still runs this body, so read only when the file exists.
  const rawText = existsSync(RAW_ROSTERS) ? readFileSync(RAW_ROSTERS, "utf8") : "";

  it("aggregates to exactly the committed file", () => {
    expect(serializeRosterCounts(parseRosterTsv(rawText), { sourceFile: basename(RAW_ROSTERS) })).toBe(COUNTS);
  });

  it("no Player, Hometown or Notes value appears in the committed file", () => {
    const idx = ["Player", "Hometown", "Notes"].map((c) => ROSTER_COLUMNS.indexOf(c as (typeof ROSTER_COLUMNS)[number]));
    const values = new Set(
      rawText
        .split(/\r?\n/)
        .slice(1)
        .flatMap((l) => idx.map((i) => (l.split("\t")[i] ?? "").trim()))
        .filter((v) => v.length >= 5)
    );
    expect(values.size).toBeGreaterThan(1500);
    expect([...values].filter((v) => COUNTS.includes(v))).toEqual([]);
  });
});
