import { describe, expect, it } from "vitest";
import { readMigrations, withoutComments } from "./migration-sql";

/* Migration 051: a pending-consent (under-13) account cannot write tennis or
 * recruiting data onto its own profile. 030's RESTRICTIVE policy keeps an
 * own-row carve-out on `profiles`, so the column-level rule lives in a
 * BEFORE UPDATE trigger. This pins its shape: it must fire on UPDATE (the
 * app's upsert fires it too), exempt only the privileged roles, consult
 * account_active(), and cover the tennis columns. Found by the review-ready
 * sweep (R9 HIGH-1): the UI let a pending child add a target school and the
 * database accepted it. */

const sql = withoutComments(
  readMigrations().find((m) => m.file.startsWith("051_"))?.body ?? ""
).toLowerCase();

describe("051: pending-consent accounts cannot record tennis data on their profile", () => {
  it("the migration exists", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("is a BEFORE UPDATE trigger on profiles", () => {
    expect(sql).toMatch(/create trigger pending_consent_profile_guard\s+before update on public\.profiles/);
  });

  it("exempts only service_role/postgres/supabase_admin, then asks account_active()", () => {
    expect(sql).toMatch(/current_user in \('service_role', 'postgres', 'supabase_admin'\)/);
    expect(sql).toMatch(/if public\.account_active\(\) then\s+return new;/);
  });

  it.each([
    "target_school_slugs",
    "current_utr",
    "weaknesses",
    "commitment_date",
    "tournaments_goal",
    "tournaments_planned_season",
    "tournaments_played",
    "utr_profile_link",
  ])("refuses a change to %s while pending", (col) => {
    expect(sql).toContain(`new.${col} is distinct from old.${col}`);
  });

  it("refuses with 42501 and a machine-readable reason", () => {
    expect(sql).toMatch(/raise exception 'consent_required:[^']*'\s+using errcode = '42501'/);
  });

  it("is not callable by clients", () => {
    expect(sql).toMatch(/revoke all on function public\.pending_consent_profile_guard\(\) from public, anon, authenticated/);
  });
});
