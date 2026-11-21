import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { latestFunctionDefinition, readMigrations, withoutComments, type MigrationFile } from "./migration-sql";
import {
  PARENT_APPROVAL_REQUIRES_PARENT_MESSAGE,
  PARENTS_ONLY_REMOVE_PARENT_MESSAGE,
  parentRuleMessage,
} from "./family-join";

/* Migration 052: who may approve and remove a PARENT (Niran, 2026-11-21,
 * P-015 / S-005; docs/TODO.md "Who may approve a parent joiner").
 *
 *   - A family with no approved parent may get its first parent from any
 *     approved member (a player who created the family has nobody else).
 *   - Once an approved parent exists (either membership shape), only an
 *     approved parent may approve another parent:
 *     42501 'parent_approval_requires_parent'.
 *   - Only an approved parent may remove an approved parent:
 *     42501 'parents_only_remove_parent'.
 *
 * Before 052 any approved member could do both, so a sibling player could
 * sign up a second account as a parent, approve it, and write the
 * parent-only budget (050) from it — reproduced on staging by the 050 review.
 *
 * SQL cannot run under vitest, so this reads the migrations, like
 * budget-parent-only.test.ts. For each function it takes the LAST definition
 * (schema-qualified or not) and requires 052's check verbatim (whitespace- and
 * case-insensitive), in the same place — directly after the check it follows
 * in 052 and directly before the statement that follows it — so the check
 * cannot be dropped, edited, commented out, wrapped in `if false`, or moved
 * after the write without this failing. It also pins the two helpers the
 * check relies on, the grants, and the client's wording. It is a lint, not a
 * proof: the probe in ~/seeded-evidence/sat-prereview/p015/ is the proof.
 * Every mutation below must be caught. */

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=;<>])\s*/g, "$1")
    .trim();
}

/** 052's approve check, normalised. Changing it means changing this on purpose. */
const APPROVE_CHECK = norm(`
  if v_their_role = 'parent'
     and public.family_member_count(v_code, 'parent') > 0
     and not public.is_parent_member(v_code) then
    raise exception 'parent_approval_requires_parent' using errcode = '42501';
  end if;
`);
/** What 052's approve check directly follows (045's no-profile refusal). */
const APPROVE_BEFORE = norm(`raise exception 'profile_required' using errcode = '22023'; end if;`);
/** What directly follows it (045's cap). */
const APPROVE_AFTER = norm(`v_cap := public.family_member_cap(v_their_role);`);

/** 052's remove check, normalised. */
const REMOVE_CHECK = norm(`
  if exists (
       select 1 from public.profiles p
       where p.id = p_user_id
         and p.role = 'parent'
         and (
           p.family_code = v_code
           or exists (
             select 1 from public.parent_accounts pa
             where pa.user_id = p.id
               and pa.family_code = v_code
               and pa.status = 'approved'
           )
         )
     )
     and not public.is_parent_member(v_code) then
    raise exception 'parents_only_remove_parent' using errcode = '42501';
  end if;
`);
/** What it directly follows (037's account-holder refusal). */
const REMOVE_BEFORE = norm(`
  if p_user_id = public.family_account_holder(v_code) then
    raise exception 'That person cannot be removed.' using errcode = '22023';
  end if;
`);
/** What directly follows it (before anything is deleted). */
const REMOVE_AFTER = norm(`select exists (select 1 from public.profiles where id = p_user_id and family_code = v_code) into v_target_has_code;`);

interface Def {
  fileIndex: number;
  file: string;
  at: number;
  qualified: boolean;
  args: string;
  header: string;
  body: string;
}

function definitions(migrations: MigrationFile[], name: string): Def[] {
  const re = new RegExp(
    String.raw`create\s+(?:or\s+replace\s+)?function\s+(public\s*\.\s*)?"?${name}"?\s*\(([^)]*)\)([\s\S]*?)as\s+\$([a-z_]*)\$([\s\S]*?)\$\4\$`,
    "gi"
  );
  const out: Def[] = [];
  migrations.forEach((m, fileIndex) => {
    const sql = withoutComments(m.body);
    for (const match of sql.matchAll(re)) {
      out.push({
        fileIndex,
        file: m.file,
        at: match.index ?? 0,
        qualified: Boolean(match[1]),
        args: norm(match[2]),
        header: norm(match[3]),
        body: norm(match[5]),
      });
    }
  });
  return out;
}

