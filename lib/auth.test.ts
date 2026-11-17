import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR_MESSAGES,
  friendlyAuthError,
  writeCurrentPlayerProfile,
  type PlayerWriteContext,
} from "./auth";
import { emptyPlayer } from "@/lib/data/user";
import type { Player } from "@/lib/types";

// Minimal duck-typed stand-in for the request-scoped Supabase client —
// just enough of the `.from("profiles").upsert(...)` surface
// writeCurrentPlayerProfile actually calls. `results` is consumed in
// order, one per upsert call, so a test can script "fails once (42703),
// then succeeds" without a real database.
function fakeSupabase(results: Array<{ error: { code?: string; message: string } | null }>) {
  const upsertCalls: Record<string, unknown>[] = [];
  let call = 0;
  const supabase = {
    from: (_table: string) => ({
      upsert: async (payload: Record<string, unknown>) => {
        upsertCalls.push(payload);
        const result = results[call] ?? { error: null };
        call += 1;
        return result;
      },
    }),
  };
  return { supabase: supabase as unknown as PlayerWriteContext["supabase"], upsertCalls };
}

const player: Player = {
  ...emptyPlayer,
  name: "Maya Chen",
  currentUTR: 9.5,
  graduationYear: 2028,
  gender: "female",
  familyCode: "CHEN-8X2K",
  homeArea: "Bethesda, MD",
  utrProfileLink: "app.utrsports.net/profiles/12345",
  gpa: 3.7,
};

