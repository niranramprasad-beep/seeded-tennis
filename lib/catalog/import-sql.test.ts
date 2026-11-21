import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportSql } from "./import-sql";
import { parseRosterTsv } from "./roster-import";

const fixture = readFileSync(join(__dirname, "testdata", "rosters-fixture.tsv"), "utf8");

describe("buildImportSql", () => {
  const sql = buildImportSql(parseRosterTsv(fixture).programs, "2026-11-19");

  it("is one transaction that refuses a database without migration 048", () => {
    expect(sql.startsWith("-- Generated")).toBe(true);
    expect(sql).toMatch(/^begin;$/m);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toMatch(/to_regclass\('public\.programs'\) is null/);
  });

  it("upserts each program and replaces its class counts", () => {
    expect(sql.match(/insert into public\.programs /g)).toHaveLength(1);
    expect(sql.match(/^\('test-college-[a-z-]+','Test/gm)).toHaveLength(4);
    expect(sql).toMatch(/delete from public\.program_class_counts c using public\.programs p/);
    expect(sql).toContain("('test-college-a-women',2030,1)");
  });

  it("carries no player name or hometown", () => {
    expect(sql).not.toMatch(/Player \d|Test Town/);
  });

  it("escapes quotes and refuses a bad date", () => {
    const p = { ...parseRosterTsv(fixture).programs[0], school: "Saint O'Test" };
    expect(buildImportSql([p], "2026-11-19")).toContain("'Saint O''Test'");
    expect(() => buildImportSql([p], "Nov 19")).toThrow();
  });
});
