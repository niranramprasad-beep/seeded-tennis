import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FAMILY_PLAN_MAX_PARENTS, FAMILY_PLAN_MAX_PLAYERS } from "@/lib/types";
import {
  familyCapCounts,
  familyCapLine,
  familyRoleIsFull,
  joinedLabel,
  leaveFamilyConsequences,
} from "./family-settings";
import { ACCOUNT_HOLDER_CANNOT_LEAVE_MESSAGE, leaveFamilyOutcome } from "./db/family-join";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

type Row = { userId: string; role: "player" | "parent"; status: "approved" | "pending" };
const row = (userId: string, role: Row["role"], status: Row["status"] = "approved"): Row => ({ userId, role, status });

describe("Settings → Family: the cap line", () => {
  it("counts approved members by role, once each, and never a pending request", () => {
    const counts = familyCapCounts([
      row("a", "player"),
      row("b", "player"),
      row("b", "player"), // a duplicate row must not count twice
      row("c", "parent"),
      row("d", "parent", "pending"),
      row("e", "player", "pending"),
    ]);
    expect(counts).toEqual({ players: 2, parents: 1 });
  });

  it("reads '2 of 4 players · 1 of 2 parents', numbers from the constants", () => {
    expect(familyCapLine({ players: 2, parents: 1 })).toBe(
      `2 of ${FAMILY_PLAN_MAX_PLAYERS} players · 1 of ${FAMILY_PLAN_MAX_PARENTS} parents`
    );
    expect(familyCapLine({ players: 2, parents: 1 })).toBe("2 of 4 players · 1 of 2 parents");
  });

  it("knows when a role is full (045's cap)", () => {
    expect(familyRoleIsFull({ players: FAMILY_PLAN_MAX_PLAYERS, parents: 0 }, "player")).toBe(true);
    expect(familyRoleIsFull({ players: FAMILY_PLAN_MAX_PLAYERS - 1, parents: 0 }, "player")).toBe(false);
    expect(familyRoleIsFull({ players: 0, parents: FAMILY_PLAN_MAX_PARENTS }, "parent")).toBe(true);
    expect(familyRoleIsFull({ players: 0, parents: FAMILY_PLAN_MAX_PARENTS - 1 }, "parent")).toBe(false);
  });

  it("no Settings or Billing file hardcodes the caps", () => {
    for (const f of [
      "components/seeded/settings/settings-family-section.tsx",
      "components/seeded/settings/billing-content.tsx",
      "lib/family-settings.ts",
    ]) {
      const code = codeOnly(read(f));
      expect(code, f).not.toMatch(/\bof [24]\b|[24] players|[24] parents/);
    }
    expect(codeOnly(read("components/seeded/settings/billing-content.tsx"))).toMatch(
      /FAMILY_PLAN_MAX_PLAYERS[\s\S]*FAMILY_PLAN_MAX_PARENTS/
    );
  });
});