function laterStatements(migrations: MigrationFile[], last: Def, re: RegExp): string[] {
  const hits: string[] = [];
  migrations.forEach((m, fileIndex) => {
    if (fileIndex < last.fileIndex) return;
    const sql = withoutComments(m.body);
    for (const match of sql.matchAll(new RegExp(re.source, "gi"))) {
      if (fileIndex === last.fileIndex && (match.index ?? 0) < last.at) continue;
      hits.push(`${m.file}: ${match[0].replace(/\s+/g, " ").slice(0, 90)}`);
    }
  });
  return hits;
}

function checkFunction(
  migrations: MigrationFile[],
  name: string,
  check: string,
  before: string,
  after: string,
  code: string
): string[] {
  const problems: string[] = [];
  const defs = definitions(migrations, name);
  if (defs.length === 0) return [`${name}() is not defined by any migration`];
  const last = defs[defs.length - 1];
  if (!last.qualified) problems.push(`${last.file}: define ${name} as \`create or replace function public.${name}\` (schema-qualified)`);
  if (!/^p_[a-z_]+ uuid$/.test(last.args)) problems.push(`${last.file}: ${name} must take exactly one uuid argument (got "${last.args}") — an overload is a second, unguarded definition`);
  if (!/security definer/.test(last.header)) problems.push(`${last.file}: ${name}() must stay SECURITY DEFINER`);

  const at = last.body.indexOf(check);
  if (at === -1) {
    problems.push(
      `${last.file}: ${name}() no longer carries 052's '${code}' check verbatim. A player could then ${
        code === "parents_only_remove_parent" ? "remove an approved parent" : "approve a second parent (and write the parent-only budget from it)"
      }. If you are changing it on purpose, update this test in the same commit.`
    );
  } else {
    if (!last.body.slice(0, at).endsWith(before)) {
      problems.push(`${last.file}: ${name}(): 052's '${code}' check must come directly after "${before.slice(0, 60)}…" (moved, or wrapped in another IF?)`);
    }
    if (!last.body.slice(at + check.length).startsWith(after)) {
      problems.push(`${last.file}: ${name}(): 052's '${code}' check must come directly before "${after.slice(0, 60)}…" (moved, or wrapped in another IF?)`);
    }
    if (last.body.indexOf(check, at + 1) !== -1) {
      problems.push(`${last.file}: ${name}(): 052's '${code}' check appears twice — keep one, in place`);
    }
  }

  // Grants: stated with the definition, never widened or broken afterwards.
  const fnRef = String.raw`(?:public\s*\.\s*)?"?${name}"?\s*\(\s*uuid\s*\)`;
  const tail = withoutComments(migrations[last.fileIndex].body).slice(last.at);
  if (!new RegExp(String.raw`grant\s+execute\s+on\s+function\s+${fnRef}\s+to\s+[^;]*\bauthenticated\b`, "i").test(tail)) {
    problems.push(`${last.file}: grant EXECUTE on ${name}(uuid) to authenticated with its definition`);
  }
  if (!new RegExp(String.raw`revoke\s+all\s+on\s+function\s+${fnRef}\s+from\s+public\s*,\s*anon`, "i").test(tail)) {
    problems.push(`${last.file}: restate \`revoke all on function public.${name}(uuid) from public, anon\` (CLAUDE.md trap #2)`);
  }
  for (const s of laterStatements(migrations, last, new RegExp(String.raw`alter\s+function\s+${fnRef}[^;]*;`))) {
    problems.push(`${s} — ALTER FUNCTION ${name} after 052; redefine it in full instead`);
  }
  for (const s of laterStatements(migrations, last, new RegExp(String.raw`grant\s+[^;]*on\s+function\s+${fnRef}\s+to\s+[^;]*\b(anon|public)\b[^;]*;`))) {
    problems.push(`${s} — grants EXECUTE on ${name} to anon/public`);
  }
  return problems;
}

