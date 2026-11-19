import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  latestFunctionDefinition,
  latestPolicy,
  policyStatements,
  readMigrations,
  withoutComments,
} from "./migration-sql";
import { FAMILY_PLAN_ROUTES, familyPlanStatusFor } from "./family-plan";
import { FEATURE_TIER } from "@/lib/types";

/* The Family plan lock (B4, migration 042).
 *
 * "RLS is a ceiling": a family is unlocked only when some member is on the
 * Family tier, and the database — not AuthGate/PaidGate — is what hides
 * another member's rows and the shared budget/notes/reports from a family
 * that is not. These tests read the migration SQL (it cannot run under
 * vitest) and fail the build when:
 *   - a table gains a cross-member read (a policy using
 *     shares_approved_family_with) without the 042 ceiling;
 *   - the ceiling on a table stops short-circuiting on the member's OWN rows;
 *   - a Family-plan table loses its family_has_tier gate;
 *   - an API route touches budget / report / note data without
 *     refuseUnlessFamilyPlan().
 * Each was mutation-tested against a scratch copy of the SQL; see
 * docs/HANDOFF.md §J Step 17. */

const migrations = readMigrations();
const GATE = "family_plan_required";

/** Tables whose CURRENT policy set includes a cross-member read. */
function tablesWithCrossMemberReads(): string[] {
  const tables = new Set<string>();
  for (const p of policyStatements(migrations)) {
    if (p.name === GATE) continue;
    if (!/shares_approved_family_with\s*\(/i.test(p.sql)) continue;
    const still = latestPolicy(p.table, p.name, migrations);
    if (still && /shares_approved_family_with\s*\(/i.test(still.sql)) tables.add(p.table);
  }
  return [...tables].sort();
}

describe("042: every cross-member read is behind the Family plan", () => {
  it("finds the cross-member reads (sanity: the parser still works)", () => {
    // 036/037 left exactly these on 2026-11-18 (pg_policies on staging).
    expect(tablesWithCrossMemberReads()).toEqual(
      expect.arrayContaining([
        "coach_outreach",
        "cost_calculations",
        "daily_checkins",
        "matches",
        "tournament_entries",
        "utr_entries",
      ])
    );
  });

  it.each(tablesWithCrossMemberReads())(
    "%s has a RESTRICTIVE family_plan_required SELECT ceiling that keeps own rows",
    (table) => {
      const policy = latestPolicy(table, GATE, migrations);
      expect(
        policy,
        `${table} has a policy using shares_approved_family_with() but no ${GATE} ceiling. ` +
          `A free family member could read another member's ${table} rows straight from PostgREST.`
      ).not.toBeNull();
      const sql = policy!.sql.toLowerCase().replace(/\s+/g, " ");
      expect(sql, `${policy!.file}: ${table}.${GATE} must be RESTRICTIVE`).toMatch(/as restrictive/);
      expect(sql, `${policy!.file}: ${table}.${GATE} must cover SELECT`).toMatch(/for (select|all)/);
      expect(
        sql,
        `${policy!.file}: ${table}.${GATE} must short-circuit on the member's own rows`
      ).toMatch(/user_id = \( ?select auth\.uid\(\) ?\)/);
      expect(
        sql,
        `${policy!.file}: ${table}.${GATE} must gate the cross-member half on the Family plan`
      ).toMatch(/shares_family_plan_with\s*\(\s*user_id\s*\)/);
    }
  );
});

describe("042: Family-plan data needs the plan to read AND write", () => {
  it.each(["season_budgets", "budget_expenses", "parent_reports"])(
    "%s: restrictive FOR ALL, family_has_tier on USING and WITH CHECK",
    (table) => {
      const policy = latestPolicy(table, GATE, migrations);
      expect(policy, `${table} lost its ${GATE} policy`).not.toBeNull();
      const sql = policy!.sql.toLowerCase().replace(/\s+/g, " ");
      expect(sql).toMatch(/as restrictive for all/);
      const using = sql.slice(sql.indexOf("using"), sql.indexOf("with check"));
      const check = sql.slice(sql.indexOf("with check"));
      expect(using, `${table}: USING must call family_has_tier(family_code, 'family')`).toMatch(
        /family_has_tier\s*\(\s*family_code\s*,\s*'family'\s*\)/
      );
      expect(check, `${table}: WITH CHECK must call family_has_tier(family_code, 'family')`).toMatch(
        /family_has_tier\s*\(\s*family_code\s*,\s*'family'\s*\)/
      );
    }
  );

  it("encouragement_notes: the author keeps their own notes; reading others' and writing need the plan", () => {
    const policy = latestPolicy("encouragement_notes", GATE, migrations);
    expect(policy).not.toBeNull();
    const sql = policy!.sql.toLowerCase().replace(/\s+/g, " ");
    expect(sql).toMatch(/as restrictive for all/);
    const using = sql.slice(sql.indexOf("using"), sql.indexOf("with check"));
    const check = sql.slice(sql.indexOf("with check"));
    expect(using).toMatch(/parent_id = \( ?select auth\.uid\(\) ?\)/);
    expect(using).toMatch(/family_has_tier\s*\(\s*family_code\s*,\s*'family'\s*\)/);
    expect(check).toMatch(/family_has_tier\s*\(\s*family_code\s*,\s*'family'\s*\)/);
    // A new note must NOT be allowed just because the writer is the author.
    expect(check).not.toMatch(/parent_id/);
  });
});

describe("042: the predicates", () => {
  it("family_has_tier counts BOTH membership shapes, approved links only, and only answers about your own family", () => {
    const def = latestFunctionDefinition("family_has_tier", migrations);
    expect(def).not.toBeNull();
    const sql = def!.sql.toLowerCase();
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/p\.family_code\s*=\s*p_code/);
    expect(sql).toMatch(/parent_accounts/);
    expect(sql).toMatch(/status\s*=\s*'approved'/);
    expect(sql).toMatch(/subscription_tier\s*=\s*'family'/);
    // No oracle: a signed-in caller only gets an answer for a family they are in.
    expect(sql).toMatch(/is_family_member\s*\(\s*p_code\s*\)/);
    // Used inside RLS policies, so `authenticated` must keep EXECUTE (CLAUDE.md).
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.family_has_tier\(text,\s*text\)\s+to\s+authenticated/);
  });

  it("shares_family_plan_with gates on the code that actually links the two rows", () => {
    const def = latestFunctionDefinition("shares_family_plan_with", migrations);
    expect(def).not.toBeNull();
    const sql = def!.sql.toLowerCase();
    expect(sql).toMatch(/join\s+theirs\s+using\s*\(\s*code\s*\)/);
    expect(sql).toMatch(/family_has_tier\s*\(\s*code\s*,\s*'family'\s*\)/);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.shares_family_plan_with\(uuid\)\s+to\s+authenticated/);
  });

  it("my_family_has_tier asks about my_family_code(), and is callable by the app", () => {
    const def = latestFunctionDefinition("my_family_has_tier", migrations);
    expect(def).not.toBeNull();
    const sql = def!.sql.toLowerCase();
    expect(sql).toMatch(/family_has_tier\s*\(\s*public\.my_family_code\(\)\s*,\s*p_tier\s*\)/);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+public\.my_family_has_tier\(text\)\s+from\s+public,\s*anon/);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function\s+public\.my_family_has_tier\(text\)\s+to\s+authenticated/);
  });

  it("does not gate the join/approve/consent RPCs (a free family must still form)", () => {
    for (const fn of ["join_family", "approve_family_join", "grant_parent_consent", "remove_family_member"]) {
      const def = latestFunctionDefinition(fn, migrations);
      expect(def, fn).not.toBeNull();
      expect(def!.sql, `${fn} must not require the Family plan`).not.toMatch(/family_has_tier|shares_family_plan_with/i);
    }
  });

  it("gates only the roster's stat COLUMNS, never its rows (044)", () => {
    // 044 nulls current_utr / grade / graduation_year / target_school_slugs /
    // gender for a free family; family-roster-shape.test.ts checks that
    // structurally. Here: the plan never decides WHO is on the roster.
    const def = latestFunctionDefinition("family_members", migrations);
    expect(def).not.toBeNull();
    for (const w of def!.sql.matchAll(/\bwhere\b([\s\S]*?)(?=\bunion\b|\border\b|\bselect\b|\$fn\$)/gi)) {
      expect(w[1], "family_members() must not filter rows by the plan").not.toMatch(
        /family_has_tier|shares_family_plan_with/i
      );
    }
  });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------

