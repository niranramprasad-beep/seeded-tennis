import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// P0-8, the export half. "A user can download all their own data (JSON)."
//
// WHY THIS IS SERVER-SIDE AND READS THE TABLES DIRECTLY.
// /settings already had a "Download my data" button, and it built a CSV in
// the browser out of whatever four SWR caches happened to be warm —
// schools, matches, UTR entries, outreach. That is a useful spreadsheet and
// it stays (buildAccountDataCsv), but it is not a data export: it silently
// omitted check-ins, tournaments, the training calendar, saved templates,
// the checklist, settings, the family link and the budget. A person asking
// what a company holds on their child should not get a subset chosen by
// which page they happened to visit.
//
// So this enumerates the tables instead, and the enumeration is the point:
// ACCOUNT_EXPORT_TABLES is the list, it is asserted against the generated
// database types in account-export.test.ts, and the test fails when a
// migration adds a table nobody added here. An export that quietly goes
// stale is worse than no export, because it reads as complete.
//
// WHY NOT THE SERVICE ROLE. The request-scoped client carries the caller's
// own bearer token, so RLS answers every query exactly as it would for that
// person in the browser. A bug here cannot return somebody else's row,
// because the database would not hand it over. Each query is ALSO filtered
// by the caller's id — belt and braces, and it is what keeps a parent's
// export from quietly including their child's UTR history, which RLS would
// legitimately allow them to read but which is the child's data, not theirs.

/** Tables keyed directly on the account, exported as `where <column> = me`. */
const OWN_ROW_TABLES = [
  ["utr_entries", "user_id"],
  ["matches", "user_id"],
  ["coach_outreach", "user_id"],
  ["tournament_entries", "user_id"],
  ["daily_checkins", "user_id"],
  ["cost_calculations", "user_id"],
  ["recruiting_checklist_items", "user_id"],
  ["user_settings", "user_id"],
  ["training_plans", "user_id"],
  ["workout_sessions", "user_id"],
  ["exercises", "user_id"],
  ["session_exercises", "user_id"],
  ["saved_templates", "user_id"],
  ["parent_accounts", "user_id"],
  // Notes this account WROTE (a parent's notes to their player). This was
  // listed as an omission — "written by another family member" — which is
  // true from the player's side and backwards from the parent's: the parent
  // is the author, the notes are their writing, and delete_my_account()
  // deletes them with the account. An export that skips what the deletion
  // removes is not complete. Notes written TO this account stay out: they
  // are someone else's writing.
  ["encouragement_notes", "parent_id"],
] as const;

/** Rows the account shares with its family rather than owns alone. Included
 * because the person can read and (for the budget) write them, and leaving
 * them out would make the export incomplete in the one area a parent
 * actually contributes to. */
const FAMILY_TABLES = [
  ["season_budgets", "family_code"],
  ["budget_expenses", "family_code"],
] as const;

/** Every table this export covers, for the completeness test. `profiles` and
 * `families` are fetched by hand below; the locked and internal tables are
 * listed with a reason so the test can prove the omission was a decision. */
export const ACCOUNT_EXPORT_TABLES = [
  "profiles",
  "families",
  ...OWN_ROW_TABLES.map(([t]) => t),
  ...FAMILY_TABLES.map(([t]) => t),
] as const;

/**
 * Tables deliberately NOT in the export, each with the reason. The test
 * asserts that this plus ACCOUNT_EXPORT_TABLES accounts for every table in
 * the schema, so a new table has to be classified either way.
 */
export const ACCOUNT_EXPORT_OMISSIONS: Record<string, string> = {
  // Operational, not personal content: who tried which family code and when,
  // and API call counts. Returning the join log would hand a user a list of
  // codes they typed, which is exactly what 023's rate limiter exists to
  // keep out of reach.
  family_join_attempts: "abuse-control log, not account content",
  rate_limit_events: "abuse-control counter, not account content",
  // 043: one timestamp per account (when its sign-in email last changed),
  // written by a trigger on auth.users and read only inside
  // mark_email_verified(). No client role can read it, so the export, which
  // runs as the signed-in user, could not include it.
  auth_email_changes: "verification-control timestamp, unreadable by any client",
  // Removed features, locked in 027. No rows the product reads or writes.
  badges: "removed feature, table locked (S-13)",
  friendships: "removed feature, table locked (S-13)",
  // Nothing generates parent_reports at all, and after 039 no signed-in
  // account can insert one. (encouragement_notes moved to OWN_ROW_TABLES,
  // keyed on the author.)
  parent_reports: "nothing generates these; family-scoped, not account-scoped",
  // Just the family's own code, already included via the `families` row.
  family_codes: "duplicate of families.code, already exported",
  // 048, catalog phase 1. Reference data about college programs, the same
  // for every visitor; no row is about the account asking. team_ranges
  // carries entered_by, but only an app admin (the owner) can ever create a
  // row, and that column is not readable by any client.
  programs: "public catalog reference data, not about any account",
  program_class_counts: "public catalog reference data (roster class counts only, no names)",
  team_ranges: "public catalog reference data entered by the owner-admin",
  app_admins: "owner-admin allowlist, unreadable by any client",
};

export interface AccountExport {
  exported_at: string;
  account_id: string;
  /** Plain-language note that travels with the file, so the person reading
   * it later knows what it is and what it is not. */
  about: string[];
  data: Record<string, unknown>;
}

export async function buildAccountExport(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AccountExport> {
  const data: Record<string, unknown> = {};

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  data.profiles = profile ?? null;

  for (const [table, column] of OWN_ROW_TABLES) {
    // The owner column differs per table (user_id, parent_id), which the
    // generated union type cannot express across the loop.
    const query = supabase.from(table).select("*") as unknown as {
      eq: (col: string, value: string) => PromiseLike<{ data: unknown[] | null }>;
    };
    const { data: rows } = await query.eq(column, userId);
    data[table] = rows ?? [];
  }

  // The family this account belongs to, by either of the two shapes a
  // membership can take (own profile, or an approved parent_accounts link —
  // see my_family_code() in migration 026 for why both exist).
  const { data: familyCode } = await supabase.rpc("my_family_code");
  if (typeof familyCode === "string" && familyCode.length > 0) {
    const { data: family } = await supabase
      .from("families")
      .select("*")
      .eq("code", familyCode)
      .maybeSingle();
    data.families = family ?? null;
    for (const [table, column] of FAMILY_TABLES) {
      const { data: rows } = await supabase.from(table).select("*").eq(column, familyCode);
      data[table] = rows ?? [];
    }
  } else {
    data.families = null;
    for (const [table] of FAMILY_TABLES) data[table] = [];
  }

  return {
    exported_at: new Date().toISOString(),
    account_id: userId,
    about: [
      "Everything Seeded stores about this account, one key per database table.",
      "Your family's season budget is included because you can see and edit it. Other people's rows are not: if you are a parent, your player's results and UTR history are their record, not yours, and they can export their own.",
      "UTR values are the ones entered by hand in Seeded. Seeded never fetches anything from UTR.",
      "School and roster data is not here — it is the same public catalog for every user, not information about you.",
    ],
    data,
  };
}
