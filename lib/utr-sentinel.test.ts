import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyPlayer } from "./data/user";

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
    const auth = read("lib/auth.ts");
    expect(auth).toContain("current_utr: player.currentUTR > 0 ? player.currentUTR : null");
    expect(auth).not.toMatch(/current_utr:\s*player\.currentUTR,/);
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
