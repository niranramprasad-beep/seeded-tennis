import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMigrations, withoutComments, type MigrationFile } from "./migration-sql";
import {
  PARENT_APPROVAL_REQUIRES_PARENT_MESSAGE,
  PARENTS_ONLY_REMOVE_PARENT_MESSAGE,
  parentRuleMessage,
} from "./family-join";

/* Migration 052: who may approve and remove a PARENT (Niran, 2026-11-21,
 * P-015 / S-005; docs/TODO.md "Who may approve a parent joiner").
 *
 * "A parent of family F" = parent_acts_for_family(user, F): own role =
 * 'parent' AND home family (home_family_code(), the rule my_family_code()
 * uses) = F — a parent who can actually act in F.
 *   - A family with no parent of its own may get its first from any approved
 *     member (a player who created the family has nobody else).
 *   - Once it has one, only a parent of the family may approve another parent:
 *     42501 'parent_approval_requires_parent'.
 *   - Only a parent of the family may remove a parent of the family:
 *     42501 'parents_only_remove_parent'; remove_family_member() takes 045's
 *     per-family lock first.
 *
 * Why HOME family (independent review of the first 052): both RPCs act on
 * the caller's my_family_code(). Counting a parent approved in ANY family
 * meant a parent whose home is another family — who can never act here —
 * locked a family: no player could approve its next parent or remove that
 * one. The probe's x-cases are that scenario.
 *
 * SQL cannot run under vitest, so this reads the migrations, like
 * budget-parent-only.test.ts. For each RPC it takes the LAST definition
 * (schema-qualified or not) and requires 052's check verbatim (whitespace-
 * and case-insensitive), in the same place — directly after the check it
 * follows in 052 and directly before the statement that follows it — so the
 * check cannot be dropped, edited, commented out, wrapped in `if false`, or
 * moved after the write without this failing. It pins the FULL normalised
 * body of every helper the rule depends on (a review showed fragment checks
 * let an extra filter through), the grants, and the client's wording. It is
 * a lint, not a proof: the probe in ~/seeded-evidence/sat-prereview/p015/ is
 * the proof. Every mutation below must be caught. */

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*([(),=;<>|])\s*/g, "$1")
    .trim();
}

/** 052's approve check, normalised. Changing it means changing this on purpose. */
const APPROVE_CHECK = norm(`
  if v_their_role = 'parent'
     and exists (
       select 1 from public.profiles p
       where (
           p.family_code = v_code
           or exists (
             select 1 from public.parent_accounts pa
             where pa.user_id = p.id
               and pa.family_code = v_code
               and pa.status = 'approved'
           )
         )
         and public.parent_acts_for_family(p.id, v_code)
     )
     and not public.parent_acts_for_family(v_user, v_code) then
    raise exception 'parent_approval_requires_parent' using errcode = '42501';
  end if;
`);
/** What 052's approve check directly follows (045's no-profile refusal). */
const APPROVE_BEFORE = norm(`raise exception 'profile_required' using errcode = '22023'; end if;`);
/** What directly follows it (045's cap). */
const APPROVE_AFTER = norm(`v_cap := public.family_member_cap(v_their_role);`);

/** 052's remove check, normalised. */
const REMOVE_CHECK = norm(`
  if public.parent_acts_for_family(p_user_id, v_code)
     and not public.parent_acts_for_family(auth.uid(), v_code) then
    raise exception 'parents_only_remove_parent' using errcode = '42501';
  end if;
`);
/** What it directly follows: 037's account-holder refusal, then 045's per-family lock. */
const REMOVE_BEFORE = norm(`
  if p_user_id = public.family_account_holder(v_code) then
    raise exception 'That person cannot be removed.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('seeded.family:' || v_code));
`);
/** What directly follows it (before anything is deleted). */
const REMOVE_AFTER = norm(`select exists (select 1 from public.profiles where id = p_user_id and family_code = v_code) into v_target_has_code;`);

/** The FULL normalised body of the last definition of every helper the rule
 * depends on. A change to any of them changes who counts as "a parent of the
 * family" (or what my_family_code() answers), so it must change this on
 * purpose. */
