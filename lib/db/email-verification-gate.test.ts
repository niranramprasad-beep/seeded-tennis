import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { latestFunctionDefinition, readMigrations } from "./migration-sql";
import { AUTH_ERROR_MESSAGES, friendlyAuthError, isEmailVerifiedFor } from "@/lib/auth";
import {
  EMAIL_VERIFIED_PATH,
  VERIFY_EMAIL_REQUIRED,
  VERIFY_EMAIL_REQUIRED_MESSAGE,
  isEmailVerifyRequired,
} from "./email-verification";

/* Parent email verification (B6, migration 043).
 *
 * Production auto-confirms email at sign-up, so auth.users.email_confirmed_at
 * proves nothing. The proof is a session that came from a link/code sent to
 * the address (JWT amr: otp / magiclink, timestamped AFTER a recorded
 * request for that same address), recorded by mark_email_verified() in the
 * PRIVILEGED profiles.email_verified_at.
 * These tests read the migration SQL and fail the build when:
 *   - a client could set email_verified_* / email_verify_requested_*;
 *   - mark_email_verified() stops binding the proof to the request (the
 *     verify-A-then-switch-to-B attack a reviewer ran on staging);
 *   - one of the three family RPCs stops refusing an unverified PARENT, or
 *     starts refusing players;
 *   - mark_email_verified() starts trusting a password session or
 *     email_confirmed_at;
 *   - email_is_verified() becomes callable by clients (an oracle);
 *   - a rate-limit bucket silently disappears.
 * Mutation-tested; see docs/HANDOFF.md §J Step 18. */

const migrations = readMigrations();

function fn(name: string): { file: string; sql: string } {
  const def = latestFunctionDefinition(name, migrations);
  expect(def, `no migration defines public.${name}()`).not.toBeNull();
  return { file: def!.file, sql: def!.sql.toLowerCase() };
}

/** Every column the profile trigger treats as Seeded-only. */
const PRIVILEGED_PROFILE_COLUMNS = [
  "subscription_tier",
  "whop_membership_id",
  "stripe_customer_id",
  "stripe_subscription_id",
  "role",
  "family_code",
  "email_verified_at",
  "email_verified_for",
  "email_verify_requested_for",
  "email_verify_requested_at",
];

describe("protect_privileged_profile_columns(): the privileged list", () => {
  it.each(PRIVILEGED_PROFILE_COLUMNS)("refuses any client change to %s on UPDATE", (column) => {
    const { file, sql } = fn("protect_privileged_profile_columns");
    expect(
      sql,
      `${file}: the UPDATE branch must refuse a change to ${column} (42501)`
    ).toMatch(new RegExp(`new\\.${column}\\s+is distinct from old\\.${column}`));
  });

  it("scrubs the billing and verification columns on INSERT (an upsert's INSERT half included)", () => {
    const { file, sql } = fn("protect_privileged_profile_columns");
    for (const [column, value] of [
      ["subscription_tier", "'free'"],
      ["whop_membership_id", "null"],
      ["stripe_customer_id", "null"],
      ["stripe_subscription_id", "null"],
      ["email_verified_at", "null"],
      ["email_verified_for", "null"],
      ["email_verify_requested_for", "null"],
      ["email_verify_requested_at", "null"],
    ]) {
      expect(sql, `${file}: INSERT must force ${column} := ${value}`).toMatch(
        new RegExp(`new\\.${column}\\s*:=\\s*${value}`)
      );
    }
  });

  it("keeps birth_year AND birth_month write-once, and everything 035 did", () => {
    const { file, sql } = fn("protect_privileged_profile_columns");
    // Anchored on `if` … `then raise`: an `if false and …` must not pass.
    expect(sql, file).toMatch(
      /\bif old\.birth_year is not null and new\.birth_year is distinct from old\.birth_year then\s+raise exception/
    );
    expect(sql, file).toMatch(
      /\bif old\.birth_month is not null and new\.birth_month is distinct from old\.birth_month then\s+raise exception/
    );
    expect(sql, `${file}: 032's takeover check`).toMatch(/family_code_is_taken\(new\.family_code\)/);
    expect(sql, `${file}: 033's required birth year`).toMatch(/new\.birth_year is null/);
    expect(sql, `${file}: 035's upsert-safe new-account test`).toMatch(/profile_row_exists\(new\.id\)/);
    expect(sql, `${file}: consent forced from OLD`).toMatch(/new\.consent_status\s*:=\s*old\.consent_status/);
    expect(sql, `${file}: never executable by clients`).toMatch(
      /revoke all on function public\.protect_privileged_profile_columns\(\) from public, anon, authenticated/
    );
  });
});

