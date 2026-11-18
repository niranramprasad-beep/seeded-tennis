import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Test-only helpers for the static migration guards (041–043 and onward).
// SQL cannot run under vitest, so these tests read the migration files and
// assert on the LAST definition of each object — what a freshly built
// database ends up with, and what production gets at the end of a rollout.
// Imported only by *.test.ts files.

export const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");

export interface MigrationFile {
  file: string;
  body: string;
}

export function readMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, body: readFileSync(join(dir, file), "utf8") }));
}

/**
 * Strip SQL comments: whole `--` lines and trailing `--` comments outside a
 * single-quoted literal, plus block comments. Comment-aware enough that a
 * `--` inside a string literal is kept (the trap that defeated an earlier
 * guard, see family-roster-shape.test.ts) and a commented-out check can
 * never satisfy an assertion.
 */
export function withoutComments(sql: string): string {
  const noBlocks = sql.replace(/\/\*[\s\S]*?\*\//g, " ");
  return noBlocks
    .split("\n")
    .map((line) => {
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === "'") inString = !inString;
        else if (!inString && ch === "-" && line[i + 1] === "-") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The text of the LAST `create [or replace] function public.<name>(` across
 * all migrations, from that statement to the end of its dollar-quoted body
 * plus the statements up to the next `create`. Comments stripped.
 */
export function latestFunctionDefinition(
  name: string,
  migrations: MigrationFile[] = readMigrations()
): { file: string; sql: string } | null {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${escapeRegExp(name)}\\s*\\(`, "gi");
  let found: { file: string; sql: string } | null = null;
  for (const m of migrations) {
    const body = withoutComments(m.body);
    const starts = [...body.matchAll(re)];
    if (starts.length === 0) continue;
    const from = starts[starts.length - 1].index ?? 0;
    const rest = body.slice(from);
    // End at the next top-level `create function` / `create policy`, if any.
    const next = rest.slice(1).search(/\ncreate\s+(?:or\s+replace\s+)?(?:function|policy)\s/i);
    found = { file: m.file, sql: next === -1 ? rest : rest.slice(0, next + 1) };
  }
  return found;
}

export interface PolicyStatement {
  file: string;
  table: string;
  name: string;
  sql: string;
}

/** Every `create policy <name> on public.<table> ... ;` across migrations,
 * in order, comments stripped. Names may be quoted. */
export function policyStatements(migrations: MigrationFile[] = readMigrations()): PolicyStatement[] {
  const out: PolicyStatement[] = [];
  const re = /create\s+policy\s+("?)([^"\s]+(?:\s[^"\s]+)*?)\1\s+on\s+(?:public\.)?"?([a-z_]+)"?([\s\S]*?);/gi;
  for (const m of migrations) {
    const body = withoutComments(m.body);
    for (const match of body.matchAll(re)) {
      out.push({ file: m.file, name: match[2], table: match[3], sql: match[0] });
    }
  }
  return out;
}

/** The last `create policy <name> on public.<table>` statement, or null if
 * a later migration dropped it without re-creating it. */
export function latestPolicy(
  table: string,
  name: string,
  migrations: MigrationFile[] = readMigrations()
): PolicyStatement | null {
  let latest: PolicyStatement | null = null;
  const dropRe = new RegExp(
    `drop\\s+policy\\s+(?:if\\s+exists\\s+)?"?${escapeRegExp(name)}"?\\s+on\\s+(?:public\\.)?"?${escapeRegExp(table)}"?`,
    "gi"
  );
  const createRe = new RegExp(
    `create\\s+policy\\s+"?${escapeRegExp(name)}"?\\s+on\\s+(?:public\\.)?"?${escapeRegExp(table)}"?[\\s\\S]*?;`,
    "gi"
  );
  // Files are already in apply order; within a file, replay drops and
  // creates in source order. Whatever happened last wins.
  for (const m of migrations) {
    const body = withoutComments(m.body);
    const events: { at: number; create?: string }[] = [];
    for (const d of body.matchAll(dropRe)) events.push({ at: d.index ?? 0 });
    for (const c of body.matchAll(createRe)) events.push({ at: c.index ?? 0, create: c[0] });
    events.sort((a, b) => a.at - b.at);
    for (const e of events) {
      latest = e.create ? { file: m.file, table, name, sql: e.create } : null;
    }
  }
  return latest;
}