const HELPER_BODIES: Record<string, { args: RegExp; body: string }> = {
  parent_acts_for_family: {
    args: /^p_user_id uuid,p_code text$/,
    body: norm(`
      select p_code is not null
         and exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'parent')
         and public.home_family_code(p_user_id) = p_code`),
  },
  home_family_code: {
    args: /^p_user_id uuid$/,
    body: norm(`
      select coalesce(
        (select p.family_code from public.profiles p where p.id = p_user_id),
        (select pa.family_code from public.parent_accounts pa
          where pa.user_id = p_user_id and pa.status = 'approved'
          order by pa.approved_at nulls last, pa.created_at, pa.family_code
          limit 1)
      )`),
  },
  my_family_code: { args: /^$/, body: norm(`select public.home_family_code(auth.uid())`) },
  is_family_member: {
    args: /^target_family_code text$/,
    body: norm(`
      select exists (select 1 from public.profiles p where p.id = auth.uid() and p.family_code = target_family_code)
      or exists (
        select 1 from public.parent_accounts pa
        where pa.user_id = auth.uid() and pa.family_code = target_family_code and pa.status = 'approved'
      )`),
  },
  family_member_count: {
    args: /^p_code text,p_role text$/,
    body: norm(`
      select count(*)::int from public.profiles p
      where p.role = p_role
        and (
          p.family_code = p_code
          or exists (
            select 1 from public.parent_accounts pa
            where pa.user_id = p.id and pa.family_code = p_code and pa.status = 'approved'
          )
        )`),
  },
  is_parent_member: {
    args: /^target_family_code text$/,
    body: norm(`
      select target_family_code is not null
         and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'parent')
         and public.is_family_member(target_family_code)`),
  },
};

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

function lastDefinition(migrations: MigrationFile[], name: string, problems: string[]): Def | null {
  const defs = definitions(migrations, name);
  if (defs.length === 0) {
    problems.push(`${name}() is not defined by any migration`);
    return null;
  }
  const last = defs[defs.length - 1];
  if (!last.qualified) problems.push(`${last.file}: define ${name} as \`create or replace function public.${name}\` (schema-qualified)`);
  if (!/security definer/.test(last.header)) problems.push(`${last.file}: ${name}() must stay SECURITY DEFINER`);
  return last;
}