/** Every reason the migrations fail the 052 rule; empty = holds. */
export function parentApprovalRuleProblems(migrations: MigrationFile[]): string[] {
  const problems = [
    ...checkFunction(migrations, "approve_family_join", APPROVE_CHECK, APPROVE_BEFORE, APPROVE_AFTER, "parent_approval_requires_parent"),
    ...checkFunction(migrations, "remove_family_member", REMOVE_CHECK, REMOVE_BEFORE, REMOVE_AFTER, "parents_only_remove_parent"),
  ];

  // The approve check is only as good as its two helpers.
  const count = latestFunctionDefinition("family_member_count", migrations);
  const countSql = norm(count?.sql ?? "");
  for (const needle of ["p.role=p_role", "p.family_code=p_code", "pa.family_code=p_code", "pa.status='approved'"]) {
    if (!countSql.includes(needle)) {
      problems.push(`${count?.file ?? "?"}: family_member_count() must count approved members in BOTH shapes (missing "${needle}") — 052 asks it whether the family already has a parent`);
    }
  }
  const ipm = latestFunctionDefinition("is_parent_member", migrations);
  const ipmSql = norm(ipm?.sql ?? "");
  if (!ipmSql.includes("p.role='parent'") || !ipmSql.includes("public.is_family_member(target_family_code)")) {
    problems.push(`${ipm?.file ?? "?"}: is_parent_member() must stay "own role = 'parent' AND approved member" (050) — 052 uses it as the approver check`);
  }
  return problems;
}

describe("052: only a parent approves or removes a parent once the family has one", () => {
  it("holds for the migrations in the repo", () => {
    expect(parentApprovalRuleProblems(readMigrations())).toEqual([]);
  });

  it("the client words both refusals plainly, and both RPC wrappers use it", () => {
    expect(parentRuleMessage("parent_approval_requires_parent")).toBe(PARENT_APPROVAL_REQUIRES_PARENT_MESSAGE);
    expect(parentRuleMessage("parents_only_remove_parent")).toBe(PARENTS_ONLY_REMOVE_PARENT_MESSAGE);
    expect(parentRuleMessage("verify_email_required")).toBeNull();
    expect(parentRuleMessage(undefined)).toBeNull();
    const src = readFileSync(join(__dirname, "family-join.ts"), "utf8");
    const approve = src.slice(src.indexOf("export async function approveFamilyJoin"), src.indexOf("export async function denyFamilyJoin"));
    const remove = src.slice(src.indexOf("export async function removeFamilyMember"));
    expect(approve).toMatch(/parentRuleMessage\(error\?\.message\)/);
    expect(remove.slice(0, remove.indexOf("\n}\n"))).toMatch(/parentRuleMessage\(error\?\.message\)/);
  });
});

