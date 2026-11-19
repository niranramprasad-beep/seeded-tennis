import { describe, expect, it } from "vitest";
import { latestFunctionDefinition, readMigrations } from "@/lib/db/migration-sql";
import {
  FAMILY_PLAN_MAX_PARENTS,
  FAMILY_PLAN_MAX_PLAYERS,
  FAMILY_PLAN_SCOPE_LABEL,
  familyFullMessage,
} from "@/lib/types";
import { familyFullRole } from "@/lib/db/family-join";
import { joinOutcomeFor } from "@/lib/email-verify-flow";

/* Migration 045 (owner decision 2026-11-19, docs/DECISIONS.md):
 *   - a Family plan unlocks exactly ONE family, its holder's home family;
 *   - a family holds at most 4 players and 2 parent accounts.
 *
 * The SQL cannot run under vitest, so these read the LATEST definition of
 * each function across every migration and fail the build when a later
 * migration quietly drops the rule — and pin /pricing's numbers to the
 * database's. Behaviour was probed as real roles on staging, including two
 * mutants (042's family_has_tier restored; the player cap raised to 5) that
 * each let the refused case through: ~/seeded-evidence/rollout-2026-11-19/.
 * This file was itself mutation-tested against a scratch copy of 045. */

const migrations = readMigrations();

function latest(name: string): string {
  const def = latestFunctionDefinition(name, migrations);
  expect(def, `no definition of ${name}`).not.toBeNull();
  return def!.sql.toLowerCase();
}

describe("045: one Family plan unlocks one family", () => {
  it("family_has_tier's 'family' branch requires the payer's HOME family to be this one", () => {
    const sql = latest("family_has_tier");
    // The family-tier test and the home-family test sit in the same branch.
    expect(sql).toMatch(
      /p_tier\s*=\s*'family'\s+and\s+p\.subscription_tier\s*=\s*'family'\s+and\s+public\.home_family_code\s*\(\s*p\.id\s*\)\s*=\s*p_code/
    );
  });

  it("home_family_code is the same rule as my_family_code, and clients cannot call it", () => {
    const home = latest("home_family_code");
    expect(home).toContain("security definer");
    expect(home).toMatch(/p\.family_code\s+from\s+public\.profiles\s+p\s+where\s+p\.id\s*=\s*p_user_id/);
    expect(home).toMatch(/status\s*=\s*'approved'/);
    expect(home).toMatch(/order\s+by\s+pa\.approved_at\s+nulls\s+last\s*,\s*pa\.created_at\s*,\s*pa\.family_code/);
    // It would name the family of any uuid: never EXECUTE for clients.
    expect(home).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.home_family_code\(uuid\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/
    );
    expect(home).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.home_family_code\(uuid\)\s+to\s+[^;]*authenticated/);

    const mine = latest("my_family_code");
    expect(mine).toMatch(/select\s+public\.home_family_code\s*\(\s*auth\.uid\(\)\s*\)/);
  });
});

describe("045: the caps", () => {
  it("family_member_cap is 4 players and 2 parents, matching lib/types", () => {
    const sql = latest("family_member_cap");
    const player = sql.match(/when\s+'player'\s+then\s+(\d+)/);
    const parent = sql.match(/when\s+'parent'\s+then\s+(\d+)/);
    expect(Number(player?.[1])).toBe(FAMILY_PLAN_MAX_PLAYERS);
    expect(Number(parent?.[1])).toBe(FAMILY_PLAN_MAX_PARENTS);
    expect(FAMILY_PLAN_MAX_PLAYERS).toBe(4);
    expect(FAMILY_PLAN_MAX_PARENTS).toBe(2);
  });

  it("family_member_count counts approved members in both shapes", () => {
    const sql = latest("family_member_count");
    expect(sql).toMatch(/p\.role\s*=\s*p_role/);
    expect(sql).toMatch(/p\.family_code\s*=\s*p_code/);
    expect(sql).toMatch(/pa\.status\s*=\s*'approved'/);
  });

  it("join_family refuses at the cap BEFORE it creates a pending row, and returns (never raises) it", () => {
    const sql = latest("join_family");
    const check = sql.search(/family_member_count\s*\(\s*p_code\s*,\s*v_role\s*\)\s*>=\s*v_cap/);
    const full = sql.search(/'status'\s*,\s*'family_full'/);
    const insert = sql.search(/insert\s+into\s+public\.parent_accounts/);
    expect(check).toBeGreaterThan(-1);
    expect(full).toBeGreaterThan(check);
    expect(insert).toBeGreaterThan(full);
    // The attempt is logged before any of this (023's rate-limit lesson).
    expect(sql.search(/insert\s+into\s+public\.family_join_attempts/)).toBeLessThan(check);
    // 043's email check is still first.
    expect(sql.search(/verify_email_required/)).toBeLessThan(sql.search(/family_join_attempts/));
    expect(sql).toMatch(/pg_advisory_xact_lock/);
  });

  it("approve_family_join refuses at the cap BEFORE it approves", () => {
    const sql = latest("approve_family_join");
    const check = sql.search(/family_member_count\s*\(\s*v_code\s*,\s*v_their_role\s*\)\s*>=\s*v_cap/);
    const approve = sql.search(/set\s+status\s*=\s*'approved'/);
    expect(check).toBeGreaterThan(-1);
    expect(approve).toBeGreaterThan(check);
    expect(sql).toMatch(/'family_full_'\s*\|\|\s*v_their_role/);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/verify_email_required/);
  });
});

describe("045: what people are told", () => {
  it("uses the owner's wording", () => {
    expect(FAMILY_PLAN_SCOPE_LABEL).toBe("For one family: up to 4 players and 2 parents");
    expect(familyFullMessage("player")).toBe(
      "This family already has 4 players. Contact support@seededtennis.com"
    );
    expect(familyFullMessage("parent")).toBe(
      "This family already has 2 parents. Contact support@seededtennis.com"
    );
  });

  it("reads both of the database's answers", () => {
    expect(familyFullRole("player")).toBe("player");
    expect(familyFullRole("parent")).toBe("parent");
    expect(familyFullRole("family_full_player")).toBe("player");
    expect(familyFullRole("family_full_parent")).toBe("parent");
    expect(familyFullRole("No pending request from that person.")).toBeNull();
    expect(familyFullRole(undefined)).toBeNull();
  });

  it("a family-code form shows the cap message, not a generic error", () => {
    const outcome = joinOutcomeFor({ status: "family_full", message: familyFullMessage("parent") });
    expect(outcome).toEqual({ kind: "error", message: familyFullMessage("parent") });
  });
});
