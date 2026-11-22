import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AuthPKCECodeVerifierMissingError } from "@supabase/supabase-js";
import type { Player } from "@/lib/types";
import { emptyPlayer } from "@/lib/data/user";
import {
  ALREADY_REGISTERED_GOOGLE_MESSAGE,
  AUTH_ERROR_MESSAGES,
  googleRedirectTo,
  signupErrorMessage,
} from "@/lib/auth";
import { OAUTH_COMPLETE_PATH, parseSignupRoleIntent } from "@/lib/config/auth";
import {
  OAUTH_ERROR_MESSAGES,
  oauthErrorMessage,
  oauthExchangeErrorCode,
  oauthProviderErrorCode,
} from "./oauth-errors";
import { completePathFor, homeFor, landAfterOAuth } from "./oauth-landing";

// Every Google sign-in path, end to end as far as the app's own code goes
// (2026-11-22, after a web developer could not sign in with his own Google
// account). Production's auth logs for that attempt: the sign-in started on
// the deployment's vercel.app address, Supabase created the user, and —
// that address not being on the redirect allow-list — sent the browser to
// the Site URL (seededtennis.com/?code=…). The PKCE verifier lives on the
// address that started the flow, so no exchange was even attempted, and the
// home page showed him signed out with no message. A later email sign-up
// with the same address was then told "already registered".
//
// The allow-list is a dashboard setting. What the app owns, and this file
// pins: that landing is forwarded to /auth/callback, the callback names the
// real problem, the role chosen on the sign-up page survives the round trip,
// and each kind of returning user lands where password sign-in lands them.

const ROOT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const query = (s: string) => new URLSearchParams(s);

const onboardedPlayer: Player = { ...emptyPlayer, name: "Fake Player", role: "player", onboarded: true };
const newPlayer: Player = { ...emptyPlayer, name: "Fake Player", role: "player", onboarded: false };
const parent: Player = { ...emptyPlayer, name: "Fake Parent", role: "parent", onboarded: true };

describe("(c) the sign-up page's role survives the Google round trip", () => {
  it("accepts exactly 'parent' and 'player'", () => {
    expect(parseSignupRoleIntent("parent")).toBe("parent");
    expect(parseSignupRoleIntent("player")).toBe("player");
    for (const v of [null, undefined, "", "Parent", "admin", "parent ", "coach"]) {
      expect(parseSignupRoleIntent(v)).toBeNull();
    }
  });

  it("rides on our own callback URL, beside a safe ?next=", () => {
    expect(googleRedirectTo("https://x.test", undefined, "sign-in", "parent")).toBe(
      "https://x.test/auth/callback?role=parent"
    );
    expect(googleRedirectTo("https://x.test", "/schools", "sign-in", "player")).toBe(
      "https://x.test/auth/callback?next=%2Fschools&role=player"
    );
    // An unsafe next is still dropped; the role is still carried.
    expect(googleRedirectTo("https://x.test", "//evil.com", "sign-in", "parent")).toBe(
      "https://x.test/auth/callback?role=parent"
    );
    // No role: byte-for-byte what it was (the allow-list entry is unchanged).
    expect(googleRedirectTo("https://x.test", undefined, "sign-in")).toBe("https://x.test/auth/callback");
  });

  it("never rides on the 043 verify-email return (that URL must stay bare)", () => {
    expect(googleRedirectTo("https://x.test", "/family", "verify-email", "parent")).toBe(
      "https://x.test/auth/verified"
    );
  });

  it("drops anything that is not one of the two roles", () => {
    expect(
      googleRedirectTo("https://x.test", undefined, "sign-in", "admin" as unknown as "parent")
    ).toBe("https://x.test/auth/callback");
  });

  it("a NEW Google user lands on /auth/complete with the role preselected", async () => {
    const beginSession = vi.fn();
    const deps = { loadPlayer: async () => null, beginSession };
    expect(await landAfterOAuth(deps, null, OAUTH_COMPLETE_PATH, "parent")).toBe("/auth/complete?role=parent");
    expect(await landAfterOAuth(deps, "/plan", OAUTH_COMPLETE_PATH, "player")).toBe(
      "/auth/complete?next=%2Fplan&role=player"
    );
    expect(await landAfterOAuth(deps, null, OAUTH_COMPLETE_PATH)).toBe("/auth/complete");
    expect(beginSession).not.toHaveBeenCalled();
    expect(completePathFor("/auth/complete", null, null)).toBe("/auth/complete");
  });

  it("a RETURNING user's profile decides — the hint is ignored", async () => {
    const beginSession = vi.fn();
    expect(
      await landAfterOAuth({ loadPlayer: async () => onboardedPlayer, beginSession }, null, OAUTH_COMPLETE_PATH, "parent")
    ).toBe("/today");
    expect(beginSession).toHaveBeenCalledWith(onboardedPlayer);
  });

  it("is wired: sign-up page -> GoogleButton -> callback -> /auth/complete", () => {
    const signup = read("components", "auth", "signup-flow.tsx");
    expect(signup).toMatch(/google=\{\{\s*role:\s*accountRole\s*\}\}/);

    const card = read("components", "auth", "auth-card.tsx");
    expect(card).toMatch(/<GoogleButton next=\{google\.next\} label=\{google\.label\} role=\{google\.role\} \/>/);
    expect(card).toMatch(/signInWithGoogle\(next,\s*\{\s*role\s*\}\)/);

    const callback = read("components", "auth", "oauth-callback.tsx");
    expect(callback).toMatch(/parseSignupRoleIntent\(params\.get\("role"\)\)/);

    const complete = read("components", "auth", "complete-oauth-signup.tsx");
    expect(complete).toMatch(/const roleIntent = parseSignupRoleIntent\(params\.get\("role"\)\)/);
    expect(complete).toMatch(/useState<FamilyRole>\(roleIntent \?\? "player"\)/);
    // A parent defaults to joining, as on the email sign-up.
    expect(complete).toMatch(/roleIntent === "parent" \? "join" : "create"/);
    // The chip is still rendered: a preselection, never a decision.
    expect(complete).toMatch(/name="oauth-role"/);
  });
});

