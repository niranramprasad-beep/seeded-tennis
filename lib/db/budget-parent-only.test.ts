import { describe, expect, it } from "vitest";
import {
  latestFunctionDefinition,
  latestPolicy,
  readMigrations,
  type MigrationFile,
} from "./migration-sql";

/* Migration 050: the season budget is parent-only, in the database.
 *
 * "Parents can write exactly two things: the season budget (and its
 * expenses) and encouragement notes" (CLAUDE.md). Until 050 the budget half
 * was untrue: is_parent_member() accepted ANY approved parent_accounts row,
 * and every joiner — player or parent — has one, so a sibling PLAYER could
 * insert/update/delete season_budgets and budget_expenses (measured on
 * staging 2026-11-15 and again before 050 on 2026-11-20; evidence in
 * ~/seeded-evidence/review-ready/r4-rls/).
 *
 * SQL cannot run under vitest, so this reads the migrations and fails the
 * build when the LAST definition of is_parent_member() stops requiring the
 * caller's own role = 'parent', when it regains an OR branch that skips the
 * role, when EXECUTE is no longer granted to `authenticated` (which would
 * fail every budget write closed), or when a budget write policy stops
 * calling it. The "mutation" block below proves each assertion can fail. */

const BUDGET_WRITE_POLICIES: { table: string; name: string; clause: "using" | "check" | "both" }[] = [
  { table: "season_budgets", name: "season_budgets_write_insert", clause: "check" },
  { table: "season_budgets", name: "season_budgets_write_update", clause: "both" },
  { table: "season_budgets", name: "season_budgets_write_delete", clause: "using" },
  { table: "budget_expenses", name: "budget_expenses_write_insert", clause: "check" },
  { table: "budget_expenses", name: "budget_expenses_write_update", clause: "both" },
  { table: "budget_expenses", name: "budget_expenses_write_delete", clause: "using" },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** Every reason the current migrations fail the 050 rule; empty = holds. */
export function budgetParentOnlyProblems(migrations: MigrationFile[]): string[] {
  const problems: string[] = [];
  const def = latestFunctionDefinition("is_parent_member", migrations);
  if (!def) return ["is_parent_member() is not defined by any migration"];

  const sql = norm(def.sql);
  const bodyMatch = sql.match(/as \$([a-z_]*)\$([\s\S]*?)\$\1\$/);
  const body = bodyMatch ? bodyMatch[2] : "";
  if (!body) problems.push(`${def.file}: could not find the body of is_parent_member()`);

  if (!/p\.id = \(? ?(select )?auth\.uid\(\) ?\)? and p\.role = 'parent'/.test(body)) {
    problems.push(`${def.file}: is_parent_member() must check the CALLER's own profiles.role = 'parent' (p.id = auth.uid() and p.role = 'parent')`);
  }
  if (!/public\.is_family_member\( ?target_family_code ?\)/.test(body)) {
    problems.push(`${def.file}: is_parent_member() must require approved membership via is_family_member(target_family_code)`);
  }
  if (/\bor\b/.test(body)) {
    problems.push(`${def.file}: is_parent_member() has an OR branch — that is how pre-050 let any approved joiner (players included) write the budget`);
  }
  if (!/security definer/.test(sql)) {
    problems.push(`${def.file}: is_parent_member() must stay SECURITY DEFINER (it reads profiles / parent_accounts under RLS)`);
  }
  if (!/grant execute on function public\.is_parent_member\(text\) to authenticated/.test(sql)) {
    problems.push(`${def.file}: EXECUTE on is_parent_member(text) must be granted to authenticated — six RLS policies call it, and a revoke fails every budget write closed`);
  }
  if (!/revoke all on function public\.is_parent_member\(text\) from anon/.test(sql)) {
    problems.push(`${def.file}: restate the revoke from anon (CLAUDE.md trap #2)`);
  }

  for (const p of BUDGET_WRITE_POLICIES) {
    const pol = latestPolicy(p.table, p.name, migrations);
    if (!pol) {
      problems.push(`${p.table}.${p.name} no longer exists — re-create it with is_parent_member(family_code)`);
      continue;
    }
    const s = norm(pol.sql);
    const usingPart = s.includes(" using ") ? s.slice(s.indexOf(" using "), s.includes(" with check ") ? s.indexOf(" with check ") : undefined) : "";
    const checkPart = s.includes(" with check ") ? s.slice(s.indexOf(" with check ")) : "";
    const calls = (part: string) => /is_parent_member\( ?family_code ?\)/.test(part);
    if ((p.clause === "using" || p.clause === "both") && !calls(usingPart)) {
      problems.push(`${pol.file}: ${p.table}.${p.name} USING must call is_parent_member(family_code)`);
    }
    if ((p.clause === "check" || p.clause === "both") && !calls(checkPart)) {
      problems.push(`${pol.file}: ${p.table}.${p.name} WITH CHECK must call is_parent_member(family_code)`);
    }
  }
  return problems;
}

describe("050: only an approved PARENT writes the season budget", () => {
  it("holds for the migrations in the repo", () => {
    expect(budgetParentOnlyProblems(readMigrations())).toEqual([]);
  });

  it("the latest definition is the one in 050 (or later)", () => {
    const def = latestFunctionDefinition("is_parent_member", readMigrations());
    expect((def?.file ?? "") >= "050").toBe(true);
  });
});

describe("050 guard: mutation tests (each mutation must be caught)", () => {
  const real = readMigrations();
  const withExtra = (sql: string): MigrationFile[] => [...real, { file: "999_mutation.sql", body: sql }];

  const fn = (body: string, grants = true) => `
create or replace function public.is_parent_member(target_family_code text)
returns boolean language sql stable security definer set search_path = public
as $$ ${body} $$;
revoke all on function public.is_parent_member(text) from public;
revoke all on function public.is_parent_member(text) from anon;
${grants ? "grant execute on function public.is_parent_member(text) to authenticated;" : ""}
`;

  it("catches the role check being dropped", () => {
    const m = withExtra(fn(`select target_family_code is not null and public.is_family_member(target_family_code)`));
    expect(budgetParentOnlyProblems(m).join("\n")).toMatch(/role = 'parent'/);
  });

  it("catches the pre-050 shape coming back (OR branch over parent_accounts)", () => {
    const m = withExtra(
      fn(`select exists (select 1 from public.profiles p where p.id = auth.uid() and p.family_code = target_family_code and p.role = 'parent')
          or exists (select 1 from public.parent_accounts pa where pa.user_id = auth.uid() and pa.family_code = target_family_code and pa.status = 'approved')`)
    );
    const problems = budgetParentOnlyProblems(m).join("\n");
    expect(problems).toMatch(/OR branch/);
  });

  it("catches a role check that sits only inside a commented-out line", () => {
    const m = withExtra(
      fn(`select public.is_family_member(target_family_code)
          -- and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent')
          `)
    );
    expect(budgetParentOnlyProblems(m).join("\n")).toMatch(/role = 'parent'/);
  });

  it("catches EXECUTE not granted to authenticated", () => {
    const m = withExtra(
      fn(`select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent') and public.is_family_member(target_family_code)`, false)
    );
    expect(budgetParentOnlyProblems(m).join("\n")).toMatch(/granted to authenticated/);
  });

  it("catches a write policy that stops calling is_parent_member", () => {
    const m = withExtra(`
drop policy if exists "budget_expenses_write_insert" on public.budget_expenses;
create policy "budget_expenses_write_insert" on public.budget_expenses for insert to authenticated
with check (public.is_family_member(family_code));`);
    expect(budgetParentOnlyProblems(m).join("\n")).toMatch(/budget_expenses_write_insert WITH CHECK/);
  });

  it("catches a write policy being dropped and not re-created", () => {
    const m = withExtra(`drop policy if exists "season_budgets_write_update" on public.season_budgets;`);
    expect(budgetParentOnlyProblems(m).join("\n")).toMatch(/season_budgets_write_update no longer exists/);
  });
});