describe("the three family RPCs refuse an unverified PARENT, never a player", () => {
  const PARENT_GATE =
    /if exists \(select 1 from public\.profiles where id = v_user and role = 'parent'\)\s+and not public\.email_is_verified\(v_user\) then\s+raise exception 'verify_email_required' using errcode = '42501';/;

  it("join_family: parents only, and BEFORE the attempt is logged", () => {
    const { file, sql } = fn("join_family");
    expect(sql, `${file}: join_family must refuse an unverified parent`).toMatch(PARENT_GATE);
    const gateAt = sql.search(PARENT_GATE);
    const logAt = sql.indexOf("insert into public.family_join_attempts");
    expect(logAt, `${file}: 023's attempt log must still be there`).toBeGreaterThan(-1);
    expect(gateAt, `${file}: check must run before the attempt is logged`).toBeLessThan(logAt);
    // 023's rate limit and return-a-status shape survive.
    expect(sql).toMatch(/v_recent >= 5/);
    expect(sql).toMatch(/return jsonb_build_object\('status','invalid'\)/);
    expect(sql).toMatch(/grant execute on function public\.join_family\(text\) to authenticated/);
  });

  it("approve_family_join: parents only; 026/030's checks preserved", () => {
    const { file, sql } = fn("approve_family_join");
    expect(sql, `${file}: approve must refuse an unverified parent`).toMatch(PARENT_GATE);
    expect(sql).toMatch(/is_family_member\(v_code\)/);
    expect(sql).toMatch(/status = 'pending'/);
    expect(sql).toMatch(/v_consent := 'still_pending'/);
    expect(sql).toMatch(/grant execute on function public\.approve_family_join\(uuid\) to authenticated/);
  });

  it("grant_parent_consent: checked once the caller is known to be a parent", () => {
    const { file, sql } = fn("grant_parent_consent");
    const roleReturn = sql.indexOf("'not_a_parent_account'");
    const gate = sql.search(
      /if not public\.email_is_verified\(v_user\) then\s+raise exception 'verify_email_required' using errcode = '42501';/
    );
    expect(roleReturn, file).toBeGreaterThan(-1);
    expect(gate, `${file}: grant_parent_consent must refuse an unverified parent`).toBeGreaterThan(roleReturn);
    expect(sql).toMatch(/is_family_member\(v_child_code\)/);
    expect(sql).toMatch(/grant execute on function public\.grant_parent_consent\(uuid\) to authenticated/);
  });

  it("no RPC refuses on the raw check alone (that would block players)", () => {
    for (const name of ["join_family", "approve_family_join"]) {
      const { file, sql } = fn(name);
      const bare = sql.match(/if not public\.email_is_verified\(v_user\) then/g) ?? [];
      expect(bare.length, `${file}: ${name} must check role = 'parent' before email_is_verified`).toBe(0);
    }
  });
});

describe("mark_email_verified(): what counts as proof", () => {
  it("accepts only link/code sessions (amr) or a verified Google identity", () => {
    const { file, sql } = fn("mark_email_verified");
    expect(sql).toContain("security definer");
    expect(sql).toMatch(/auth\.jwt\(\) -> 'amr'/);
    const list = sql.match(/'method' in \(([^)]*)\)/)?.[1] ?? "";
    for (const method of ["'otp'", "'magiclink'"]) expect(list, `${file}: must accept ${method}`).toContain(method);
    for (const method of [
      "'password'",
      "'oauth'",
      "'token_refresh'",
      "'anonymous'",
      "'totp'",
      // Accepted by the first version; the app never sends either to verify.
      "'recovery'",
      "'email/signup'",
    ]) {
      expect(list, `${file}: must NOT accept ${method} — it proves nothing about the address`).not.toContain(method);
    }
    expect(sql).toMatch(/provider = 'google'/);
    expect(sql).toMatch(/email_verified/);
  });

  it("never treats email_confirmed_at as proof (production auto-confirms)", () => {
    for (const name of ["mark_email_verified", "email_is_verified"]) {
      const { file, sql } = fn(name);
      expect(sql, `${file}: ${name} must not read email_confirmed_at`).not.toContain("email_confirmed_at");
    }
  });

  it("is callable by the app; email_is_verified() is internal", () => {
    expect(fn("mark_email_verified").sql).toMatch(
      /grant execute on function public\.mark_email_verified\(\) to authenticated/
    );
    const helper = fn("email_is_verified");
    expect(helper.sql).toMatch(/revoke all on function public\.email_is_verified\(uuid\) from public, anon, authenticated/);
    expect(helper.sql, `${helper.file}: email_is_verified must not be granted to authenticated`).not.toMatch(
      /grant execute on function public\.email_is_verified\(uuid\) to [^;]*authenticated/
    );
  });

  it("only counts while the proven address is the CURRENT auth email", () => {
    const { sql } = fn("email_is_verified");
    expect(sql).toMatch(/lower\(p\.email_verified_for\) = lower\(u\.email\)/);
  });
});

