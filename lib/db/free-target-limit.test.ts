import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* The Free-tier target cap (024) may only ever block GROWTH.
 *
 * 024 as first written let an over-limit Free account through only when its
 * list SHRANK, and only on a plain UPDATE. The app saves the profile with
 * `.upsert()` and always sends `target_school_slugs`, so for an account
 * already holding more than 3 schools every save was refused — a rename, a
 * new UTR — and so was removing a single school, because an upsert's INSERT
 * half has no OLD row to compare with. Production had two such players when
 * 024 went live (2026-11-16); migration 040 fixed it before the code shipped.
 *
 * The behaviour was proved against the database on staging, before and after
 * 040 (same-size save and 5 -> 4 refused before, allowed after; 6, re-growing
 * 4 -> 5, and 3 -> 4 still refused). This test keeps the next rewrite of the
 * trigger function from quietly going back. It is a lint over the SQL, not a
 * proof — the staging probe is the proof. */

const MIGRATIONS = join(__dirname, "..", "..", "supabase", "migrations");

function latestDefinition(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const m = sql.match(
      /create or replace function public\.enforce_free_tier_target_limit\(\)[\s\S]*?\$\$([\s\S]*?)\$\$;/i
    );
    if (m) found = { file, body: m[1].replace(/--[^\n]*/g, "") };
  }
  if (!found) throw new Error("enforce_free_tier_target_limit() is not defined by any migration");
  return found;
}

describe("the Free target cap blocks only growth", () => {
  const { file, body } = latestDefinition();

  it("is defined last by 040 or later", () => {
    expect(file >= "040").toBe(true);
  });

  it("lets an UPDATE through when the list does not grow (<=, not <)", () => {
    expect(body).toMatch(/new_count\s*<=\s*coalesce\(\s*array_length\(\s*old\.target_school_slugs/i);
    expect(body).not.toMatch(/new_count\s*<\s*coalesce\(\s*array_length\(\s*old\./i);
  });

  it("defers an upsert's INSERT half on an existing row to the UPDATE half", () => {
    expect(body).toMatch(/tg_op\s*=\s*'INSERT'\s+and\s+public\.profile_row_exists\(\s*new\.id\s*\)/i);
  });

  it("still refuses a Free account that grows past 3", () => {
    expect(body).toMatch(/limit_for_free\s+constant\s+int\s*:=\s*3/i);
    expect(body).toMatch(/not\s+public\.has_tier\(\s*'player'\s*\)/i);
    expect(body).toMatch(/errcode\s*=\s*'check_violation'/i);
  });

  it("stays SECURITY INVOKER, so the current_user exemption means what it says", () => {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const header = sql.slice(sql.search(/create or replace function public\.enforce_free_tier_target_limit/i));
    expect(header.slice(0, 200)).toMatch(/security invoker/i);
  });
});
