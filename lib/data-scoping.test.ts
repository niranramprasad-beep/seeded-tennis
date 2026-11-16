import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Workstream 4. "RLS is a ceiling on what you MAY read, never a statement of
// what you MEANT to read." Last pass's CRITICAL was a bare select that RLS
// had kept scoped by accident until migration 036 widened the policy; this
// pass found the same reasoning written out in a comment over the training
// loader ("RLS already does it"), and found every family-readable loader
// pooling ALL approved members' rows whenever the viewer was a parent.
//
// The rule, made structural:
//   1. user-owned tables are read only from lib/, never from a component;
//   2. every read of one names its subject in the query itself —
//      .eq("user_id", …) / .in("user_id", subjectIds) / .eq("family_code", …)
//      on a family table — in the same function, never leaning on RLS;
//   3. nothing scopes a read by "every approved member" any more; the
//      subject is "self", one named { userId }, or — for the family budget
//      only — "family-players";
//   4. a parent's screen never calls a family-readable loader without
//      saying whose rows it wants.

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.") && !name.endsWith("database.types.ts")) out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const read = (f: string) => strip(readFileSync(f, "utf8"));

const OWNER_TABLES = [
  "utr_entries", "matches", "coach_outreach", "tournament_entries", "daily_checkins",
  "cost_calculations", "recruiting_checklist_items", "user_settings", "training_plans",
  "workout_sessions", "exercises", "session_exercises", "saved_templates",
];
const FAMILY_TABLES = ["season_budgets", "budget_expenses", "encouragement_notes", "parent_reports"];
const TABLE_RE = new RegExp(`\\.from\\("(${[...OWNER_TABLES, ...FAMILY_TABLES].join("|")})"\\)`, "g");

/** The enclosing function of an index, roughly: from the nearest preceding
 *  `function` keyword to the next line that is a lone `}` at column 0. */
function enclosingFunction(src: string, at: number): string {
  const start = Math.max(src.lastIndexOf("\nexport async function", at), src.lastIndexOf("\nasync function", at), src.lastIndexOf("\nexport function", at), src.lastIndexOf("\nfunction", at));
  const end = src.indexOf("\n}\n", at);
  return src.slice(start < 0 ? 0 : start, end < 0 ? src.length : end);
}

const LIB = walk(join(ROOT, "lib"));
const UI = [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))];

describe("every read of user-owned data says whose rows it wants", () => {
  it("components and routes never query a user-owned table directly", () => {
    const hits = UI.filter((f) => TABLE_RE.test(read(f))).map((f) => relative(ROOT, f));
    TABLE_RE.lastIndex = 0;
    expect(hits, "go through lib/db so the scoping rule applies").toEqual([]);
  });

  it("every SELECT on an owner table filters to a named subject in the same function", () => {
    const offenders: string[] = [];
    for (const f of LIB) {
      const src = read(f);
      for (const m of src.matchAll(TABLE_RE)) {
        const table = m[1];
        const chain = src.slice(m.index!, m.index! + 400);
        const isRead = /^\.from\("[a-z_]+"\)\s*\.select\(/.test(chain);
        if (!isRead) continue;
        const fn = enclosingFunction(src, m.index!);
        const scope = FAMILY_TABLES.includes(table)
          ? String.raw`\.eq\("family_code",|\.eq\("parent_id",`
          : String.raw`\.eq\("user_id",|\.in\("user_id", subjectIds\)|\.eq\(col(?:umn)?, userId\)`;
        // The filter must be on THIS query: in its own chain (up to the end
        // of the expression), or applied to the variable the query was
        // assigned to. A sibling query in the same function filtering does
        // not count — that is how the first version of this test let the
        // training loader's training_plans read go unscoped.
        const stmtEnd = chain.search(/;\s*\n|\)\),?\s*\n|\n\s*\n/);
        const ownChain = stmtEnd > 0 ? chain.slice(0, stmtEnd) : chain;
        const before = src.slice(Math.max(0, m.index! - 120), m.index!);
        const assigned = before.match(/(?:let|const)\s+(\w+)\s*=\s*supabase!?\s*$/)?.[1];
        const ok =
          new RegExp(scope).test(ownChain) ||
          (assigned != null &&
            new RegExp(String.raw`\b${assigned}\s*=\s*${assigned}\s*\.(?:` + scope.replace(/\\\./g, "") + ")").test(fn));
        if (!ok) offenders.push(`${relative(ROOT, f)}: ${table}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("nothing scopes a read by 'every approved member'", () => {
    const hits = LIB.filter((f) => !f.endsWith(join("db", "family-scope.ts")))
      .filter((f) => /approvedFamilyMemberIds\(/.test(read(f)))
      .map((f) => relative(ROOT, f));
    expect(hits, "use subjectUserIds(…, subject) — self, { userId } or 'family-players'").toEqual([]);
  });

  it("family-readable loaders take a subject", () => {
    const src = read(join(ROOT, "lib/db/events.ts")) + read(join(ROOT, "lib/db/outreach.ts")) + read(join(ROOT, "lib/db/plan.ts"));
    for (const fn of ["loadMatches", "loadTournamentEntries", "loadCoachOutreach", "loadCoachOutreachDated", "loadDailyCheckins"]) {
      const sig = src.match(new RegExp(`export async function ${fn}\\(([^)]*)\\)`))?.[1] ?? "";
      expect(sig, fn).toMatch(/subject: DataSubject/);
    }
  });

  it("a parent's screen never asks for those rows without naming the player", () => {
    const parentScreens = UI.filter((f) =>
      /components\/seeded\/family\/|components\/parents\//.test(relative(ROOT, f))
    );
    expect(parentScreens.length).toBeGreaterThan(3);
    const offenders: string[] = [];
    for (const f of parentScreens) {
      const src = read(f);
      const bare = src.match(/load(Matches|TournamentEntries|CoachOutreachDated|CoachOutreach|DailyCheckins)\(\s*\)/);
      if (bare) offenders.push(`${relative(ROOT, f)}: ${bare[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