describe("mark_email_verified(): the proof is bound to a fresh request for the current address", () => {
  /** The expression assigned to v_proven for the link/code path. */
  function proofExpression(): { file: string; expr: string; sql: string } {
    const { file, sql } = fn("mark_email_verified");
    const expr = sql.match(/\bv_proven :=([\s\S]*?);/)?.[1] ?? "";
    expect(expr, `${file}: mark_email_verified must assign v_proven from the checks`).not.toBe("");
    return { file, expr, sql };
  }

  it("reads the amr TIMESTAMP and compares it to the request time (not just the method)", () => {
    const { file, expr, sql } = proofExpression();
    expect(sql, `${file}: the proof time must come from the amr entry's timestamp`).toMatch(
      /max\(\(e ->> 'timestamp'\)::numeric\) into v_proof_at/
    );
    expect(sql).toMatch(/jsonb_typeof\(e -> 'timestamp'\) = 'number'/);
    expect(sql, `${file}: the request time must be read from profiles`).toMatch(
      /select p\.email_verify_requested_for, p\.email_verify_requested_at\s+into v_requested_for, v_requested_at/
    );
    expect(expr, `${file}: the session must be authenticated at or after the request`).toMatch(
      /v_proof_at >= floor\(extract\(epoch from v_requested_at\)\)/
    );
    expect(expr, `${file}: and within the last 60 minutes`).toMatch(
      /v_proof_at >= extract\(epoch from now\(\) - interval '60 minutes'\)/
    );
    expect(expr).toMatch(/v_requested_at is not null/);
  });

  it("compares the CURRENT auth email (and the JWT's email) to requested_for", () => {
    const { file, expr } = proofExpression();
    expect(expr, `${file}: current auth email must equal the requested address`).toMatch(
      /lower\(v_email\) = lower\(v_requested_for\)/
    );
    expect(expr, `${file}: the token's own email claim must equal it too`).toMatch(
      /lower\(coalesce\(v_jwt_email, ''\)\) = lower\(v_requested_for\)/
    );
    expect(expr).toMatch(/v_requested_for is not null/);
  });

  it("refuses a code redeemed within 24 hours of an email change", () => {
    const { file, expr, sql } = proofExpression();
    expect(sql).toMatch(/from public\.auth_email_changes c where c\.user_id = v_user/);
    expect(expr, `${file}: no email change in the 24 h before the proof`).toMatch(
      /v_changed_at is null\s+or extract\(epoch from v_changed_at\) <= v_proof_at - 86400/
    );
  });

  it("stamps only after the checks, and clears the request so a session stamps once", () => {
    const { file, sql } = proofExpression();
    const gate = sql.indexOf("if not v_proven then\n    return false;");
    const stamp = sql.indexOf("update public.profiles");
    expect(gate, `${file}: the not-proven return must exist`).toBeGreaterThan(-1);
    expect(stamp, `${file}: the stamp must come after it`).toBeGreaterThan(gate);
    const update = sql.slice(stamp, sql.indexOf("where id = v_user", stamp));
    expect(update).toMatch(/email_verified_for\s*=\s*v_email/);
    expect(update, `${file}: success must clear the request`).toMatch(/email_verify_requested_for\s*=\s*null/);
    expect(update).toMatch(/email_verify_requested_at\s*=\s*null/);
  });

  it("a profile_write refusal reads as 'too many tries', not 'not proven'", () => {
    const { sql } = proofExpression();
    expect(sql).toMatch(
      /exception when sqlstate '53400' then\s+raise exception 'email_verify_rate_limited' using errcode = '53400';/
    );
  });
});

