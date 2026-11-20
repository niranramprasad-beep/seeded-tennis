import { describe, expect, it } from "vitest";
import {
  latestPolicy,
  policyStatements,
  readMigrations,
  withoutComments,
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
 * SQL cannot run under vitest, so this reads the migrations. It is
 * deliberately STRICT, because an independent review defeated the first
 * version eight ways (an extra permissive policy under another name, a body
 * rewritten with bool_or/greatest/union so it never says "or", a redefinition
 * without the `public.` prefix, and later grant/revoke/alter statements):
 *
 *   1. The LAST definition of is_parent_member — qualified or not — must have
 *      exactly the 050 body (whitespace/case-insensitive), take one text
 *      argument, and be SECURITY DEFINER. Changing the body means changing
 *      this test in the same commit, on purpose.
 *   2. Nothing after it may ALTER the function, revoke EXECUTE from
 *      `authenticated` (fails every budget write closed) or grant it to
 *      anon/public; its own file must grant authenticated and revoke anon.
 *   3. The only PERMISSIVE write policies on season_budgets/budget_expenses
 *      are the six named below, each calling is_parent_member(family_code)
 *      in the right clause; no ALTER POLICY and no DISABLE ROW LEVEL
 *      SECURITY on either table afterwards.
 *
 * Every mutation the review used is a case in the block at the bottom. */

const TABLES = ["season_budgets", "budget_expenses"] as const;

const BUDGET_WRITE_POLICIES: { table: string; name: string; clause: "using" | "check" | "both" }[] = [
  { table: "season_budgets", name: "season_budgets_write_insert", clause: "check" },
  { table: "season_budgets", name: "season_budgets_write_update", clause: "both" },
  { table: "season_budgets", name: "season_budgets_write_delete", clause: "using" },
  { table: "budget_expenses", name: "budget_expenses_write_insert", clause: "check" },
  { table: "budget_expenses", name: "budget_expenses_write_update", clause: "both" },
  { table: "budget_expenses", name: "budget_expenses_write_delete", clause: "using" },
];

/** 050's body, normalised. The single source of truth for this guard. */
const CANONICAL_BODY = norm(`
  select target_family_code is not null
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'parent'
     )
     and public.is_family_member(target_family_code)
`);

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=])\s*/g, "$1")
    .trim();
}

interface Located {
  fileIndex: number;
  file: string;
  at: number;
  text: string;
}

/** Every regex match across the comment-stripped migrations, in apply order. */
function findAll(migrations: MigrationFile[], re: RegExp): Located[] {
  const out: Located[] = [];
  migrations.forEach((m, fileIndex) => {
    const body = withoutComments(m.body);
    for (const match of body.matchAll(new RegExp(re.source, "gi"))) {
      out.push({ fileIndex, file: m.file, at: match.index ?? 0, text: match[0] });
    }
  });
  return out;
}

const after = (a: Located, b: Located) => a.fileIndex > b.fileIndex || (a.fileIndex === b.fileIndex && a.at > b.at);