describe("(a)/(b)/(d) where a returning Google user lands", () => {
  it("matches password sign-in: parent -> /family, unfinished player -> /onboarding, else /today", () => {
    expect(homeFor(parent)).toBe("/family");
    expect(homeFor(newPlayer)).toBe("/onboarding");
    expect(homeFor(onboardedPlayer)).toBe("/today");
  });

  it("starts the session before choosing, for every kind of returning user", async () => {
    for (const [player, target] of [
      [parent, "/family"],
      [newPlayer, "/onboarding"],
      [onboardedPlayer, "/today"],
    ] as const) {
      const order: string[] = [];
      const beginSession = vi.fn(() => order.push("begin"));
      const got = await landAfterOAuth(
        { loadPlayer: async () => (order.push("load"), player), beginSession },
        null,
        OAUTH_COMPLETE_PATH
      );
      expect(got).toBe(target);
      expect(order).toEqual(["load", "begin"]);
    }
  });

  it("a safe ?next= still wins for a returning user", async () => {
    expect(
      await landAfterOAuth({ loadPlayer: async () => parent, beginSession: vi.fn() }, "/schools", OAUTH_COMPLETE_PATH)
    ).toBe("/schools");
  });

  it("/auth/complete bounces an existing profile to the same place", () => {
    const complete = read("components", "auth", "complete-oauth-signup.tsx");
    expect(complete).toMatch(/beginSession\(existing\);\s*return router\.replace\(next \?\? homeFor\(existing\)\)/);
  });
});

