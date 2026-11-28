// Niran, 2026-11-27: a college roster player's exact UTR never reaches a
// screen, page source or API response a visitor can read. Migration 055 takes
// `utr` and `hometown` off the public grant on program_roster, and the school
// page reads the roster only through program_roster_page(), which returns
// floor(utr). These checks fail the build if either half is undone.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRosterPagesSql } from "@/lib/catalog/roster-pages";

const MIGRATION = "supabase/migrations/055_program_roster_private_ratings.sql";
const strip = (sql: string) => sql.replace(/--.*$/gm, "");

describe("055: program_roster's exact rating and hometown are not publicly readable", () => {
  const sql = strip(readFileSync(MIGRATION, "utf8"));

  it("revokes the table-wide select from anon and authenticated", () => {
    expect(sql).toMatch(/revoke\s+select\s+on\s+table\s+public\.program_roster\s+from\s+anon,\s*authenticated\s*;/i);
  });

  it("grants select back column by column, never utr or hometown", () => {
    const grants = [...sql.matchAll(/grant\s+select\s*\(([^)]*)\)\s*on\s+table\s+public\.program_roster/gi)];
    expect(grants).toHaveLength(1);
    const cols = grants[0][1].split(",").map((c) => c.trim());
    expect(cols).toEqual(["program_id", "player_name", "class_label", "grad_year", "utr_reliable", "utr_profile_url", "read_date"]);
    // No table-wide grant anywhere in the file.
    expect(sql).not.toMatch(/grant\s+select\s+on\s+(table\s+)?public\.program_roster/i);
  });

  it("nulls every stored hometown", () => {
    expect(sql).toMatch(/update\s+public\.program_roster\s+set\s+hometown\s*=\s*null/i);
  });

  it("program_roster_page returns floor(utr) only, as a locked-down definer", () => {
    const fn = /create or replace function public\.program_roster_page\(p_slug text\)([\s\S]*?)\$\$;/i.exec(sql);
    expect(fn).not.toBeNull();
    const body = fn![1];
    const returns = /returns table \(([\s\S]*?)\)\s*language/i.exec(body)![1];
    expect(returns).toMatch(/utr_whole int/);
    expect(returns).not.toMatch(/\butr\s+numeric|\butr\b\s*,|hometown/i);
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = ''/);
    expect(body).toMatch(/floor\(r\.utr\)::int end as utr_whole/);
    expect(body).not.toMatch(/hometown/i);
    // The only places the exact column appears: floor(), null checks and the
    // reliable flag. Never selected as itself.
    const selectList = /\$\$\s*select([\s\S]*?)from public\.program_roster/i.exec(body)![1];
    expect(selectList).not.toMatch(/r\.utr\s*(,|$)/m);
    // CREATE FUNCTION grants EXECUTE to PUBLIC: revoked, then granted to the page's roles.
    expect(sql).toMatch(/revoke all on function public\.program_roster_page\(text\) from public, anon, authenticated;/);
    expect(sql).toMatch(/grant execute on function public\.program_roster_page\(text\) to anon, authenticated/);
  });
});

describe("the roster loader never reads program_roster's utr or hometown", () => {
  const src = readFileSync("lib/db/roster.ts", "utf8");

  it("reads the roster only through program_roster_page()", () => {
    expect(src).toMatch(/client\.rpc\("program_roster_page", \{ p_slug: programSlug \}\)/);
    expect(src).not.toMatch(/\.from\("program_roster"\)/);
  });

  it("never names the exact column in a select", () => {
    for (const m of src.matchAll(/\.select\("([^"]*)"\)/g)) {
      const cols = m[1].split(",").map((c) => c.trim());
      expect(cols).not.toContain("utr");
      expect(cols).not.toContain("hometown");
      expect(cols).not.toContain("*");
    }
  });
});

describe("the roster import SQL lines up (the owner's SQL-editor import is unaffected by 055)", () => {
  it("inserts as many values as it names columns", () => {
    const players = [
      { slug: "s", playerName: "A B", classLabel: null, gradYear: 2028, utr: 12.37, utrReliable: true, utrProfileUrl: "https://u", readDate: "2026-11-22" },
    ];
    const stmt = buildRosterPagesSql({ players, staff: [] }, ["s"]).find((x) => x.startsWith("insert into public.program_roster"))!;
    const target = /program_roster \(([^)]*)\)/.exec(stmt)![1].split(",");
    const selected = /select ([^\n]*) from \(values/.exec(stmt)![1].split(",");
    const alias = /as v\(([^)]*)\)/.exec(stmt)![1].split(",");
    const tuple = /\n\((.*)\)\n\)/.exec(stmt)![1].split(/,(?=(?:[^']*'[^']*')*[^']*$)/);
    expect(selected).toHaveLength(target.length);
    expect(alias).toHaveLength(tuple.length);
    expect(target.map((c) => c.trim())).not.toContain("hometown");
  });
});
