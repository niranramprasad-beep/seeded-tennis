import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { latestFunctionDefinition, readMigrations } from "./migration-sql";

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

/* ---------------------------------------------------------------------------
 * 044: the roster respects the Family plan.
 *
 * 042 locked every cross-member READ behind the Family plan and left
 * `family_members()` alone — which still handed every member's current_utr,
 * grade, graduation_year, target_school_slugs and gender to a FREE family.
 * A free parent read 0 of the player's utr_entries, and the player's current
 * UTR straight off the roster. 044 returns those five columns NULL unless
 * `family_has_tier(<code>, 'family')` (the caller's own row excepted — they
 * can read it from `profiles` anyway). The identity / approval columns stay:
 * a free family must still be able to form (042's rule).
 *
 * This guard reads the LAST definition (comment-aware) and checks,
 * structurally rather than by spelling:
 *   1. each stat column in the final SELECT list is `case when <cond> then
 *      x.<col> end`, never bare;
 *   2. <cond> resolves — through the aliases the function itself defines —
 *      to a `family_has_tier(..., 'family')` call, not a constant;
 *   3. the plan never filters ROWS (no family_has_tier in a WHERE): pending
 *      requests and names must reach a free family's approval card.
 * The mutation cases at the bottom are the ways a rewrite could lose it.
 * ------------------------------------------------------------------------- */

const ROSTER_STAT_COLUMNS = ["current_utr", "grade", "graduation_year", "target_school_slugs", "gender"] as const;

/** The body between the function's dollar-quote tags. */
function functionBody(sql: string): string {
  const tag = /\bas\s+(\$\w*\$)/i.exec(sql);
  if (!tag) return "";
  const start = (tag.index ?? 0) + tag[0].length;
  const end = sql.indexOf(tag[1], start);
  return end === -1 ? sql.slice(start) : sql.slice(start, end);
}

/** Index of every paren-depth-0 occurrence of the keyword `word`. */
function topLevelWordIndexes(body: string, word: string): number[] {
  const out: number[] = [];
  let depth = 0;
  let inString = false;
  const re = new RegExp(`^${word}\\b`, "i");
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") inString = !inString;
    if (inString) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (depth === 0 && !/\w/.test(body[i - 1] ?? "") && re.test(body.slice(i))) out.push(i);
  }
  return out;
}

/** The outermost SELECT list: from the last depth-0 `select` to the next
 *  depth-0 `from`. */
function finalSelectList(body: string): string {
  const selects = topLevelWordIndexes(body, "select");
  if (selects.length === 0) return "";
  const at = selects[selects.length - 1];
  const from = topLevelWordIndexes(body, "from").find((i) => i > at);
  return body.slice(at + "select".length, from);
}

/** Every expression `<expr> as <alias>` defines `alias` with, anywhere in
 *  the body: scans back from `as <alias>` to the start of that list item. */
function aliasExpressions(body: string, alias: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(new RegExp(`\\bas\\s+${alias}\\b`, "gi"))) {
    const end = m.index ?? 0;
    let i = end - 1;
    let depth = 0;
    for (; i >= 0; i--) {
      const ch = body[i];
      if (ch === ")") depth++;
      else if (ch === "(") {
        if (depth === 0) break;
        depth--;
      } else if (depth === 0 && ch === ",") break;
      else if (depth === 0 && /\bselect$/i.test(body.slice(0, i + 1))) break;
    }
    out.push(body.slice(i + 1, end).trim());
  }
  return out;
}

const NOT_ALIASES = new Set(["or", "and", "not", "true", "false", "null", "is", "auth", "uid", "user_id", "public"]);

/** True when `expr` is, or is built from aliases that are, a
 *  family_has_tier(..., 'family') call. */
function resolvesToFamilyTier(body: string, expr: string, seen = new Set<string>()): boolean {
  if (/family_has_tier\s*\([^;]*?,\s*'family'\s*\)/i.test(expr)) return true;
  for (const m of expr.matchAll(/\b(?:\w+\.)?([a-z_][a-z0-9_]*)\b/gi)) {
    const id = m[1].toLowerCase();
    if (seen.has(id) || NOT_ALIASES.has(id)) continue;
    seen.add(id);
    for (const def of aliasExpressions(body, id)) {
      if (resolvesToFamilyTier(body, def, seen)) return true;
    }
  }
  return false;
}

