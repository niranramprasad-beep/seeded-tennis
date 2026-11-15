import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Guards the fix in migration 036 + lib/db/family-scope.ts.
//
// THE BUG THIS EXISTS TO PREVENT COMING BACK
// "Which family does this user belong to?" has two storage shapes: the
// creator's `profiles.family_code`, and every joiner's `parent_accounts` row
// (whose profiles.family_code is deliberately NULL, because writing that
// column is the family-takeover hole 022/032 closed).
//
// Eight call sites across five files scoped their queries by reading
// `profiles.family_code` directly. For a parent who joined with the code that
// is NULL, so each one bailed out — `if (!p.family_code) return []` — BEFORE
// RLS was ever consulted. The visible symptom was /family showing a parent
// none of their own player's real numbers. The invisible one was that a
// joined parent could not write the season budget or an encouragement note
// at all, which is the entire list of things a parent is allowed to write.
//
// `my_family_code()` (migration 026) answers across both shapes. Ask it.

const ROOTS = ["lib", "app", "components"];

/** lib/auth.ts is the one legitimate reader of the raw column, and the
 * reason is load-bearing rather than stylistic: mapProfileToPlayer() round-
 * trips the value straight back through writeCurrentPlayerProfile(), and
 * 022/030/035's trigger rejects ANY client change to family_code with 42501.
 * Substituting a joiner's real code there would make renaming yourself in
 * Settings fail for every member who joined with a code. */
const ALLOWED = new Set(["lib/auth.ts"]);

/** Strips `//` line comments and block comments so the long explanatory
 * notes in family-scope.ts / family.ts / events.ts (which necessarily SAY
 * `p.family_code` to warn about it) are not mistaken for code. */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** The offence: scoping a query by a profile row's family_code. */
const OFFENDING = /\b(?:p|profile|profileData|data)\s*\??\.\s*family_code\b/;

export function offends(source: string): boolean {
  return OFFENDING.test(stripComments(source));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the detector itself is not vacuous", () => {
  // Three vacuous guards shipped in one night (a `\s` in a POSIX-ERE
  // `git grep -E` pattern matches nothing; an anchor on git grep's own
  // `file:line:` output prefix never matches file content). A guard that
  // cannot fail is worse than no guard, so this one is made to fail here.
  it("flags the exact call shapes that were wrong", () => {
    expect(offends('query.eq("family_code", p.family_code)')).toBe(true);
    expect(offends('if (!supabase || !p?.family_code) return [];')).toBe(true);
    expect(offends('familyCode: data?.family_code ?? null,')).toBe(true);
    expect(offends('family_code: profile.family_code ?? undefined,')).toBe(true);
    expect(offends('const c = profileData.family_code;')).toBe(true);
  });

  it("does not flag prose that merely mentions the column", () => {
    expect(offends("// never scope by p.family_code — ask my_family_code()")).toBe(false);
    expect(offends("/* p?.family_code is NULL for a joiner */")).toBe(false);
  });

  it("does not flag the correct shapes", () => {
    expect(offends('query.eq("family_code", familyCode)')).toBe(false);
    expect(offends('const familyCode = await resolveMyFamilyCode(supabase);')).toBe(false);
    expect(offends('family_code: ctx.familyCode,')).toBe(false);
  });
});

describe("no file scopes a family query by profiles.family_code", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("finds a real, non-trivial set of files to check", () => {
    // If the walk breaks, every assertion below passes for the wrong reason.
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain(join("lib", "db", "family.ts"));
    expect(files).toContain(join("lib", "db", "events.ts"));
    expect(files).toContain(join("lib", "api-auth.ts"));
  });

  it("has no offenders outside the one documented exception", () => {
    const offenders = files
      .filter((f) => !ALLOWED.has(f.split(/[\\/]/).join("/")))
      .filter((f) => offends(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("still finds the documented exception, so the allow-list is real", () => {
    // If lib/auth.ts ever stops reading the raw column, delete it from
    // ALLOWED in the same commit rather than leaving a stale exemption.
    expect(offends(readFileSync(join("lib", "auth.ts"), "utf8"))).toBe(true);
  });
});

describe("migration 036 keeps the parts the fix depends on", () => {
  const sql = readFileSync(
    join("supabase", "migrations", "036_family_membership_both_shapes.sql"),
    "utf8"
  );

  it("defines the one membership predicate and keeps EXECUTE for authenticated", () => {
    expect(sql).toContain("create or replace function public.shares_approved_family_with");
    // Revoking this fails every policy that calls it CLOSED — proven on
    // staging in 027. Do not re-litigate it from the advisor's wording.
    expect(sql).toMatch(
      /grant execute on function public\.shares_approved_family_with\(uuid\) to authenticated/
    );
  });

  it("only counts APPROVED links, so a pending member is not a member", () => {
    expect(sql).toMatch(/status = 'approved'/);
    expect(sql).not.toMatch(/status\s*(?:=|in)\s*\(?'pending'/);
  });

  it("rewrites every family read policy that keyed off the owner's profile column", () => {
    for (const policy of [
      "family_members_read",
      "utr_entries_select_family",
      "matches_read",
      "tournament_entries_read",
      "coach_outreach_read",
      "daily_checkins_read",
      "cost_calculations_read",
    ]) {
      expect(sql).toContain(`create policy "${policy}"`);
    }
  });

  it("stamps family_code in the database and freezes it on UPDATE", () => {
    expect(sql).toContain("create or replace function public.stamp_family_code");
    // INSERT takes the server's answer, never the client's.
    expect(sql).toContain("new.family_code := public.my_family_code();");
    // UPDATE cannot re-parent a row into another family.
    expect(sql).toContain("new.family_code := old.family_code;");
    for (const table of [
      "matches",
      "coach_outreach",
      "tournament_entries",
      "daily_checkins",
      "cost_calculations",
      "encouragement_notes",
      "season_budgets",
      "budget_expenses",
      "parent_reports",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
  });

  it("does NOT set a joiner's profiles.family_code", () => {
    // That write is the takeover capability, and remove_family_member() only
    // deletes the parent_accounts row — so a removed member would keep a
    // family_code and keep their access. Revocation lives in one place.
    expect(sql).not.toMatch(/update\s+public\.profiles\s+set\s+family_code/i);
  });
});
