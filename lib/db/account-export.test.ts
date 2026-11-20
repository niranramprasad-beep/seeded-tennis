import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import {
  ACCOUNT_EXPORT_OMISSIONS,
  ACCOUNT_EXPORT_TABLES,
  buildAccountExport,
} from "./account-export";

// P0-8. The failure mode this guards against is not a bug today — it is the
// export going quietly stale. Someone adds a table in migration 031, nobody
// adds it to the export, and a person who asks what Seeded holds about their
// child gets a file that LOOKS complete and is not. Silence is the whole
// problem: there is no error, no empty state, nothing to notice.
//
// So every table in the schema has to be either exported or explicitly
// omitted with a reason, and this test fails the build on anything that is
// neither.

/** Table names as the generated types see them — the same source of truth
 * the rest of the data layer trusts, so this cannot drift from the schema
 * without someone regenerating types, which is a step CLAUDE.md already
 * requires after every migration. */
function tablesInSchema(): string[] {
  const types = readFileSync(join(__dirname, "database.types.ts"), "utf8");
  const tablesBlock = types.slice(
    types.indexOf("    Tables: {"),
    types.indexOf("    Views: {")
  );
  // Each table is a key at exactly six spaces of indentation.
  return [...tablesBlock.matchAll(/^ {6}([a-z_]+): \{$/gm)].map((m) => m[1]);
}

describe("the export covers the whole schema", () => {
  it("found the tables (the parser itself still works)", () => {
    const tables = tablesInSchema();
    expect(tables.length).toBeGreaterThan(15);
    expect(tables).toContain("profiles");
    expect(tables).toContain("utr_entries");
  });

  it("classifies every table as exported or deliberately omitted", () => {
    const exported = new Set<string>(ACCOUNT_EXPORT_TABLES);
    const omitted = new Set(Object.keys(ACCOUNT_EXPORT_OMISSIONS));
    const unclassified = tablesInSchema().filter((t) => !exported.has(t) && !omitted.has(t));
    expect(
      unclassified,
      `these tables are neither exported nor listed in ACCOUNT_EXPORT_OMISSIONS with a ` +
        `reason: ${unclassified.join(", ")}. A data export that silently skips a table is ` +
        `worse than none, because it reads as complete.`
    ).toEqual([]);
  });

  it("gives every omission a reason, not just a name", () => {
    for (const [table, reason] of Object.entries(ACCOUNT_EXPORT_OMISSIONS)) {
      expect(reason.length, `omission "${table}" needs a real reason`).toBeGreaterThan(15);
    }
  });

  it("does not both export and omit the same table", () => {
    for (const table of ACCOUNT_EXPORT_TABLES) {
      expect(ACCOUNT_EXPORT_OMISSIONS[table]).toBeUndefined();
    }
  });

  it("exports the tables that hold a minor's own record", () => {
    // Named explicitly rather than counted: these are the ones a person
    // asking "what do you have on my kid" means.
    for (const table of [
      "profiles",
      "utr_entries",
      "matches",
      "coach_outreach",
      "daily_checkins",
      "tournament_entries",
      "user_settings",
    ]) {
      expect(ACCOUNT_EXPORT_TABLES).toContain(table);
    }
  });
});

// A stub client that records what was asked for, so the scoping rules can be
// checked without a database.
function recordingClient(familyCode: string | null) {
  const queries: { table: string; column: string; value: unknown }[] = [];
  const builder = (table: string) => ({
    select: () => ({
      eq: (column: string, value: unknown) => {
        queries.push({ table, column, value });
        return {
          maybeSingle: async () => ({ data: null }),
          then: (resolve: (r: { data: unknown[] }) => void) => resolve({ data: [] }),
        };
      },
    }),
  });
  const client = {
    from: builder,
    rpc: async () => ({ data: familyCode }),
    // Shaped to the one call this module makes, not to the whole client.
  } as unknown as SupabaseClient<Database>;
  return { client, queries };
}

describe("the export is scoped to the person asking", () => {
  it("filters every table by the caller's own id", async () => {
    const { client, queries } = recordingClient(null);
    await buildAccountExport(client, "user-1");
    const ownRowQueries = queries.filter((q) => q.column === "user_id" || q.column === "id");
    expect(ownRowQueries.length).toBeGreaterThan(10);
    for (const q of ownRowQueries) {
      expect(q.value, `${q.table} was queried with something other than the caller's id`).toBe(
        "user-1"
      );
    }
  });

  it("asks for the family budget only by the caller's own family code", async () => {
    const { client, queries } = recordingClient("FAMILYCODE123");
    await buildAccountExport(client, "user-1");
    const familyQueries = queries.filter((q) => q.column === "family_code");
    expect(familyQueries.map((q) => q.table).sort()).toEqual([
      "budget_expenses",
      "season_budgets",
    ]);
    for (const q of familyQueries) expect(q.value).toBe("FAMILYCODE123");
  });

  it("returns empty family sections rather than omitting them when there is no family", async () => {
    // An absent key reads as "we have no idea"; an empty array reads as
    // "nothing here", which is the true answer.
    const { client } = recordingClient(null);
    const result = await buildAccountExport(client, "user-1");
    expect(result.data.families).toBeNull();
    expect(result.data.season_budgets).toEqual([]);
    expect(result.data.budget_expenses).toEqual([]);
  });

  it("says in the file what is in it and what is not", async () => {
    const { client } = recordingClient(null);
    const result = await buildAccountExport(client, "user-1");
    expect(result.about.join(" ")).toMatch(/budget/i);
    expect(result.about.join(" ")).toMatch(/other people/i);
    expect(result.account_id).toBe("user-1");
    expect(Date.parse(result.exported_at)).not.toBeNaN();
  });
});