/** Every reason the current migrations fail the 050 rule; empty = holds. */
export function budgetParentOnlyProblems(migrations: MigrationFile[]): string[] {
  const problems: string[] = [];

  // ---- 1. the function ------------------------------------------------------
  const defs = findAll(
    migrations,
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\s*\.\s*)?"?is_parent_member"?\s*\(([^)]*)\)([\s\S]*?)as\s+\$([a-z_]*)\$([\s\S]*?)\$\3\$/
  );
  if (defs.length === 0) return ["is_parent_member() is not defined by any migration"];
  const last = defs[defs.length - 1];
  const parts = last.text.match(
    /function\s+(?:public\s*\.\s*)?"?is_parent_member"?\s*\(([^)]*)\)([\s\S]*?)as\s+\$([a-z_]*)\$([\s\S]*?)\$\3\$/i
  )!;
  const args = norm(parts[1]);
  const header = norm(parts[2]);
  const body = norm(parts[4]);
  if (!/^(target_family_code\s+)?text$/.test(args)) {
    problems.push(`${last.file}: is_parent_member must take exactly one text argument (got "${args}") — an overload is a second, unguarded definition`);
  }
  if (!/^create\s+or\s+replace\s+function\s+public\./i.test(last.text)) {
    problems.push(`${last.file}: define is_parent_member as \`create or replace function public.is_parent_member\` (schema-qualified)`);
  }
  if (body !== CANONICAL_BODY) {
    problems.push(
      `${last.file}: is_parent_member() body is not 050's. It must be the caller's own role = 'parent' AND is_family_member(code), nothing else — the pre-050 OR over parent_accounts is how a sibling player wrote the budget. If you are changing it on purpose, update CANONICAL_BODY here in the same commit.`
    );
  }
  if (!/security definer/.test(header)) {
    problems.push(`${last.file}: is_parent_member() must stay SECURITY DEFINER`);
  }

  // ---- 2. grants / alters ---------------------------------------------------
  const fnRef = String.raw`(?:public\s*\.\s*)?"?is_parent_member"?`;
  const sameFileTail = withoutComments(migrations[last.fileIndex].body).slice(last.at);
  if (!new RegExp(String.raw`grant\s+execute\s+on\s+function\s+${fnRef}\s*\(\s*text\s*\)\s+to\s+[^;]*\bauthenticated\b`, "i").test(sameFileTail)) {
    problems.push(`${last.file}: EXECUTE on is_parent_member(text) must be granted to authenticated — six RLS policies call it, and without it every budget write fails closed`);
  }
  if (!new RegExp(String.raw`revoke\s+all\s+on\s+function\s+${fnRef}\s*\(\s*text\s*\)\s+from\s+[^;]*\banon\b`, "i").test(sameFileTail)) {
    problems.push(`${last.file}: restate \`revoke all on function public.is_parent_member(text) from anon\` (CLAUDE.md trap #2)`);
  }
  for (const a of findAll(migrations, new RegExp(String.raw`alter\s+function\s+${fnRef}[^;]*;`))) {
    if (after(a, last)) problems.push(`${a.file}: ALTER FUNCTION is_parent_member after its 050 definition — change it with a full, guarded redefinition instead`);
  }
  for (const r of findAll(migrations, new RegExp(String.raw`revoke\s+[^;]*on\s+function\s+${fnRef}[^;]*from\s+[^;]*\bauthenticated\b[^;]*;`))) {
    if (after(r, last)) problems.push(`${r.file}: revokes EXECUTE on is_parent_member from authenticated — every budget write would fail closed`);
  }
  for (const g of findAll(migrations, new RegExp(String.raw`grant\s+[^;]*on\s+function\s+${fnRef}[^;]*to\s+[^;]*\b(anon|public)\b[^;]*;`))) {
    if (after(g, last)) problems.push(`${g.file}: grants EXECUTE on is_parent_member to anon/public`);
  }

  // ---- 3. policies ----------------------------------------------------------
  const allowed = new Set(BUDGET_WRITE_POLICIES.map((p) => `${p.table}.${p.name}`));
  const names = new Set(
    policyStatements(migrations)
      .filter((p) => (TABLES as readonly string[]).includes(p.table))
      .map((p) => `${p.table}.${p.name}`)
  );
  for (const key of names) {
    const [table, name] = key.split(".");
    const pol = latestPolicy(table, name, migrations);
    if (!pol) continue;
    const s = norm(pol.sql);
    if (/as restrictive/.test(s)) continue;
    const cmd = (s.match(/\bfor\s+(all|select|insert|update|delete)\b/) ?? [null, "all"])[1];
    if (cmd === "select") continue;
    if (!allowed.has(key)) {
      problems.push(`${pol.file}: ${key} is a PERMISSIVE ${cmd.toUpperCase()} policy on a budget table. Permissive policies OR together, so any extra write policy bypasses the parent check. Only the six *_write_* policies may exist.`);
    }
  }
  for (const p of BUDGET_WRITE_POLICIES) {
    const pol = latestPolicy(p.table, p.name, migrations);
    if (!pol) {
      problems.push(`${p.table}.${p.name} no longer exists — re-create it with is_parent_member(family_code)`);
      continue;
    }
    const s = norm(pol.sql);
    const wc = s.indexOf("with check");
    const us = s.search(/\busing\(/);
    const usingPart = us >= 0 ? s.slice(us, wc > us ? wc : undefined) : "";
    const checkPart = wc >= 0 ? s.slice(wc) : "";
    const calls = (part: string) =>
      /^(using|with check)\((public\.)?is_parent_member\(family_code\)\);?$/.test(part.trim());
    if ((p.clause === "using" || p.clause === "both") && !calls(usingPart)) {
      problems.push(`${pol.file}: ${p.table}.${p.name} USING must be exactly is_parent_member(family_code)`);
    }
    if ((p.clause === "check" || p.clause === "both") && !calls(checkPart)) {
      problems.push(`${pol.file}: ${p.table}.${p.name} WITH CHECK must be exactly is_parent_member(family_code)`);
    }
  }
  const fnDefOf050 = defs.find((d) => d.file.startsWith("050"));
  const since = fnDefOf050 ?? last;
  for (const t of TABLES) {
    for (const a of findAll(migrations, new RegExp(String.raw`alter\s+policy\s+[^;]*\bon\s+(?:public\s*\.\s*)?"?${t}"?[^;]*;`))) {
      if (after(a, since)) problems.push(`${a.file}: ALTER POLICY on ${t} — drop and re-create instead, so this guard sees it`);
    }
    for (const d of findAll(migrations, new RegExp(String.raw`alter\s+table\s+(?:only\s+)?(?:public\s*\.\s*)?"?${t}"?\s+(disable|no\s+force)\s+row\s+level\s+security`))) {
      problems.push(`${d.file}: turns row level security off on ${t}`);
    }
  }
  return problems;
}

describe("050: only an approved PARENT writes the season budget", () => {
  it("holds for the migrations in the repo", () => {
    expect(budgetParentOnlyProblems(readMigrations())).toEqual([]);
  });
});