describe("writeCurrentPlayerProfile", () => {
  it("upserts the full mapped row, including the normalized UTR link, on success", async () => {
    const { supabase, upsertCalls } = fakeSupabase([{ error: null }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).resolves.toBeUndefined();

    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]).toMatchObject({
      id: "user-1",
      email: "maya@example.com",
      name: "Maya Chen",
      country: player.country,
      gender: "female",
      role: "player",
      family_code: "CHEN-8X2K",
      current_utr: 9.5,
      graduation_year: 2028,
      home_area: "Bethesda, MD",
      utr_profile_link: "https://app.utrsports.net/profiles/12345",
      gpa: 3.7,
      deletion_requested_at: null,
    });
  });

  it("falls back to the base-only upsert on an undefined-column (42703) error", async () => {
    const { supabase, upsertCalls } = fakeSupabase([
      { error: { code: "42703", message: "column profiles.home_area does not exist" } },
      { error: null },
    ]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).resolves.toBeUndefined();

    expect(upsertCalls).toHaveLength(2);
    // The fallback row must never carry the migration-014 columns.
    expect(upsertCalls[1]).not.toHaveProperty("home_area");
    expect(upsertCalls[1]).not.toHaveProperty("utr_profile_link");
    expect(upsertCalls[1]).not.toHaveProperty("gpa");
    expect(upsertCalls[1]).not.toHaveProperty("deletion_requested_at");
    expect(upsertCalls[1]).toMatchObject({ id: "user-1", name: "Maya Chen" });
  });

  it("throws the real Supabase error message when the write fails for a non-42703 reason", async () => {
    const { supabase } = fakeSupabase([{ error: { code: "23505", message: "duplicate key value" } }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).rejects.toThrow("duplicate key value");
  });

  it("also throws when the 42703 fallback upsert itself fails", async () => {
    const { supabase } = fakeSupabase([
      { error: { code: "42703", message: "column profiles.home_area does not exist" } },
      { error: { code: "500", message: "fallback also failed" } },
    ]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await expect(writeCurrentPlayerProfile(player, ctx)).rejects.toThrow("fallback also failed");
  });

  it("stores null (not the raw garbage) for an invalid UTR profile link rather than failing the whole write", async () => {
    const { supabase, upsertCalls } = fakeSupabase([{ error: null }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await writeCurrentPlayerProfile({ ...player, utrProfileLink: "not a url" }, ctx);

    expect(upsertCalls[0]).toMatchObject({ utr_profile_link: null });
  });

  it("stores null for an empty UTR profile link", async () => {
    const { supabase, upsertCalls } = fakeSupabase([{ error: null }]);
    const ctx: PlayerWriteContext = { supabase, userId: "user-1", userEmail: "maya@example.com" };

    await writeCurrentPlayerProfile({ ...player, utrProfileLink: "" }, ctx);

    expect(upsertCalls[0]).toMatchObject({ utr_profile_link: null });
  });
});

// Every string an auth screen can show comes from friendlyAuthError or is
// hand-written. These are the raw texts Supabase Auth and the browser really
// produce (prose and codes, since the endpoint and the supabase-js version
// decide which you get), each with the sentence it must become.
describe("friendlyAuthError", () => {
  const cases: Array<[string, string]> = [
    ["Invalid login credentials", AUTH_ERROR_MESSAGES.invalidCredentials],
    ["invalid_credentials", AUTH_ERROR_MESSAGES.invalidCredentials],
    ["Email not confirmed", AUTH_ERROR_MESSAGES.emailNotConfirmed],
    ["email_not_confirmed", AUTH_ERROR_MESSAGES.emailNotConfirmed],
    ["User already registered", AUTH_ERROR_MESSAGES.alreadyRegistered],
    ["user_already_exists", AUTH_ERROR_MESSAGES.alreadyRegistered],
    ["A user with this email address has already been registered", AUTH_ERROR_MESSAGES.alreadyRegistered],
    ["Password should be at least 6 characters.", AUTH_ERROR_MESSAGES.weakPassword],
    ["weak_password", AUTH_ERROR_MESSAGES.weakPassword],
    [
      "Password is known to be weak and easy to guess, please choose a different one.",
      AUTH_ERROR_MESSAGES.weakPassword,
    ],
    ["New password should be different from the old password.", AUTH_ERROR_MESSAGES.samePassword],
    ["Email rate limit exceeded", AUTH_ERROR_MESSAGES.rateLimited],
    ["over_email_send_rate_limit", AUTH_ERROR_MESSAGES.rateLimited],
    ["Request rate limit reached", AUTH_ERROR_MESSAGES.rateLimited],
    ["For security purposes, you can only request this after 42 seconds.", AUTH_ERROR_MESSAGES.rateLimited],
    ["Failed to fetch", AUTH_ERROR_MESSAGES.network],
    ["TypeError: NetworkError when attempting to fetch resource.", AUTH_ERROR_MESSAGES.network],
    ["Load failed", AUTH_ERROR_MESSAGES.network],
    ["Unable to validate email address: invalid format", AUTH_ERROR_MESSAGES.invalidEmail],
    ["Email link is invalid or has expired", AUTH_ERROR_MESSAGES.linkExpired],
    ["Auth session missing!", AUTH_ERROR_MESSAGES.linkExpired],
    ["Signups not allowed for this instance", AUTH_ERROR_MESSAGES.signupsClosed],
    ["Unsupported provider: provider is not enabled", AUTH_ERROR_MESSAGES.providerUnavailable],
    ["Database error saving new user", AUTH_ERROR_MESSAGES.serverError],
    ["unexpected_failure", AUTH_ERROR_MESSAGES.serverError],
    ["Unexpected failure, please check server logs for more information", AUTH_ERROR_MESSAGES.serverError],
    ["Internal Server Error", AUTH_ERROR_MESSAGES.serverError],
    ["something nobody has seen before", AUTH_ERROR_MESSAGES.unknown],
    ["", AUTH_ERROR_MESSAGES.unknown],
  ];

  it.each(cases)("maps %j to a sentence we wrote", (raw, expected) => {
    expect(friendlyAuthError(raw)).toBe(expected);
  });

  it("uses the exact Board 21 sentence for wrong credentials", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe(
      "That email and password don't match. Try again, or reset your password."
    );
  });

  it("never lets the raw Supabase text through, whatever arrives", () => {
    const raws = [
      "Invalid login credentials",
      "Database error saving new user",
      "unexpected_failure",
      "Email rate limit exceeded",
      "Unexpected failure, please check server logs for more information",
      'AuthApiError: {"code":"unexpected_failure","message":"boom"}',
      "permission denied for table profiles",
      "duplicate key value violates unique constraint \"profiles_pkey\"",
      "JWT expired",
    ];
    const allowed = new Set<string>(Object.values(AUTH_ERROR_MESSAGES));
    for (const raw of raws) {
      const out = friendlyAuthError(raw);
      expect(allowed.has(out), `${raw} -> ${out}`).toBe(true);
      expect(out.toLowerCase()).not.toContain(raw.toLowerCase());
      for (const leak of ["supabase", "server logs", "database", "unexpected_failure", "rate limit exceeded", "invalid login credentials", "jwt", "constraint"]) {
        expect(out.toLowerCase(), `${raw} leaked "${leak}"`).not.toContain(leak);
      }
    }
  });

  it("accepts an Error or a non-string without leaking it", () => {
    expect(friendlyAuthError(new Error("Failed to fetch"))).toBe(AUTH_ERROR_MESSAGES.network);
    expect(friendlyAuthError(new Error("Database error saving new user"))).toBe(
      AUTH_ERROR_MESSAGES.serverError
    );
    expect(friendlyAuthError(undefined)).toBe(AUTH_ERROR_MESSAGES.unknown);
    expect(friendlyAuthError({ weird: true })).toBe(AUTH_ERROR_MESSAGES.unknown);
  });
});

describe("friendlyAuthError reads the AuthError's code, not only its prose", () => {
  // Callers used to pass `error.message`, so the code branches never ran and
  // newer Supabase prose fell through to "Something went wrong"
  // (independent review, 2026-11-16).
  it("maps by code when the prose is unfamiliar", () => {
    expect(friendlyAuthError({ code: "weak_password", message: "Some new wording" })).toBe(AUTH_ERROR_MESSAGES.weakPassword);
    expect(friendlyAuthError({ code: "user_already_exists", message: "?" })).toBe(AUTH_ERROR_MESSAGES.alreadyRegistered);
    expect(friendlyAuthError({ code: "email_address_invalid", message: "?" })).toBe(AUTH_ERROR_MESSAGES.invalidEmail);
  });
  it("maps the current email prose", () => {
    expect(friendlyAuthError('Email address "x@y.z" is invalid')).toBe(AUTH_ERROR_MESSAGES.invalidEmail);
    expect(friendlyAuthError("Email address not authorized")).toBe(AUTH_ERROR_MESSAGES.emailNotAllowed);
    expect(friendlyAuthError({ code: "email_address_not_authorized", message: "x" })).toBe(AUTH_ERROR_MESSAGES.emailNotAllowed);
  });
  it("still never leaks the raw text of an object error", () => {
    const out = friendlyAuthError({ code: "unexpected_failure", message: "Database error saving new user" });
    expect(Object.values(AUTH_ERROR_MESSAGES)).toContain(out);
    expect(out).not.toMatch(/database|unexpected_failure/i);
  });
});
