import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import {
  authEventAction,
  needsUserIdLookup,
  nextUserId,
  type IdentityInput,
} from "./session-identity";

// The user id PlayerProvider keys per-account caches by (the consent answer
// AuthGate, the star hook and Google Analytics wait on). Two ways it broke
// in review: a Google sign-up ended with isAuthed true and userId null, so
// the consent check was never asked (no consent-pending screen for an
// under-13) and every star was refused "still loading"; and the
// onAuthStateChange callback had no behaviour test at all.

const ROOT = join(__dirname, "..");

describe("authEventAction", () => {
  it.each([
    ["TOKEN_REFRESHED", "u1", "u1"],
    ["USER_UPDATED", "u1", "u1"],
    ["INITIAL_SESSION", "u1", "u1"],
    ["INITIAL_SESSION", "u1", null],
    ["INITIAL_SESSION", null, null],
    ["PASSWORD_RECOVERY", "u1", "u1"],
    ["SIGNED_IN", "u1", "u1"], // same user again (e.g. tab refocus)
    ["SIGNED_IN", "u1", null], // this tab's own sign-in: beginSession records it
    ["SIGNED_IN", null, "u1"],
    ["SIGNED_OUT", null, null], // nothing shown, nothing to do
    ["TOKEN_REFRESHED", "u2", "u1"], // only a SIGNED_IN switches accounts
    ["USER_UPDATED", "u2", "u1"],
  ] as const)("%s (session %s, shown %s) → none", (event, sessionUserId, current) => {
    expect(authEventAction(event, sessionUserId, current)).toBe("none");
  });

  it("a DIFFERENT user signing in re-hydrates", () => {
    expect(authEventAction("SIGNED_IN", "u2", "u1")).toBe("rehydrate");
  });

  it("SIGNED_OUT while an account is shown signs this tab out (the only action that clears storage)", () => {
    expect(authEventAction("SIGNED_OUT", null, "u1")).toBe("signOutLocal");
  });
});

function fold(start: string | null, inputs: IdentityInput[]): string | null {
  return inputs.reduce<string | null>((cur, input) => nextUserId(cur, input), start);
}

describe("nextUserId: transitions", () => {
  it("Google sign-up: INITIAL_SESSION, hydrate finds no profile, then beginSession — ends with the id", () => {
    // /auth/complete: there is a live session but no profile row yet.
    const afterHydrate = fold(null, [
      { type: "auth-event", event: "INITIAL_SESSION", sessionUserId: "google-user" },
      { type: "hydrate-signed-out", sessionUserId: "google-user" },
    ]);
    expect(afterHydrate).toBe("google-user");
    // CompleteOAuthSignup → beginSession → session lookup
    const afterBegin = nextUserId(afterHydrate, { type: "session-lookup", sessionUserId: "google-user" });
    expect(afterBegin).toBe("google-user");
    expect(needsUserIdLookup(true, afterBegin)).toBe(false);
  });

  it("even if hydrate ran with the id lost, beginSession's lookup restores it", () => {
    const lost = fold("google-user", [{ type: "hydrate-signed-out", sessionUserId: null }]);
    expect(lost).toBeNull();
    expect(needsUserIdLookup(true, lost)).toBe(true); // the fallback lookup runs
    expect(nextUserId(lost, { type: "session-lookup", sessionUserId: "google-user" })).toBe("google-user");
  });

  it("a failed lookup never erases a known id; a connection error changes nothing", () => {
    expect(nextUserId("u1", { type: "session-lookup", sessionUserId: null })).toBe("u1");
    expect(nextUserId("u1", { type: "hydrate-error" })).toBe("u1");
  });

  it("email sign-in after sign-out: the previous account's id never survives", () => {
    const id = fold("old", [
      { type: "sign-out" },
      { type: "auth-event", event: "SIGNED_OUT", sessionUserId: null },
      { type: "auth-event", event: "SIGNED_IN", sessionUserId: "new" }, // none: tab showed nobody
      { type: "session-lookup", sessionUserId: "new" }, // beginSession
    ]);
    expect(id).toBe("new");
  });

  it("another tab switches accounts: the new id, then hydrate confirms it", () => {
    expect(
      fold("a", [
        { type: "auth-event", event: "SIGNED_IN", sessionUserId: "b" },
        { type: "hydrate-authed", userId: "b" },
      ])
    ).toBe("b");
  });

  it("another tab signs out: null", () => {
    expect(nextUserId("a", { type: "auth-event", event: "SIGNED_OUT", sessionUserId: null })).toBeNull();
  });

  it("token refreshes and same-user events never touch it", () => {
    expect(
      fold("a", [
        { type: "auth-event", event: "TOKEN_REFRESHED", sessionUserId: "a" },
        { type: "auth-event", event: "USER_UPDATED", sessionUserId: "a" },
        { type: "auth-event", event: "SIGNED_IN", sessionUserId: "a" },
        { type: "auth-event", event: "INITIAL_SESSION", sessionUserId: "a" },
      ])
    ).toBe("a");
  });

  it("needsUserIdLookup only when signed in with no id", () => {
    expect(needsUserIdLookup(true, null)).toBe(true);
    expect(needsUserIdLookup(true, "u")).toBe(false);
    expect(needsUserIdLookup(false, null)).toBe(false);
    expect(needsUserIdLookup(false, "u")).toBe(false);
  });
});

describe("PlayerProvider applies these, and only these", () => {
  const src = codeOnly(join(ROOT, "lib/context/player-context.tsx"));

  it("hydrate keeps a live session's id and takes the verified one", () => {
    expect(src).toMatch(/setUserId\(\(cur\) => nextUserId\(cur, \{ type: "hydrate-authed", userId: state\.userId \}\)\)/);
    expect(src).toMatch(
      /setUserId\(\(cur\) =>\s*nextUserId\(cur, \{ type: "hydrate-signed-out", sessionUserId: state\.sessionUserId \?\? null \}\)\s*\)/
    );
  });

  it("beginSession records whose session it is", () => {
    const body = src.slice(src.indexOf("const beginSession = useCallback("), src.indexOf("}, []);", src.indexOf("const beginSession = useCallback(")));
    expect(body).toMatch(/setIsAuthed\(true\)/);
    expect(body).toMatch(/getSessionUserId\(\)\.then\(\(sessionUserId\) =>\s*setUserId\(\(cur\) => nextUserId\(cur, \{ type: "session-lookup", sessionUserId \}\)\)/);
  });

  it("a signed-in tab with no id looks it up (so AuthGate and the star hook never stay stuck)", () => {
    expect(src).toMatch(/if \(!needsUserIdLookup\(isAuthed, userId\)\)/);
    expect(src).toMatch(/const sessionUserId = await getSessionUserId\(\);/);
    expect(src).toMatch(/if \(lookupAttempt >= USER_ID_LOOKUP_RETRIES\) return;/);
  });

  it("the auth listener acts on authEventAction() and nothing else", () => {
    const listener = src.slice(src.indexOf("onAuthStateChange("), src.indexOf("data.subscription.unsubscribe()"));
    expect(listener).toMatch(/const action = authEventAction\(event, sessionUserId, userIdRef\.current\);\s*if \(action === "none"\) return;/);
    expect(listener).not.toMatch(/event ===/);
    expect(listener.match(/void hydrate\(\)/g)).toHaveLength(1);
  });

  it("getSessionState carries the session id when there is no profile row", () => {
    const auth = codeOnly(join(ROOT, "lib/auth.ts"));
    expect(auth).toMatch(/if \(!profile\) return \{ status: "signed-out", sessionUserId: verifiedId \};/);
  });
});