describe("request_email_verification(): the only writer of the request", () => {
  it("spends email_verify, records the CURRENT auth email, and is for authenticated only", () => {
    const { file, sql } = fn("request_email_verification");
    expect(sql).toContain("security definer");
    expect(sql, `${file}: must spend the email_verify bucket`).toMatch(/consume_rate_limit\('email_verify'\)/);
    expect(sql, `${file}: the address is the account's own`).toMatch(
      /select u\.email into v_email from auth\.users u where u\.id = v_user/
    );
    expect(sql).toMatch(/set email_verify_requested_for = v_email,\s+email_verify_requested_at\s+= now\(\)/);
    expect(sql).toMatch(/revoke all on function public\.request_email_verification\(\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.request_email_verification\(\) to authenticated/);
  });

  it("an auth.users trigger records every email change", () => {
    const sql = migrations.map((m) => m.body.toLowerCase()).join("\n");
    expect(sql).toMatch(
      /create trigger seeded_note_auth_email_change\s+after update of email on auth\.users\s+for each row\s+when \(old\.email is distinct from new\.email\)/
    );
    expect(fn("note_auth_email_change").sql).toMatch(/on conflict \(user_id\) do update set changed_at = excluded\.changed_at/);
    expect(sql).toMatch(/revoke all on table public\.auth_email_changes from public, anon, authenticated/);
  });

  it("the app requests BEFORE it sends, and sends to the address the database returned", () => {
    const src = readFileSync(join(__dirname, "email-verification.ts"), "utf8");
    const request = src.indexOf('rpc("request_email_verification")');
    const send = src.indexOf("signInWithOtp(");
    expect(request).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(request);
    expect(src).toMatch(/address = request\.email;/);
    expect(src).toMatch(/signInWithOtp\(\{\s+email: address,/);
  });
});

describe("rate_limit_for_bucket(): email_verify added, nothing dropped", () => {
  function buckets(sql: string): Map<string, number> {
    return new Map([...sql.matchAll(/when\s+'([a-z_]+)'\s+then\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  }

  it("keeps every bucket an earlier definition had", () => {
    const latest = buckets(fn("rate_limit_for_bucket").sql);
    const before035 = latestFunctionDefinition(
      "rate_limit_for_bucket",
      migrations.filter((m) => m.file < "036")
    );
    expect(before035).not.toBeNull();
    for (const [bucket, limit] of buckets(before035!.sql.toLowerCase())) {
      expect(latest.get(bucket), `bucket ${bucket} disappeared or changed`).toBe(limit);
    }
  });

  it("caps email_verify tightly (each one sends a real email)", () => {
    const limit = buckets(fn("rate_limit_for_bucket").sql).get("email_verify");
    expect(limit).toBeDefined();
    expect(limit!).toBeLessThanOrEqual(5);
  });
});

describe("the app never writes the verification columns", () => {
  it("writeCurrentPlayerProfile and the signup inserts do not send email_verified_*", () => {
    const src = readFileSync(join(__dirname, "..", "auth.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/email_verified_(at|for)\s*:/);
  });
});

describe("isEmailVerifiedFor() mirrors the SQL", () => {
  const user = { email: "Fake-PB4-Parent@example.com", identities: [] };

  it("is false for a fresh account — never from email_confirmed_at", () => {
    expect(isEmailVerifiedFor({ email_verified_at: null, email_verified_for: null }, user)).toBe(false);
  });

  it("is true when the proven address is the current one (case-insensitive)", () => {
    expect(
      isEmailVerifiedFor(
        { email_verified_at: "2026-11-18T00:00:00Z", email_verified_for: "fake-pb4-parent@example.com" },
        user
      )
    ).toBe(true);
  });

  it("is false after an email change", () => {
    expect(
      isEmailVerifiedFor(
        { email_verified_at: "2026-11-18T00:00:00Z", email_verified_for: "old-address@example.com" },
        user
      )
    ).toBe(false);
  });

  it("is true for a verified Google identity for the same address", () => {
    expect(
      isEmailVerifiedFor(null, {
        email: "fake-pb2-player@example.com",
        identities: [
          { provider: "google", identity_data: { email: "fake-pb2-player@example.com", email_verified: true } },
        ],
      })
    ).toBe(true);
  });

  it("is false for an unverified or different Google email", () => {
    expect(
      isEmailVerifiedFor(null, {
        email: "a@example.com",
        identities: [{ provider: "google", identity_data: { email: "a@example.com", email_verified: false } }],
      })
    ).toBe(false);
    expect(
      isEmailVerifiedFor(null, {
        email: "a@example.com",
        identities: [{ provider: "google", identity_data: { email: "b@example.com", email_verified: true } }],
      })
    ).toBe(false);
  });
});

describe("the refusal reads as plain words", () => {
  const pgError = { code: "42501", message: VERIFY_EMAIL_REQUIRED, details: null, hint: null };

  it("isEmailVerifyRequired detects 043's refusal and nothing else", () => {
    expect(isEmailVerifyRequired(pgError)).toBe(true);
    expect(isEmailVerifyRequired("verify_email_required")).toBe(true);
    expect(isEmailVerifyRequired({ code: "42501", message: "This profile field can only be changed by Seeded." })).toBe(false);
    expect(isEmailVerifyRequired(null)).toBe(false);
  });

  it("friendlyAuthError maps it to the one sentence", () => {
    expect(friendlyAuthError(pgError)).toBe(AUTH_ERROR_MESSAGES.verifyEmailRequired);
    expect(VERIFY_EMAIL_REQUIRED_MESSAGE).toBe("Confirm your email first. We'll send you a link.");
  });

  it("the link lands on /auth/verified, which exists", () => {
    expect(EMAIL_VERIFIED_PATH).toBe("/auth/verified");
    const page = readFileSync(join(__dirname, "..", "..", "app", "auth", "verified", "page.tsx"), "utf8");
    expect(page).toContain("EmailVerified");
  });
});