describe("Settings → Family: dates and the leave dialog", () => {
  it("labels the join date in the viewer's own time zone", () => {
    // Local noon, so every TZ the suite runs in agrees on the day.
    const iso = new Date(2026, 10, 3, 12, 0, 0).toISOString();
    expect(joinedLabel(iso)).toBe("Joined Nov 3, 2026");
    expect(joinedLabel(iso, "Asked")).toBe("Asked Nov 3, 2026");
    expect(joinedLabel(null)).toBeNull();
    expect(joinedLabel("not a date")).toBeNull();
  });

  it("says a payer's Family plan stops covering the family, only for a payer", () => {
    const payer = leaveFamilyConsequences({ viewerPaysForFamily: true }).join(" ");
    const other = leaveFamilyConsequences({ viewerPaysForFamily: false }).join(" ");
    expect(payer).toMatch(/Family plan stops covering this family/);
    expect(other).not.toMatch(/Family plan/);
    // Nothing promises a notification: Seeded sends none.
    expect(payer + other).not.toMatch(/notif|email|we'll tell|let them know/i);
  });

  it("maps leave_family()'s refusals without leaking a raw Postgres message", () => {
    expect(leaveFamilyOutcome(null)).toEqual({ ok: true });
    expect(leaveFamilyOutcome({ code: "22023", message: "account_holder_cannot_leave" })).toEqual({
      ok: false,
      reason: "account_holder",
      message: ACCOUNT_HOLDER_CANNOT_LEAVE_MESSAGE,
    });
    expect(leaveFamilyOutcome({ code: "22023", message: "not_in_a_family" })).toMatchObject({ reason: "not_in_family" });
    const raw = leaveFamilyOutcome({ code: "XX000", message: 'relation "x" does not exist' });
    expect(raw).toMatchObject({ ok: false, reason: "error" });
    expect(JSON.stringify(raw)).not.toMatch(/relation/);
  });
});

describe("Settings → Family: the screen's wiring", () => {
  const src = codeOnly(read("components/seeded/settings/settings-family-section.tsx"));

  it("reads people only through family_members(), never `profiles`", () => {
    expect(src).toMatch(/loadFamilyRoster\(/);
    expect(src).not.toMatch(/from\(["']profiles["']\)/);
  });

  it("approves/declines through the RPC helpers and keeps the 043 path visible", () => {
    expect(src).toMatch(/approveFamilyJoin/);
    expect(src).toMatch(/denyFamilyJoin/);
    expect(src).toMatch(/approvalNeedsVerification\(player\)/);
    expect(src).toMatch(/<VerifyEmailToApprove/);
    // The refusal sets the prompt AND keeps the sentence on screen.
    expect(src).toMatch(/if \(message === VERIFY_EMAIL_REQUIRED_MESSAGE\) setRefusedForEmail\(true\);\s*if \(message\) setError\(message\);/);
    expect(src).toMatch(/familyFullMessage\(/);
  });

  it("leaves through leave_family() behind a Seeded dialog, never a native confirm, and removes no one else", () => {
    expect(src).toMatch(/leaveFamily\(\)/);
    expect(src).toMatch(/<ConfirmDialog/);
    expect(src).not.toMatch(/window\.confirm|\bconfirm\(/);
    expect(src).not.toMatch(/removeFamilyMember|remove_family_member/);
  });
});

describe("migration 046: leave_family()", () => {
  const sql = read("supabase/migrations/046_leave_family.sql");
  const body = sql.replace(/^\s*--.*$/gm, "");

  it("takes no argument, so it can only act on its caller", () => {
    expect(body).toMatch(/create or replace function public\.leave_family\(\)\s*returns jsonb/);
  });

  it("is SECURITY DEFINER with a fixed search_path, closed to anon, open to authenticated", () => {
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = public/);
    expect(body).toMatch(/revoke all on function public\.leave_family\(\) from public, anon;/);
    expect(body).toMatch(/grant execute on function public\.leave_family\(\) to authenticated;/);
  });

  it("every write is keyed on the caller", () => {
    const writes = [...body.matchAll(/(delete from|update)\s+public\.(\w+)[\s\S]*?;/g)].map((m) => m[0]);
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w, w).toMatch(/where (?:user_id|id) = v_user\b/);
  });

  it("refuses the account holder and carries a pasteable rollback", () => {
    expect(body).toMatch(/v_user = public\.family_account_holder\(v_code\)[\s\S]*?account_holder_cannot_leave/);
    expect(sql).toMatch(/ROLLBACK[\s\S]*?drop function if exists public\.leave_family\(\);/);
  });
});

describe("Settings → Family: review fixes (PR D)", () => {
  it("warns an under-13 that leaving makes the account inert (046 resets consent)", () => {
    const lines = leaveFamilyConsequences({ viewerPaysForFamily: false, viewerNeedsParentConsent: true });
    expect(lines.some((l) => /stops saving anything until a parent/.test(l))).toBe(true);
    expect(
      leaveFamilyConsequences({ viewerPaysForFamily: false }).some((l) => /stops saving/.test(l))
    ).toBe(false);
  });

  it("after leaving, drops the local family code and refreshes consent", () => {
    const src = readFileSync(join(process.cwd(), "components/seeded/settings/settings-family-section.tsx"), "utf8");
    expect(src).toMatch(/setPlayerLocal\(\{ familyCode: undefined \}\)/);
    // The consent cache is keyed per user, so a bare "my-consent-state"
    // string would match nothing; it must be refreshed by matcher.
    expect(src).toMatch(/mutateKey\(isMyConsentStateKey\)/);
    expect(src).not.toMatch(/"my-consent-state"/);
  });
});
