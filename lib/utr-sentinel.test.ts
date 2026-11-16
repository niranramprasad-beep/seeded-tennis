import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyPlayer } from "./data/user";
import { codeOnly } from "./testing/source-text";

// The 0 sentinel is an IN-MEMORY convention. The database rejects it.
//
// `profiles_current_utr_check` (migration 006, applied and live on
// production) is `current_utr is null or current_utr between 1 and 16.5`,
// and `utr_entries_utr_check` is `utr between 1 and 16.5` with no NULL
// escape. Writing the sentinel raises 23514.
//
// That is exactly what happened when the sentinel was introduced to stop
// `buildCoachEmail` claiming "My UTR is 7.0 (self-reported)": the fix moved
// the placeholder out of the email and into a check-constraint violation on
// the highest-traffic write path. A verification pass caught it and it was
// reproduced on staging before this test was written.
//
// So: 0 in memory, NULL in the database, and the two must round-trip.

const REPO = join(__dirname, "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

/** The live predicate, transcribed from migration 006. */
function satisfiesProfilesCheck(value: number | null): boolean {
  return value === null || (value >= 1 && value <= 16.5);
}
function satisfiesUtrEntriesCheck(value: number): boolean {
  return value >= 1 && value <= 16.5;
}

describe("the 0 sentinel never reaches Postgres", () => {
  it("migration 006 really is the constraint this assumes", () => {
    const sql = read("supabase/migrations/006_full_utr_range.sql");
    expect(sql).toContain("check (current_utr is null or current_utr between 1 and 16.5)");
    expect(sql).toContain("check (utr between 1 and 16.5)");
  });

  it("the sentinel itself would violate both constraints", () => {
    // If this ever passes, the constraint changed and the guard below is moot.
    expect(satisfiesProfilesCheck(emptyPlayer.currentUTR)).toBe(false);
    expect(satisfiesUtrEntriesCheck(emptyPlayer.currentUTR)).toBe(false);
    // ...and the old placeholder would NOT have, which is why this was a
    // regression rather than a pre-existing bug.
    expect(satisfiesProfilesCheck(7)).toBe(true);
  });

  it("the profile write converts it to NULL", () => {
    // Comments stripped: the verifier changed the live line to `?? null`
    // and the guard still passed, because the old line survived in a
    // comment and `toContain` read it there.
    const auth = codeOnly(join(REPO, "lib/auth.ts"));
    expect(auth).toContain("current_utr: player.currentUTR > 0 ? player.currentUTR : null");
    expect(auth).not.toMatch(/current_utr:\s*player\.currentUTR,/);
  });

  it("no file anywhere writes a raw in-memory rating to Postgres", () => {
    // The check above covered one file. A raw `current_utr: x.currentUTR`
    // or `utr: x.currentUTR` written anywhere else raised 23514 for every
    // player without a rating, and nothing caught it (verifier, 2026-11-16).
    const RAW = /\bcurrent_utr\s*:\s*[\w.?!]*\bcurrentUTR\b(?!\s*(?:>|\?|&&|\|\|))|from\(\s*["']utr_entries["']\s*\)[\s\S]{0,300}?\.(?:insert|upsert|update)\([\s\S]{0,300}?\butr\s*:\s*[\w.?!]*\bcurrentUTR\b(?!\s*(?:>|\?|&&|\|\|))/;
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "node_modules" && !name.startsWith(".")) walk(full);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const m = codeOnly(full).match(RAW);
          if (m) hits.push(`${full.slice(REPO.length + 1)}: ${m[0]}`);
        }
      }
    };
    for (const d of ["lib", "app", "components"]) walk(join(REPO, d));
    expect(hits).toEqual([]);
  });

  it("the raw-write detector catches the spellings that slipped past", () => {
    const RAW = /\bcurrent_utr\s*:\s*[\w.?!]*\bcurrentUTR\b(?!\s*(?:>|\?|&&|\|\|))|from\(\s*["']utr_entries["']\s*\)[\s\S]{0,300}?\.(?:insert|upsert|update)\([\s\S]{0,300}?\butr\s*:\s*[\w.?!]*\bcurrentUTR\b(?!\s*(?:>|\?|&&|\|\|))/;
    expect(RAW.test("update({ current_utr: player.currentUTR })")).toBe(true);
    expect(RAW.test('from("utr_entries").insert({ utr: player.currentUTR, user_id })')).toBe(true);
    expect(RAW.test("current_utr: player.currentUTR > 0 ? player.currentUTR : null")).toBe(false);
  });

  it("onboarding does not log a starting UTR entry when there is none", () => {
    const ctx = read("lib/context/player-context.tsx");
    expect(ctx).toMatch(/if \(finalized\.currentUTR > 0\) \{[\s\S]*?createUtrEntry/);
  });

  it("neither onboarding write is an unhandled rejection any more", () => {
    const ctx = read("lib/context/player-context.tsx");
    expect(ctx).toMatch(/saveCurrentPlayer\(finalized\)\.catch\(/);
    expect(ctx).toMatch(/createUtrEntry\([\s\S]*?\}\)\.catch\(/);
  });

  it("every value the write path can produce satisfies the constraint", () => {
    const write = (v: number) => (v > 0 ? v : null);
    for (const v of [0, -1, 1, 7, 9.42, 16.5]) {
      expect(satisfiesProfilesCheck(write(v)), `currentUTR=${v}`).toBe(true);
    }
  });
});

describe("onboarding never records a rating the player did not choose", () => {
  // The signed-in onboarding defaulted the slider to 7 and saved it on an
  // untouched Continue — a "Starting UTR" of 7.0 in the player's history and
  // "My UTR is 7.0" in their coach email.
  it("starts with no rating, and step 1 needs a rating or an explicit 'none yet'", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "components/onboarding/onboarding-flow.tsx"), "utf8");
    expect(src).toMatch(/useState<number \| null>\(player\.currentUTR > 0 \? player\.currentUTR : null\)/);
    expect(src).toMatch(/step === 0\s*\?\s*utr != null \|\| noUtrYet/);
    expect(src).toMatch(/currentUTR: noUtrYet \|\| utr == null \? 0 : utr/);
  });
});