function checkRpc(
  migrations: MigrationFile[],
  name: string,
  check: string,
  before: string,
  after: string,
  code: string
): string[] {
  const problems: string[] = [];
  const last = lastDefinition(migrations, name, problems);
  if (!last) return problems;
  if (!/^p_[a-z_]+ uuid$/.test(last.args)) problems.push(`${last.file}: ${name} must take exactly one uuid argument (got "${last.args}") — an overload is a second, unguarded definition`);

  const at = last.body.indexOf(check);
  if (at === -1) {
    problems.push(
      `${last.file}: ${name}() no longer carries 052's '${code}' check verbatim. A player could then ${
        code === "parents_only_remove_parent" ? "remove an approved parent" : "approve a second parent (and write the parent-only budget from it)"
      }. If you are changing it on purpose, update this test in the same commit.`
    );
  } else {
    if (!last.body.slice(0, at).endsWith(before)) {
      problems.push(`${last.file}: ${name}(): 052's '${code}' check must come directly after "${before.slice(0, 70)}…" (moved, lock dropped, or wrapped in another IF?)`);
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
    ...checkRpc(migrations, "approve_family_join", APPROVE_CHECK, APPROVE_BEFORE, APPROVE_AFTER, "parent_approval_requires_parent"),
    ...checkRpc(migrations, "remove_family_member", REMOVE_CHECK, REMOVE_BEFORE, REMOVE_AFTER, "parents_only_remove_parent"),
  ];

  for (const [name, want] of Object.entries(HELPER_BODIES)) {
    const last = lastDefinition(migrations, name, problems);
    if (!last) continue;
    if (!want.args.test(last.args)) problems.push(`${last.file}: ${name}() arguments changed (got "${last.args}") — an overload is a second, unpinned definition`);
    if (last.body !== want.body) {
      problems.push(
        `${last.file}: ${name}() body is not the one 052 relies on. It decides who counts as a parent of a family (or which family a caller acts in); if you are changing it on purpose, update HELPER_BODIES here in the same commit.`
      );
    }
    for (const s of laterStatements(migrations, last, new RegExp(String.raw`alter\s+function\s+(?:public\s*\.\s*)?"?${name}"?\s*\([^;]*;`))) {
      problems.push(`${s} — ALTER FUNCTION ${name}; redefine it in full instead`);
    }
  }

  // parent_acts_for_family is an oracle ("is user X a parent whose home is
  // family Y"); the RPCs run as owner, so clients never need it.
  const pafRef = String.raw`(?:public\s*\.\s*)?"?parent_acts_for_family"?\s*\(\s*uuid\s*,\s*text\s*\)`;
  const paf = definitions(migrations, "parent_acts_for_family").pop();
  if (paf) {
    const tail = withoutComments(migrations[paf.fileIndex].body).slice(paf.at);
    if (!new RegExp(String.raw`revoke\s+all\s+on\s+function\s+${pafRef}\s+from\s+public\s*,\s*anon\s*,\s*authenticated`, "i").test(tail)) {
      problems.push(`${paf.file}: revoke all on parent_acts_for_family(uuid, text) from public, anon, authenticated`);
    }
    for (const s of laterStatements(migrations, paf, new RegExp(String.raw`grant\s+[^;]*on\s+function\s+${pafRef}\s+to\s+[^;]*\b(anon|public|authenticated)\b[^;]*;`))) {
      problems.push(`${s} — parent_acts_for_family must not be callable by clients (it is an oracle)`);
    }
  }
  return problems;
}

describe("052: only a parent of the family approves or removes a parent once it has one", () => {
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
  const forward = () => file052.body.slice(0, file052.body.indexOf("-- ROLLBACK"));

  it("sanity: 052 exists, and re-stating it verbatim passes", () => {
    expect(file052).toBeDefined();
    expect(problemsFor(withExtra(forward()))).toBe("");
  });

  const swap = (from: RegExp | string, to: string) => {
    const body = file052.body.replace(from, to);
    expect(body, `mutation did not apply: ${String(from)}`).not.toBe(file052.body);
    return problemsFor(replacing052(body));
  };

  it.each([
    ["approve: 'family already has a parent' condition dropped", /\n       and exists \(\n         select 1 from public\.profiles p\n[\s\S]*?parent_acts_for_family\(p\.id, v_code\)\n       \)/, ""],
    ["approve: approver check dropped", /\s+and not public\.parent_acts_for_family\(v_user, v_code\) then\n/, " then\n"],
    ["approve: counted set back to ANY family (the review's lockout)", "           and public.parent_acts_for_family(p.id, v_code)\n", "           and p.role = 'parent'\n"],
    ["approve: approver swapped for is_family_member", "and not public.parent_acts_for_family(v_user, v_code) then", "and not public.is_family_member(v_code) then"],
    ["approve: pending links counted", "                 and pa.status = 'approved'\n             )\n           )\n           and public.parent_acts_for_family", "             )\n           )\n           and public.parent_acts_for_family"],
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
    expect(swap("    if v_their_role = 'parent'\n       and exists", "    if false then\n    if v_their_role = 'parent'\n       and exists")).toMatch(
      /directly after/
    );
  });

  it("catches the approve check moved after the approval UPDATE", () => {
    const check = file052.body.match(/\n    -- 052: once the family[\s\S]*?parent_approval_requires_parent' using errcode = '42501';\n    end if;/)![0];
    const body = file052.body
      .replace(check, "")
      .replace("  get diagnostics v_updated = row_count;\n  if v_updated = 0 then", `${check}\n  get diagnostics v_updated = row_count;\n  if v_updated = 0 then`);
    expect(problemsFor(replacing052(body))).toMatch(/parent_approval_requires_parent' check must come directly/);
  });

  it.each([
    ["remove: approver check dropped", /\n     and not public\.parent_acts_for_family\(auth\.uid\(\), v_code\) then\n/, " then\n"],
    ["remove: target test swapped for any-family membership", "  if public.parent_acts_for_family(p_user_id, v_code)\n", "  if exists (select 1 from public.profiles where id = p_user_id and role = 'parent')\n"],
    ["remove: caller test swapped for is_family_member", "and not public.parent_acts_for_family(auth.uid(), v_code) then", "and not public.is_family_member(v_code) then"],
  ] as [string, RegExp | string, string][])("catches %s", (_label, from, to) => {
    expect(swap(from, to)).toMatch(/parents_only_remove_parent/);
  });

  it("catches the remove lock dropped (the race the review found)", () => {
    expect(swap("  perform pg_advisory_xact_lock(hashtext('seeded.family:' || v_code));\n\n  -- 052: only a parent who", "  -- 052: only a parent who")).toMatch(
      /parents_only_remove_parent' check must come directly after/
    );
  });

  it("catches the remove lock keyed differently from 045's", () => {
    expect(swap("hashtext('seeded.family:' || v_code));\n\n  -- 052: only a parent who", "hashtext('seeded.remove:' || v_code));\n\n  -- 052: only a parent who")).toMatch(
      /directly after/
    );
  });

  it("catches the remove check moved after the DELETE", () => {
    const check = file052.body.match(/\n  -- 052: only a parent who can act[\s\S]*?parents_only_remove_parent' using errcode = '42501';\n  end if;\n/)![0];
    const body = file052.body.replace(check, "\n").replace("  get diagnostics v_links_deleted = row_count;\n", `  get diagnostics v_links_deleted = row_count;\n${check}`);
    expect(problemsFor(replacing052(body))).toMatch(/parents_only_remove_parent' check must come directly/);
  });

  it("catches a later redefinition (unqualified) that drops the check", () => {
    const f = forward();
    const approve = f.slice(f.indexOf("create or replace function public.approve_family_join"), f.indexOf("-- 2. remove_family_member"));
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

  it("catches parent_acts_for_family being made callable by clients", () => {
    expect(problemsFor(withExtra("grant execute on function public.parent_acts_for_family(uuid, text) to authenticated;"))).toMatch(/oracle/);
    expect(swap("from public, anon, authenticated;\ngrant execute on function public.parent_acts_for_family", "from public, anon;\ngrant execute on function public.parent_acts_for_family")).toMatch(
      /revoke all on parent_acts_for_family/
    );
  });

  const redefine = (name: string, args: string, ret: string, body: string) =>
    `create or replace function public.${name}(${args})
returns ${ret} language sql stable security definer set search_path = public
as $$ ${body} $$;`;

  it.each([
    [
      "parent_acts_for_family loses the home-family test (any membership)",
      redefine("parent_acts_for_family", "p_user_id uuid, p_code text", "boolean", `select exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'parent')`),
    ],
    [
      "parent_acts_for_family loses the role test",
      redefine("parent_acts_for_family", "p_user_id uuid, p_code text", "boolean", `select p_code is not null and public.home_family_code(p_user_id) = p_code`),
    ],
    [
      "home_family_code counts PENDING links",
      redefine(
        "home_family_code",
        "p_user_id uuid",
        "text",
        `select coalesce((select p.family_code from public.profiles p where p.id = p_user_id),
          (select pa.family_code from public.parent_accounts pa where pa.user_id = p_user_id
           order by pa.approved_at nulls last, pa.created_at, pa.family_code limit 1))`
      ),
    ],
    ["my_family_code answers something else", redefine("my_family_code", "", "text", `select (select family_code from public.profiles where id = auth.uid())`)],
    [
      "is_family_member counts PENDING rows",
      redefine(
        "is_family_member",
        "target_family_code text",
        "boolean",
        `select exists (select 1 from public.profiles p where p.id = auth.uid() and p.family_code = target_family_code)
         or exists (select 1 from public.parent_accounts pa where pa.user_id = auth.uid() and pa.family_code = target_family_code)`
      ),
    ],
    [
      "family_member_count gains an extra filter",
      redefine(
        "family_member_count",
        "p_code text, p_role text",
        "integer",
        `select count(*)::int from public.profiles p where p.role = p_role and p.consent_status = 'not_required' and (p.family_code = p_code
         or exists (select 1 from public.parent_accounts pa where pa.user_id = p.id and pa.family_code = p_code and pa.status = 'approved'))`
      ),
    ],
    [
      "family_member_count stops counting one shape",
      redefine("family_member_count", "p_code text, p_role text", "integer", `select count(*)::int from public.profiles p where p.role = p_role and p.family_code = p_code`),
    ],
    [
      "is_parent_member loses its role check",
      redefine("is_parent_member", "target_family_code text", "boolean", `select public.is_family_member(target_family_code)`),
    ],
  ])("catches a helper being changed: %s", (_label, sql) => {
    expect(problemsFor(withExtra(sql))).toMatch(/body is not the one 052 relies on/);
  });

  it("catches a helper being ALTERed (e.g. to SECURITY INVOKER)", () => {
    expect(problemsFor(withExtra("alter function public.home_family_code(uuid) security invoker;"))).toMatch(/ALTER FUNCTION home_family_code/);
  });
});