describe("050 guard: mutation tests (each mutation must be caught)", () => {
  const real = readMigrations();
  const withExtra = (sql: string): MigrationFile[] => [...real, { file: "999_mutation.sql", body: sql }];
  const problemsFor = (sql: string) => budgetParentOnlyProblems(withExtra(sql)).join("\n");

  const fn = (body: string, opts: { grants?: boolean; schema?: string; header?: string } = {}) => `
create or replace function ${opts.schema ?? "public."}is_parent_member(target_family_code text)
returns boolean language sql stable ${opts.header ?? "security definer"} set search_path = public
as $$ ${body} $$;
revoke all on function public.is_parent_member(text) from public;
revoke all on function public.is_parent_member(text) from anon;
${opts.grants === false ? "" : "grant execute on function public.is_parent_member(text) to authenticated;"}
`;
  const ROLE = `exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent')`;
  const PA = `exists (select 1 from public.parent_accounts pa where pa.user_id = auth.uid() and pa.family_code = target_family_code and pa.status = 'approved')`;

  it("sanity: re-stating 050 verbatim passes", () => {
    expect(
      problemsFor(fn(`select target_family_code is not null and ${ROLE} and public.is_family_member(target_family_code)`))
    ).toBe("");
  });

  it.each([
    ["role check dropped", `select target_family_code is not null and public.is_family_member(target_family_code)`],
    ["pre-050 OR over parent_accounts", `select ${ROLE} or ${PA}`],
    ["bool_or over a union (never says 'or')", `select bool_or(x) from (select ${ROLE} and public.is_family_member(target_family_code) as x union all select ${PA}) t`],
    ["greatest(role-and-member, pa-branch)", `select greatest(${ROLE} and public.is_family_member(target_family_code), ${PA})`],
    ["role check wrapped in IS NOT NULL", `select (${ROLE}) is not null and public.is_family_member(target_family_code)`],
    ["role check only in a comment", `select public.is_family_member(target_family_code) -- and ${ROLE}\n`],
  ])("catches a body mutation: %s", (_label, body) => {
    expect(problemsFor(fn(body))).toMatch(/body is not 050's/);
  });

  it("catches a redefinition without the public. prefix", () => {
    expect(problemsFor(fn(`select ${ROLE} or ${PA}`, { schema: "" }))).toMatch(/body is not 050's|schema-qualified/);
  });

  it("catches SECURITY INVOKER", () => {
    const body = `select target_family_code is not null and ${ROLE} and public.is_family_member(target_family_code)`;
    expect(problemsFor(fn(body, { header: "security invoker" }))).toMatch(/SECURITY DEFINER/);
  });

  it("catches EXECUTE not granted to authenticated", () => {
    const body = `select target_family_code is not null and ${ROLE} and public.is_family_member(target_family_code)`;
    expect(problemsFor(fn(body, { grants: false }))).toMatch(/granted to authenticated/);
  });

  it("catches a later revoke from authenticated", () => {
    expect(problemsFor(`revoke execute on function public.is_parent_member(text) from authenticated;`)).toMatch(/fail closed/);
  });

  it("catches a later grant to anon", () => {
    expect(problemsFor(`grant execute on function public.is_parent_member(text) to anon;`)).toMatch(/anon\/public/);
  });

  it("catches a later ALTER FUNCTION ... SECURITY INVOKER", () => {
    expect(problemsFor(`alter function public.is_parent_member(text) security invoker;`)).toMatch(/ALTER FUNCTION/);
  });

  it("catches an extra permissive write policy under another name", () => {
    expect(
      problemsFor(`create policy "budget_expenses_member_write" on public.budget_expenses for insert to authenticated
with check (is_family_member(family_code));`)
    ).toMatch(/budget_expenses_member_write is a PERMISSIVE INSERT policy/);
  });

  it("catches a write policy that stops calling is_parent_member", () => {
    expect(
      problemsFor(`drop policy if exists "budget_expenses_write_insert" on public.budget_expenses;
create policy "budget_expenses_write_insert" on public.budget_expenses for insert to authenticated
with check (public.is_family_member(family_code));`)
    ).toMatch(/budget_expenses_write_insert WITH CHECK/);
  });

  it("catches a write policy that ORs something onto is_parent_member", () => {
    expect(
      problemsFor(`drop policy if exists "season_budgets_write_update" on public.season_budgets;
create policy "season_budgets_write_update" on public.season_budgets for update to authenticated
using (is_parent_member(family_code) or is_family_member(family_code)) with check (is_parent_member(family_code));`)
    ).toMatch(/season_budgets_write_update USING/);
  });

  it("catches a write policy being dropped and not re-created", () => {
    expect(problemsFor(`drop policy if exists "season_budgets_write_update" on public.season_budgets;`)).toMatch(
      /season_budgets_write_update no longer exists/
    );
  });

  it("catches ALTER POLICY on a budget table", () => {
    expect(
      problemsFor(`alter policy "season_budgets_write_insert" on public.season_budgets with check (true);`)
    ).toMatch(/ALTER POLICY on season_budgets/);
  });

  it("catches RLS being disabled on a budget table", () => {
    expect(problemsFor(`alter table public.budget_expenses disable row level security;`)).toMatch(
      /row level security off on budget_expenses/
    );
  });
});