const API_DIR = join(__dirname, "..", "..", "app", "api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** Signals that a route reads or writes Family-plan data. */
const FAMILY_PLAN_DATA =
  /season_budgets|budget_expenses|parent_reports|encouragement_notes|saveSeasonBudget|saveBudgetExpense|loadSeasonBudget|loadBudgetExpenses|loadParentReports|loadEncouragementNotes|saveEncouragementNote/;

/** Routes allowed to touch that data without the gate, with the reason. */
const EXEMPT: Record<string, string> = {
  // The account export is the person's right of access. It must never 403
  // on a plan; RLS already returns only what the account may read.
  "account/export/route.ts": "right-of-access export; RLS scopes it",
};

describe("042: API routes that touch Family-plan data refuse when locked", () => {
  const files = routeFiles(API_DIR);

  it("found the route files (sanity)", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("every such route calls refuseUnlessFamilyPlan()", () => {
    const offenders: string[] = [];
    let gated = 0;
    for (const file of files) {
      const rel = relative(API_DIR, file).split("\\").join("/");
      const src = readFileSync(file, "utf8");
      // Comments must not satisfy (or trigger) the check.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (!FAMILY_PLAN_DATA.test(code)) continue;
      if (EXEMPT[rel]) continue;
      if (/await\s+refuseUnlessFamilyPlan\s*\(/.test(code)) gated += 1;
      else offenders.push(rel);
    }
    expect(offenders, `routes touching Family-plan data without refuseUnlessFamilyPlan(): ${offenders.join(", ")}`).toEqual([]);
    expect(gated, "expected at least the two budget routes").toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// App contract
// ---------------------------------------------------------------------------

function stubClient(answers: Record<string, { data: unknown; error: unknown }>) {
  const calls: { fn: string; args?: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return answers[fn] ?? { data: null, error: { message: "no stub" } };
      },
    } as unknown as Parameters<typeof familyPlanStatusFor>[0],
  };
}

describe("lib/db/family-plan.ts contract", () => {
  it("exports the Family-plan routes the UI gates", () => {
    expect([...FAMILY_PLAN_ROUTES]).toEqual(["/family", "/family/budget", "/family/weekly-reports"]);
  });

  it("FEATURE_TIER.family is still 'family'", () => {
    expect(FEATURE_TIER.family).toBe("family");
  });

  it("no family -> no-family, and never asks about the tier", async () => {
    const { client, calls } = stubClient({ my_family_code: { data: null, error: null } });
    await expect(familyPlanStatusFor(client)).resolves.toEqual({
      unlocked: false,
      familyCode: null,
      reason: "no-family",
    });
    expect(calls.map((c) => c.fn)).toEqual(["my_family_code"]);
  });

  it("unlocked family -> family", async () => {
    const { client, calls } = stubClient({
      my_family_code: { data: "FAKEFAM-PB2", error: null },
      my_family_has_tier: { data: true, error: null },
    });
    await expect(familyPlanStatusFor(client)).resolves.toEqual({
      unlocked: true,
      familyCode: "FAKEFAM-PB2",
      reason: "family",
    });
    expect(calls[1]).toEqual({ fn: "my_family_has_tier", args: { p_tier: "family" } });
  });

  it("free family -> free", async () => {
    const { client } = stubClient({
      my_family_code: { data: "FAKEFAM-PB1", error: null },
      my_family_has_tier: { data: false, error: null },
    });
    await expect(familyPlanStatusFor(client)).resolves.toMatchObject({ unlocked: false, reason: "free" });
  });

  it("fails CLOSED when the tier check errors", async () => {
    const { client } = stubClient({
      my_family_code: { data: "FAKEFAM-PB2", error: null },
      my_family_has_tier: { data: null, error: { message: "boom" } },
    });
    await expect(familyPlanStatusFor(client)).resolves.toMatchObject({ unlocked: false, reason: "free" });
  });
});

// Keep the comment-stripper honest for this file's own needs.
describe("withoutComments", () => {
  it("drops -- comments but keeps -- inside a string literal", () => {
    expect(withoutComments("select 1; -- family_has_tier")).not.toContain("family_has_tier");
    expect(withoutComments("select '--x' as a -- gone")).toContain("'--x'");
  });
});