/** Problems with the 044 gate, as sentences. Empty when it is intact. */
function rosterGateProblems(sql: string): string[] {
  const problems: string[] = [];
  const body = functionBody(sql);
  if (!body) return ["could not find the function body"];
  const list = finalSelectList(body);
  if (!list) return ["could not find the final SELECT list"];

  const caseRe = /case\s+when\s+([\s\S]+?)\s+then\s+(?:\w+\.)?(\w+)\s+(?:else\s+null\s+)?end(?:\s+as\s+(\w+))?/gi;
  const cases = [...list.matchAll(caseRe)];
  const stripped = list.replace(caseRe, " ");

  for (const col of ROSTER_STAT_COLUMNS) {
    if (new RegExp(`\\b${col}\\b`, "i").test(stripped)) {
      problems.push(`${col} is returned bare — it must be NULL unless the family is on the Family plan`);
      continue;
    }
    const c = cases.find((m) => m[2].toLowerCase() === col && (m[3] ?? col).toLowerCase() === col);
    if (!c) {
      problems.push(`${col} is missing from the roster's final SELECT list`);
      continue;
    }
    if (!resolvesToFamilyTier(body, c[1])) {
      problems.push(`${col}'s condition (${c[1].trim()}) does not come from family_has_tier(..., 'family')`);
    }
  }

  // The plan gates columns, never rows.
  for (const w of body.matchAll(/\bwhere\b([\s\S]*?)(?=\bunion\b|\border\b|\bselect\b|$)/gi)) {
    if (/family_has_tier|shares_family_plan_with/i.test(w[1])) {
      problems.push("family_has_tier filters ROWS — a free family must still see every member and pending request");
    }
  }
  return problems;
}

describe("044: the roster's player stats need the Family plan", () => {
  const def = latestFunctionDefinition("family_members", readMigrations());
  const good = def?.sql ?? "";

  it("the latest family_members() gates current_utr, grade, graduation_year, target_school_slugs and gender", () => {
    expect(def).not.toBeNull();
    expect(rosterGateProblems(good), def!.file).toEqual([]);
  });

  it("keeps the identity and approval columns ungated", () => {
    const stripped = finalSelectList(functionBody(good)).replace(/case\s+when[\s\S]+?end/gi, " ");
    for (const col of ["user_id", "name", "email", "role", "status", "joined_at", "reminded_at", "consent_status", "onboarded"]) {
      expect(stripped, `${col} must stay in the roster, ungated`).toMatch(new RegExp(`\\b\\w+\\.${col}\\b`, "i"));
    }
    expect(stripped).toMatch(/family_account_holder/i);
  });

  it("re-asserts the grants (anon and PUBLIC never execute the roster)", () => {
    const sql = good.toLowerCase();
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.family_members\(\)\s+from\s+public,\s*anon/);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.family_members\(\)\s+to\s+authenticated/);
  });

  // Each is a way a later rewrite could lose the gate. The detector must
  // name every one of them.
  const mutants: [string, string][] = [
    ["the gate removed (038's select list)", good.replace(/case when s\.stats_visible then (s\.\w+) end/gi, "$1")],
    ["one column left bare", good.replace(/case when s\.stats_visible then s\.current_utr end/i, "s.current_utr")],
    ["the condition made constant", good.replace(/case when s\.stats_visible then/gi, "case when true then")],
    ["the plan CTE made constant", good.replace(/coalesce\(public\.family_has_tier\(fam\.code, 'family'\), false\)/i, "true")],
    ["the wrong tier", good.replace(/family_has_tier\(fam\.code, 'family'\)/i, "family_has_tier(fam.code, 'player')")],
    ["own-row exception widened to everyone", good.replace(/\(plan\.unlocked or m\.user_id = auth\.uid\(\)\)/i, "(m.user_id is not null)")],
    [
      "the plan moved into WHERE (filters rows)",
      good.replace(/from shown s\b/i, "from shown s where public.family_has_tier((select code from fam), 'family')"),
    ],
    ["a stat column dropped", good.replace(/,\s*case when s\.stats_visible then s\.gender end\s+as gender/i, "")],
  ];

  it.each(mutants)("detects: %s", (_label, mutant) => {
    expect(mutant, "the mutation did not apply — update this case").not.toBe(good);
    expect(rosterGateProblems(mutant).length).toBeGreaterThan(0);
  });
});
