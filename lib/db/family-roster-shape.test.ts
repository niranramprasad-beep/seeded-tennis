import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* The family roster must return ONE ROW PER MEMBER, and `is_creator` must mean
 * the account holder the database actually enforces.
 *
 * Both of those were false until migration 038, and the reason they were false
 * is worth keeping in a test rather than a comment: membership has two storage
 * shapes (`profiles.family_code`, or an approved `parent_accounts` row), the
 * repo describes them as alternatives, and on production they are not.
 * **All three `parent_accounts` rows belong to users whose own
 * `profiles.family_code` is the same code** — the pre-023 shape, when the app
 * wrote both. `family_members()` was a `UNION ALL` of the two shapes, so every
 * one of those people came back twice (measured: 9 rows for 6 people), and
 * `is_creator` was true for the whole `profiles` branch, i.e. for four people
 * in a family with one account holder.
 *
 * Two user-visible consequences on `/family`: duplicate member cards keyed by
 * `userId` (a React key collision), and three removable members labelled
 * "account holder" with their Remove button hidden — while their duplicate row
 * offered one.
 *
 * Two rehearsals missed it because they seeded a tidy creator/joiner split.
 * This test is here so the next rewrite of `family_members()` cannot quietly
 * go back to the UNION ALL, whatever the seed data looks like. */

const MIGRATIONS = join(__dirname, "..", "..", "supabase", "migrations");

/** Every migration that (re)defines `family_members()`, oldest first. */
function migrationsDefiningFamilyMembers(): { file: string; body: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, body: readFileSync(join(MIGRATIONS, file), "utf8") }))
    .filter(({ body }) => /create\s+(or\s+replace\s+)?function\s+public\.family_members\s*\(/i.test(body));
}

/** The text of the LAST definition in the last migration that writes one.
 *  That is what a freshly built database ends up with, and what production
 *  gets at the end of the rollout. */
function latestDefinition(): { file: string; sql: string } {
  const defining = migrationsDefiningFamilyMembers();
  expect(defining.length).toBeGreaterThan(0);
  const last = defining[defining.length - 1];
  const starts = [...last.body.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.family_members\s*\(/gi)];
  const from = starts[starts.length - 1].index ?? 0;
  return { file: last.file, sql: last.body.slice(from) };
}

/** Strip SQL comments so a `--` line can never satisfy a check below.
 *  Deliberately simple: these files have no `--` inside string literals, and
 *  the assertions are all "does this token appear", so a conservative strip
 *  can only make the test stricter. */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

describe("family_members() roster shape", () => {
  it("is defined by at least one migration", () => {
    const files = migrationsDefiningFamilyMembers().map((m) => m.file);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("returns one row per member — no bare UNION ALL of the two storage shapes", () => {
    const { file, sql } = latestDefinition();
    const body = withoutComments(sql).toLowerCase();

    // It still has to read both shapes...
    expect(body, `${file}: must still read parent_accounts`).toContain("parent_accounts");
    expect(body, `${file}: must still read profiles`).toContain("profiles");

    // ...but it must collapse them per member.
    const dedupes =
      /distinct\s+on\s*\(\s*\w*\.?user_id\s*\)/.test(body) ||
      /group\s+by\s+[\s\S]{0,40}user_id/.test(body);
    expect(
      dedupes,
      `${file}: family_members() must return one row per user_id. ` +
        `A plain UNION ALL of profiles.family_code and parent_accounts returns ` +
        `anyone holding BOTH shapes twice, which is every one of production's ` +
        `three parent_accounts users. Use DISTINCT ON (user_id) or GROUP BY.`
    ).toBe(true);
  });

  it("derives is_creator from family_account_holder(), not from the profiles branch", () => {
    const { file, sql } = latestDefinition();
    const body = withoutComments(sql).toLowerCase();

    expect(
      body,
      `${file}: is_creator must come from family_account_holder(), the predicate ` +
        `remove_family_member() refuses on (037). Setting it true for the whole ` +
        `profiles branch labels every code-holding member "account holder" and ` +
        `hides the Remove button from members who really are removable.`
    ).toContain("family_account_holder");

    // The old shape: a hardcoded `true` for the profiles branch next to a
    // hardcoded `false` for the links. If both literals are still there as
    // the is_creator value, the fix was reverted.
    const hardcodedPair = /,\s*true\s*,/.test(body) && /,\s*false\s*,/.test(body);
    expect(
      hardcodedPair,
      `${file}: is_creator looks hardcoded per branch again (a literal true in ` +
        `one SELECT list and false in the other).`
    ).toBe(false);
  });

  it("keeps the roster function SECURITY DEFINER with an enumerated column list", () => {
    const { file, sql } = latestDefinition();
    const body = withoutComments(sql);

    expect(body.toLowerCase(), `${file}: must stay SECURITY DEFINER`).toContain("security definer");
    // 037's reason: RLS cannot narrow columns, so the roster's entire
    // cross-user surface is this list. It must be spelled out, never `p.*`.
    expect(body).not.toMatch(/select\s+p2?\.\*/i);
    for (const col of ["user_id", "name", "email", "role", "status", "is_creator"]) {
      expect(body, `${file}: roster must still return ${col}`).toContain(col);
    }
    // And the privileged columns must never appear in it.
    for (const forbidden of ["gpa", "birth_year", "whop_membership_id", "stripe_customer_id", "stripe_subscription_id"]) {
      expect(
        body.toLowerCase().includes(forbidden),
        `${file}: ${forbidden} must not be in the family roster — RLS cannot ` +
          `narrow columns, so this function's column list IS the privacy boundary (037).`
      ).toBe(false);
    }
  });
});