describe("the callback names the real problem", () => {
  it("returns null when the URL carries no error", () => {
    expect(oauthProviderErrorCode(query("code=abc"))).toBeNull();
    expect(oauthProviderErrorCode(query(""))).toBeNull();
  });

  it.each([
    ["error=access_denied&error_description=The+user+denied", "cancelled"],
    ["error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance", "signups_closed"],
    ["error=validation_failed&error_code=provider_disabled", "google_unavailable"],
    ["error=validation_failed&error_description=Unsupported+provider%3A+provider+is+not+enabled", "google_unavailable"],
    ["error=invalid_request&error_code=identity_already_exists&error_description=Identity+is+already+linked", "account_exists"],
    ["error=invalid_request&error_code=email_exists", "account_exists"],
    // Production, 2026-11-21: a bare hit on Supabase's callback.
    ["error=invalid_request&error_code=bad_oauth_callback&error_description=OAuth+state+parameter+missing", "link_expired"],
    ["error=invalid_request&error_code=bad_oauth_state", "link_expired"],
    ["error=invalid_request&error_code=flow_state_not_found", "link_expired"],
    ["error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user", "server_error"],
    ["error=server_error&error_description=Database+error+saving+new+user", "server_error"],
    // An expired email link forwarded from / (next.config.mjs) is not a
    // cancelled Google sign-in.
    ["error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", "link_expired"],
    ["error=access_denied&error_description=Email+link+is+invalid+or+has+expired", "link_expired"],
    ["error=temporarily_unavailable", "google_failed"],
    ["error_description=something+new", "google_failed"],
  ])("%s -> %s", (qs, code) => {
    expect(oauthProviderErrorCode(query(qs))).toBe(code);
  });

  it("a missing PKCE verifier is 'started elsewhere', not 'expired'", () => {
    // The real error supabase-js returns when this browser, on this address,
    // never started the flow.
    expect(oauthExchangeErrorCode(new AuthPKCECodeVerifierMissingError())).toBe("different_browser");
    expect(oauthExchangeErrorCode({ code: "pkce_code_verifier_not_found" })).toBe("different_browser");
    expect(oauthExchangeErrorCode({ code: "flow_state_expired", message: "invalid flow state" })).toBe("link_expired");
    expect(oauthExchangeErrorCode(null)).toBe("link_expired");
  });

  it("the 'started elsewhere' sentence does not name Google (password-reset and email links land on it too)", () => {
    expect(OAUTH_ERROR_MESSAGES.different_browser).not.toMatch(/google/i);
  });

  it("every code has a sentence of ours, and none echoes provider text", () => {
    for (const code of Object.keys(OAUTH_ERROR_MESSAGES)) {
      const message = oauthErrorMessage(code);
      expect(message, code).toBeTruthy();
      expect(message).not.toMatch(/pkce|verifier|state parameter|database error|identity/i);
    }
    expect(oauthErrorMessage("Database error saving new user")).toBe(OAUTH_ERROR_MESSAGES.unknown);
  });

  it("is wired into the callback", () => {
    const callback = read("components", "auth", "oauth-callback.tsx");
    expect(callback).toMatch(/oauthProviderErrorCode\(params\)/);
    expect(callback).toMatch(/fail\(oauthExchangeErrorCode\(error\)\)/);
    // The old two-way mapping is gone.
    expect(callback).not.toMatch(/"cancelled" : "google_failed"/);
  });
});

describe("an auth redirect that falls back to the Site URL", () => {
  it("is forwarded from / to /auth/callback (temporary, query kept by Next)", async () => {
    const mod = await import("../../next.config.mjs?redirects=" + Date.now());
    const redirects = await mod.default.redirects();
    for (const key of ["code", "error", "error_description"]) {
      const rule = redirects.find(
        (r: { has?: { type: string; key: string }[] }) => r.has?.some((h) => h.type === "query" && h.key === key)
      );
      expect(rule, key).toMatchObject({ source: "/", destination: "/auth/callback", permanent: false });
    }
    // Only the bare home page: nothing else is redirected.
    expect(redirects.every((r: { source: string }) => r.source === "/")).toBe(true);
  });
});

describe("(b) an email sign-up for an address Google already created", () => {
  it("names Google when Google sign-in is on", () => {
    expect(signupErrorMessage(AUTH_ERROR_MESSAGES.alreadyRegistered, true)).toBe(ALREADY_REGISTERED_GOOGLE_MESSAGE);
    expect(ALREADY_REGISTERED_GOOGLE_MESSAGE).toMatch(/sign in with Google/);
  });

  it("is unchanged when Google is off, and for every other message", () => {
    expect(signupErrorMessage(AUTH_ERROR_MESSAGES.alreadyRegistered, false)).toBe(AUTH_ERROR_MESSAGES.alreadyRegistered);
    expect(signupErrorMessage(AUTH_ERROR_MESSAGES.weakPassword, true)).toBe(AUTH_ERROR_MESSAGES.weakPassword);
  });

  it("is what the sign-up form shows", () => {
    const signup = read("components", "auth", "signup-flow.tsx");
    expect(signup).toMatch(/signupErrorMessage\(result\.error \?\? AUTH_ERROR_MESSAGES\.unknown, GOOGLE_AUTH_ENABLED\)/);
  });
});