describe("052 guard: mutation tests (each mutation must be caught)", () => {
  const real = readMigrations();
  const file052 = real.find((m) => m.file.startsWith("052_"))!;
  const withExtra = (sql: string): MigrationFile[] => [...real, { file: "999_mutation.sql", body: sql }];
  const replacing052 = (body: string): MigrationFile[] => real.map((m) => (m === file052 ? { ...m, body } : m));
  const problemsFor = (ms: MigrationFile[]) => parentApprovalRuleProblems(ms).join("\n");

  it("sanity: 052 exists, and re-stating it verbatim passes", () => {
    expect(file052).toBeDefined();
    const forward = file052.body.slice(0, file052.body.indexOf("-- ROLLBACK"));
    expect(problemsFor(withExtra(forward))).toBe("");
  });

  const swap = (from: RegExp | string, to: string) => {
    const body = file052.body.replace(from, to);
    expect(body, `mutation did not apply: ${String(from)}`).not.toBe(file052.body);
    return problemsFor(replacing052(body));
  };

  it.each([
    ["approve: parent-count condition dropped", /\s+and public\.family_member_count\(v_code, 'parent'\) > 0\n/, "\n"],
    ["approve: approver check dropped", /\s+and not public\.is_parent_member\(v_code\) then\n(\s+raise exception 'parent_approval)/, " then\n$1"],
    ["approve: is_parent_member swapped for is_family_member", "and not public.is_parent_member(v_code) then\n      raise exception 'parent_approval", "and not public.is_family_member(v_code) then\n      raise exception 'parent_approval"],
    ["approve: '> 0' weakened to '> 1'", "family_member_count(v_code, 'parent') > 0", "family_member_count(v_code, 'parent') > 1"],
  ] as [string, RegExp | string, string][])("catches %s", (_label, from, to) => {
    expect(swap(from, to)).toMatch(/parent_approval_requires_parent/);
  });

  it("catches the approve check commented out", () => {
    const block = file052.body.match(/\n    if v_their_role = 'parent'\n[\s\S]*?parent_approval_requires_parent[\s\S]*?end if;/)![0];
    const commented = block
      .split("\n")
      .map((l) => (l ? `-- ${l}` : l))
      .join("\n");
    expect(swap(block, commented)).toMatch(/no longer carries 052's 'parent_approval_requires_parent'/);
  });

  it("catches the approve check wrapped in `if false`", () => {
    expect(
      swap(
        "    if v_their_role = 'parent'\n       and public.family_member_count",
        "    if false then\n    if v_their_role = 'parent'\n       and public.family_member_count"
      )
    ).toMatch(/directly after/);
  });

  it("catches the approve check moved after the approval UPDATE", () => {
    const check = file052.body.match(/\n    -- 052: once the family[\s\S]*?parent_approval_requires_parent' using errcode = '42501';\n    end if;/)![0];
    const body = file052.body
      .replace(check, "")
      .replace("  get diagnostics v_updated = row_count;\n  if v_updated = 0 then", `${check}\n  get diagnostics v_updated = row_count;\n  if v_updated = 0 then`);
    expect(problemsFor(replacing052(body))).toMatch(/parent_approval_requires_parent' check must come directly/);
  });

  it.each([
    ["remove: approver check dropped", /\n     and not public\.is_parent_member\(v_code\) then\n(\s+raise exception 'parents_only)/, " then\n$1"],
    ["remove: only the parent_accounts shape counted", /\n           p\.family_code = v_code\n           or exists/, "\n           exists"],
    ["remove: pending parents counted as approved (status check dropped)", "\n               and pa.status = 'approved'\n           )\n         )\n     )\n     and not public.is_parent_member", "\n           )\n         )\n     )\n     and not public.is_parent_member"],
    ["remove: role check dropped", /\n         and p\.role = 'parent'\n         and \(\n           p\.family_code = v_code/, "\n         and (\n           p.family_code = v_code"],
  ] as [string, RegExp | string, string][])("catches %s", (_label, from, to) => {
    expect(swap(from, to)).toMatch(/parents_only_remove_parent/);
  });

  it("catches the remove check moved after the DELETE", () => {
    const check = file052.body.match(/\n  -- 052: only an approved parent may remove[\s\S]*?parents_only_remove_parent' using errcode = '42501';\n  end if;\n/)![0];
    const body = file052.body.replace(check, "\n").replace("  get diagnostics v_links_deleted = row_count;\n", `  get diagnostics v_links_deleted = row_count;\n${check}`);
    expect(problemsFor(replacing052(body))).toMatch(/parents_only_remove_parent' check must come directly/);
  });

  it("catches a later redefinition (unqualified) that drops the check", () => {
    const forward = file052.body.slice(0, file052.body.indexOf("-- ROLLBACK"));
    const approve = forward.slice(forward.indexOf("create or replace function public.approve_family_join"), forward.indexOf("-- 2. remove_family_member"));
    const mutated = approve
      .replace("create or replace function public.approve_family_join", "create or replace function approve_family_join")
      .replace(/    -- 052: once[\s\S]*?parent_approval_requires_parent' using errcode = '42501';\n    end if;\n/, "");
    expect(problemsFor(withExtra(mutated))).toMatch(/schema-qualified|no longer carries 052's 'parent_approval_requires_parent'/);
  });

  it("catches a later grant to anon, a later ALTER FUNCTION, and missing revokes", () => {
    expect(problemsFor(withExtra("grant execute on function public.remove_family_member(uuid) to anon;"))).toMatch(/anon\/public/);
    expect(problemsFor(withExtra("alter function public.approve_family_join(uuid) security invoker;"))).toMatch(/ALTER FUNCTION/);
    expect(swap("revoke all on function public.remove_family_member(uuid) from public, anon;\ngrant", "grant")).toMatch(/revoke all on function public\.remove_family_member/);
  });

  it("catches a helper being weakened: family_member_count stops counting one shape", () => {
    expect(
      problemsFor(
        withExtra(`create or replace function public.family_member_count(p_code text, p_role text)
returns integer language sql stable security definer set search_path = public
as $$ select count(*)::int from public.profiles p where p.role = p_role and p.family_code = p_code $$;`)
      )
    ).toMatch(/BOTH shapes/);
  });

  it("catches a helper being weakened: is_parent_member loses its role check", () => {
    expect(
      problemsFor(
        withExtra(`create or replace function public.is_parent_member(target_family_code text)
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_family_member(target_family_code) $$;`)
      )
    ).toMatch(/is_parent_member\(\) must stay/);
  });
});
