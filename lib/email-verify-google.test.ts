import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GOOGLE_VERIFY_KEY,
  GOOGLE_VERIFY_TTL_MS,
  VERIFY_COPY,
  hasPendingJoinCodeFor,
  returnErrorFrom,
  readPendingJoinCode,
  rememberGoogleVerifyStart,
  rememberPendingJoinCode,
  sendFailureMessage,
  sessionCameFromOAuth,
  startGoogleVerify,
  takeGoogleVerifyStart,
  verifiedActionFor,
  verifiedScreenFor,
  verifiedSessionFrom,
} from "./email-verify-flow";
import { SEEDED_STORAGE_PREFIX, clearSeededBrowserStorage } from "./local-storage-cleanup";
import { markErrorKind } from "./db/email-verification";
import { googleRedirectTo } from "./auth";
import { EMAIL_VERIFIED_PATH } from "./config/auth";

/* PR D (final-check, 2026-11-21): "Verify with Google instead".
 *
 * Production has not sent a magic-link email since 2026-10-22, so a parent
 * may never receive the 043 verification link. 043 already accepts a second
 * proof: a Google identity whose VERIFIED email equals the account's CURRENT
 * auth email (mark_email_verified() and email_is_verified() both read
 * auth.identities provider = 'google'). These pin the screens' half, as
 * behaviour (pure functions), not as source substrings:
 *   - Google comes back to /auth/verified (the link's own landing page), so
 *     the existing mark_email_verified() path runs;
 *   - a DIFFERENT account coming back is signed out LOCALLY and never marked;
 *   - a stale marker never hijacks an emailed-link visit;
 *   - a network blip is "unreachable", never "not confirmed";
 *   - a failed "Send the link" points to the Google option;
 *   - the option cannot render with NEXT_PUBLIC_GOOGLE_AUTH_ENABLED off.
 * Who must verify is unchanged (approvalNeedsVerification, untouched). */

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
const g = globalThis as unknown as { window?: { localStorage: Storage; sessionStorage?: Storage } };

/** A JWT-shaped string with the given payload (signature irrelevant here). */
function jwt(payload: unknown): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("the return path", () => {
  it("verify-email comes back to /auth/verified with no query string", () => {
    expect(googleRedirectTo("https://seededtennis.com", "/family", "verify-email")).toBe(
      "https://seededtennis.com/auth/verified"
    );
    expect(EMAIL_VERIFIED_PATH).toBe("/auth/verified");
  });

  it("sign-in is unchanged: /auth/callback, ?next= only when safe", () => {
    expect(googleRedirectTo("https://x.test", "/schools", "sign-in")).toBe(
      "https://x.test/auth/callback?next=%2Fschools"
    );
    expect(googleRedirectTo("https://x.test", "//evil.com", "sign-in")).toBe("https://x.test/auth/callback");
    expect(googleRedirectTo("https://x.test", undefined, "sign-in")).toBe("https://x.test/auth/callback");
  });
});

describe("who started (localStorage marker)", () => {
  beforeEach(() => {
    g.window = { localStorage: fakeStorage(), sessionStorage: fakeStorage() };
  });
  afterEach(() => {
    delete g.window;
  });

  it("lives under the seeded. prefix, so every sign-out clears it", () => {
    expect(GOOGLE_VERIFY_KEY.startsWith(SEEDED_STORAGE_PREFIX)).toBe(true);
    rememberGoogleVerifyStart("user-1", "parent@example.com", Date.now());
    clearSeededBrowserStorage();
    expect(takeGoogleVerifyStart()).toBeNull();
  });

  it("round-trips once, then is gone", () => {
    rememberGoogleVerifyStart("user-1", "parent@example.com", 1_000);
    expect(takeGoogleVerifyStart(2_000)).toEqual({ owner: "user-1", email: "parent@example.com" });
    expect(takeGoogleVerifyStart(2_000)).toBeNull();
  });

  it("expires after the TTL (a stale start never changes a later emailed link)", () => {
    rememberGoogleVerifyStart("user-1", "parent@example.com", 0);
    expect(takeGoogleVerifyStart(GOOGLE_VERIFY_TTL_MS + 1)).toBeNull();
    rememberGoogleVerifyStart("user-1", "parent@example.com", 0);
    expect(takeGoogleVerifyStart(GOOGLE_VERIFY_TTL_MS)).not.toBeNull();
  });

  it("refuses a start stamped in the future (clock games), beyond a minute of skew", () => {
    rememberGoogleVerifyStart("user-1", "parent@example.com", 10 * 60_000);
    expect(takeGoogleVerifyStart(0)).toBeNull();
    rememberGoogleVerifyStart("user-1", "parent@example.com", 30_000);
    expect(takeGoogleVerifyStart(0)).not.toBeNull();
  });

  it("stores nothing without an owner, and reads malformed values as nothing", () => {
    rememberGoogleVerifyStart(null, "parent@example.com", 0);
    expect(takeGoogleVerifyStart(0)).toBeNull();
    g.window!.localStorage.setItem(GOOGLE_VERIFY_KEY, "{not json");
    expect(takeGoogleVerifyStart(0)).toBeNull();
    g.window!.localStorage.setItem(GOOGLE_VERIFY_KEY, JSON.stringify({ owner: 5, at: 0 }));
    expect(takeGoogleVerifyStart(0)).toBeNull();
  });

  it("works (as nothing) with no storage at all", () => {
    delete g.window;
    expect(() => rememberGoogleVerifyStart("u", "e@example.com")).not.toThrow();
    expect(takeGoogleVerifyStart()).toBeNull();
  });
});

describe("starting Google (order and clean-up)", () => {
  function harness(opts: { signedIn?: boolean; signIn?: () => Promise<{ ok: boolean; error?: string }> }) {
    const calls: string[] = [];
    let marker = false;
    const deps = {
      beforeStart: () => void calls.push("before"),
      rememberStart: async () => {
        calls.push("remember");
        if (opts.signedIn === false) return false;
        marker = true;
        return true;
      },
      signIn: async () => {
        calls.push("signIn");
        return opts.signIn ? opts.signIn() : { ok: true };
      },
      clearStart: () => {
        calls.push("clear");
        marker = false;
      },
    };
    return { deps, calls, marker: () => marker };
  }

  it("prepares, remembers who asked, then leaves — and keeps the marker", async () => {
    const h = harness({});
    expect(await startGoogleVerify(h.deps)).toBeNull();
    expect(h.calls).toEqual(["before", "remember", "signIn"]);
    expect(h.marker()).toBe(true);
  });

  it("clears the marker when Google could not be started", async () => {
    const h = harness({ signIn: async () => ({ ok: false, error: "Google is not set up." }) });
    expect(await startGoogleVerify(h.deps)).toBe("Google is not set up.");
    expect(h.calls).toEqual(["before", "remember", "signIn", "clear"]);
    expect(h.marker()).toBe(false);
  });

  it("clears the marker when starting Google throws", async () => {
    const h = harness({
      signIn: async () => {
        throw new Error("boom");
      },
    });
    expect(await startGoogleVerify(h.deps)).toMatch(/Couldn’t start Google/);
    expect(h.marker()).toBe(false);
  });

  it("never leaves for Google when nobody is signed in", async () => {
    const h = harness({ signedIn: false });
    expect(await startGoogleVerify(h.deps)).toBe("Sign in first, then try again.");
    expect(h.calls).not.toContain("signIn");
  });
});

describe("reading the return URL", () => {
  it("finds Google's error in the query or the fragment", () => {
    expect(returnErrorFrom("?error=access_denied", "")).toBe("oauth");
    expect(returnErrorFrom("", "#error=server_error&error_description=x")).toBe("oauth");
    expect(returnErrorFrom("error_description=nope", "")).toBe("oauth");
    expect(returnErrorFrom("?code=abc", "")).toBe("none");
    expect(returnErrorFrom("?code=abc&error=access_denied", "")).toBe("none");
    expect(returnErrorFrom("", "")).toBe("none");
  });

  it("tells an expired EMAILED link's error from Google's", () => {
    // Supabase's shape for a used/expired magic link.
    expect(
      returnErrorFrom(
        "",
        "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
      )
    ).toBe("link");
    expect(returnErrorFrom("?error=access_denied&error_code=otp_expired", "")).toBe("link");
  });

  it("maps a supabase-js session to the decision's input — oauth from the ACCESS TOKEN only", () => {
    const user = { id: "user-1", email: "parent@example.com" };
    expect(
      verifiedSessionFrom({ access_token: jwt({ amr: [{ method: "oauth", timestamp: 1 }] }), user })
    ).toEqual({ userId: "user-1", email: "parent@example.com", oauth: true });
    expect(
      verifiedSessionFrom({ access_token: jwt({ amr: [{ method: "otp", timestamp: 1 }] }), user })
    ).toEqual({ userId: "user-1", email: "parent@example.com", oauth: false });
    // A Google-linked account opening an emailed link: app_metadata says
    // google, the token says otp. The token wins.
    const linked = {
      access_token: jwt({ amr: [{ method: "magiclink", timestamp: 1 }] }),
      user: { ...user, app_metadata: { provider: "google", providers: ["email", "google"] } },
    };
    expect(verifiedSessionFrom(linked)?.oauth).toBe(false);
    expect(verifiedSessionFrom(null)).toBeNull();
    expect(verifiedSessionFrom({ access_token: "x", user: null })).toBeNull();
  });

  it("knows an OAuth session from its token's amr", () => {
    expect(sessionCameFromOAuth(jwt({ amr: [{ method: "oauth", timestamp: 1 }] }))).toBe(true);
    expect(sessionCameFromOAuth(jwt({ amr: [{ method: "password", timestamp: 1 }] }))).toBe(false);
    expect(sessionCameFromOAuth(jwt({ amr: [{ method: "otp", timestamp: 1 }] }))).toBe(false);
    expect(sessionCameFromOAuth(jwt({}))).toBe(false);
    expect(sessionCameFromOAuth("not-a-jwt")).toBe(false);
    expect(sessionCameFromOAuth(null)).toBe(false);
  });
});

describe("what /auth/verified does once it knows the session", () => {
  const started = { owner: "user-1", email: "parent@example.com" };
  const oauthSame = { userId: "user-1", email: "parent@example.com", oauth: true };
  const oauthOther = { userId: "user-2", email: "someone.else@example.com", oauth: true };

  it("no marker: the emailed link, unchanged", () => {
    expect(verifiedActionFor({ started: null, returnError: "none", session: oauthSame })).toEqual({
      kind: "mark",
      via: "link",
    });
    // An OAuth-shaped error without a marker: no Google verify was started
    // here, so the generic link copy.
    expect(verifiedActionFor({ started: null, returnError: "oauth", session: oauthSame })).toEqual({
      kind: "show",
      screen: "no-session",
    });
  });

  it("an expired emailed link with a leftover Google marker gets the LINK copy", () => {
    expect(verifiedActionFor({ started, returnError: "link", session: oauthSame })).toEqual({
      kind: "show",
      screen: "no-session",
    });
  });

  it("Google error / cancel: show it, never touch the session", () => {
    expect(verifiedActionFor({ started, returnError: "oauth", session: null })).toEqual({
      kind: "show",
      screen: "google-cancelled",
    });
    expect(verifiedActionFor({ started, returnError: "oauth", session: oauthOther })).toEqual({
      kind: "show",
      screen: "google-cancelled",
    });
  });

  it("no session: no-session, whichever path", () => {
    expect(verifiedActionFor({ started, returnError: "none", session: null })).toEqual({
      kind: "show",
      screen: "no-session",
    });
    expect(verifiedActionFor({ started: null, returnError: "none", session: null }).kind).toBe("show");
  });

  it("same account back over OAuth: mark via google", () => {
    expect(verifiedActionFor({ started, returnError: "none", session: oauthSame })).toEqual({
      kind: "mark",
      via: "google",
    });
  });

  it("a different account back over OAuth: sign out LOCALLY, naming both addresses — never mark", () => {
    expect(verifiedActionFor({ started, returnError: "none", session: oauthOther })).toEqual({
      kind: "sign-out-local",
      accountEmail: "parent@example.com",
      googleEmail: "someone.else@example.com",
    });
  });

  it("a stale marker on a shared device never signs out someone who opened an emailed link", () => {
    const linkSessionOther = { userId: "user-2", email: "other@example.com", oauth: false };
    expect(verifiedActionFor({ started, returnError: "none", session: linkSessionOther })).toEqual({
      kind: "mark",
      via: "link",
    });
  });

  it("maps the database's answer to a screen; a blip is never 'not confirmed'", () => {
    expect(verifiedScreenFor("verified", "google")).toBe("confirmed");
    expect(verifiedScreenFor("verified", "link")).toBe("confirmed");
    expect(verifiedScreenFor("rate-limited", "google")).toBe("rate-limited");
    expect(verifiedScreenFor("unreachable", "google")).toBe("unreachable");
    expect(verifiedScreenFor("unreachable", "link")).toBe("unreachable");
    expect(verifiedScreenFor("not-proven", "google")).toBe("google-not-proven");
    expect(verifiedScreenFor("not-proven", "link")).toBe("not-proven");
  });

  it("classifies mark_email_verified() errors: database no, rate limit, or no answer", () => {
    expect(markErrorKind({ code: "53400", message: "email_verify_rate_limited" })).toBe("rate-limited");
    expect(markErrorKind({ code: "", message: "email_verify_rate_limited" })).toBe("rate-limited");
    expect(markErrorKind({ code: "28000", message: "Sign in first." })).toBe("not-proven");
    expect(markErrorKind({ code: "42501", message: "permission denied" })).toBe("not-proven");
    expect(markErrorKind({ code: "PGRST202", message: "not found" })).toBe("not-proven");
    expect(markErrorKind({ code: "", message: "TypeError: Failed to fetch" })).toBe("unreachable");
    expect(markErrorKind(new TypeError("fetch failed"))).toBe("unreachable");
    expect(markErrorKind(null)).toBe("unreachable");
  });
});

describe("copy", () => {
  it("a failed send points to the Google option when it is on screen", () => {
    const msg = sendFailureMessage("Too many tries. Wait a minute and try again.", true);
    expect(msg).toContain("Too many tries.");
    expect(msg).toContain(`“${VERIFY_COPY.google}”`);
    expect(msg).toContain("sends no email");
    expect(sendFailureMessage(undefined, true)).toContain(VERIFY_COPY.google);
  });

  it("with the flag off it never mentions an option that is not there", () => {
    expect(sendFailureMessage("Nope.", false)).toBe("Nope.");
    expect(sendFailureMessage("", false)).not.toContain("Google");
  });

  it("the mismatch says why the database refuses, what may have been created, and who was signed out", () => {
    const m = VERIFY_COPY.googleMismatch("parent@example.com", "other@example.com");
    expect(m).toContain("other@example.com");
    expect(m).toContain("parent@example.com");
    expect(m).toMatch(/same/);
    expect(m).toMatch(/nothing was confirmed/);
    expect(m).toMatch(/may have created a sign-in/);
    expect(m).toContain("We signed you out of Seeded on this browser");
    expect(m).not.toMatch(/signed that Google account out/);
    expect(m).not.toContain("family code");
    expect(VERIFY_COPY.googleMismatch(null, null, true)).toContain("You’ll need the family code again.");
    expect(VERIFY_COPY.googleMismatch(null, null)).toContain("different email address");
  });

  it("the hint says it needs the same address", () => {
    expect(VERIFY_COPY.googleHint).toMatch(/same email address/);
  });

  it("no copy promises when an email arrives", () => {
    const strings = Object.values(VERIFY_COPY)
      .map((v) => (typeof v === "function" ? (v as (...a: string[]) => string)("a@example.com", "b@example.com") : v))
      .join(" ");
    expect(strings).not.toMatch(/\b(seconds?|instantly|shortly|right away|within \d+)\b/i);
  });
});

describe("a pending join code is lost by the mismatch sign-out — and the screen can tell", () => {
  beforeEach(() => {
    g.window = { localStorage: fakeStorage(), sessionStorage: fakeStorage() };
  });
  afterEach(() => {
    delete g.window;
  });

  it("is readable for the asking account before sign-out, gone after", () => {
    rememberPendingJoinCode("FAMILY-1", "user-1");
    expect(hasPendingJoinCodeFor("user-1")).toBe(true);
    expect(hasPendingJoinCodeFor("user-2")).toBe(false);
    expect(hasPendingJoinCodeFor(undefined)).toBe(false);
    clearSeededBrowserStorage();
    expect(readPendingJoinCode("user-1")).toBeNull();
    expect(hasPendingJoinCodeFor("user-1")).toBe(false);
  });

  it("/auth/verified asks before signing out, so the copy can say so", () => {
    const src = read("components", "auth", "email-verified.tsx");
    const at = src.indexOf("hasPendingJoinCodeFor(started?.owner)");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(src.indexOf("await signOutLocal()"));
  });
});

describe("the Google option cannot render with the flag off", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function renderWithFlag(value: string | undefined) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", value ?? "");
    // The .tsx is compiled with the classic JSX runtime under vitest.
    (globalThis as unknown as { React?: typeof React }).React = React;
    const mod = await import("../components/auth/auth-card");
    return renderToStaticMarkup(createElement(mod.GoogleVerifyButton, { hint: VERIFY_COPY.googleHint }));
  }

  it.each([undefined, "false", "1", "TRUE"])("flag %s -> nothing rendered", async (value) => {
    expect(await renderWithFlag(value)).toBe("");
  });

  it('flag "true" -> the button, the hint, and the button described by the hint', async () => {
    const html = await renderWithFlag("true");
    expect(html).toContain(VERIFY_COPY.google);
    expect(html).toContain("same email address");
    const described = html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(described, "the button must point at its hint").toBeTruthy();
    expect(html).toContain(`id="${described}"`);
  });

  it("the guard sits inside GoogleVerifyButton, which starts Google through startGoogleVerify", () => {
    const card = read("components", "auth", "auth-card.tsx");
    const fn = card.slice(card.indexOf("export function GoogleVerifyButton"));
    const body = fn.slice(0, fn.indexOf("\n/**"));
    expect(body).toContain("if (!GOOGLE_AUTH_ENABLED) return null;");
    expect(body).toContain("startGoogleVerify(");
    expect(body).toContain('purpose: "verify-email"');
  });

  it("every verify prompt offers Google only through the guarded button", () => {
    for (const file of [
      ["components", "auth", "verify-email-prompt.tsx"],
      ["components", "shared", "verify-email-banner.tsx"],
    ]) {
      const src = read(...file);
      expect(src, file.join("/")).toContain("<GoogleVerifyButton");
      expect(src, file.join("/")).not.toContain("signInWithOAuth");
      expect(src, file.join("/")).not.toContain("signInWithGoogle");
      expect(src, file.join("/")).toContain("sendFailureMessage(result.error, GOOGLE_AUTH_ENABLED)");
    }
    expect(read("components", "auth", "verify-email-prompt.tsx").match(/<GoogleVerifyButton/g)?.length).toBe(2);
  });
});

describe("/auth/verified wires the pure decisions (and only signs out locally)", () => {
  const src = read("components", "auth", "email-verified.tsx");

  it("uses verifiedActionFor / verifiedScreenFor and the local sign-out", () => {
    expect(src).toContain("verifiedActionFor({ started, returnError, session })");
    expect(src).toContain("const session = verifiedSessionFrom(data.session);");
    expect(src).toContain("verifiedScreenFor(await markEmailVerified(), action.via)");
    expect(src).toContain("await signOutLocal()");
    // Never the global sign-out on this page.
    expect(src).not.toMatch(/\bsignOut\(\)/);
    expect(src).toContain("returnErrorFrom(window.location.search, window.location.hash)");
    // Still signed in: "Try again" signs out LOCALLY again, never the menu.
    const retry = src.slice(src.indexOf("const retryLocalSignOut"), src.indexOf("const goBack"));
    expect(retry).toContain("await signOutLocal();");
    expect(src).toMatch(/onClick=\{retryLocalSignOut\}/);
    expect(VERIFY_COPY.googleMismatchStillSignedIn).not.toMatch(/menu|Sign out/);
  });

  it("the sign-out-local branch returns before anything is marked", () => {
    const branch = src.indexOf('action.kind === "sign-out-local"');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(src.indexOf("await markEmailVerified()"));
    const body = src.slice(branch, src.indexOf("const screen = verifiedScreenFor"));
    // Comments stripped: a commented-out sign-out must not count.
    const code = body
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).toMatch(/await signOutLocal\(\);\s*let after = await supabase\.auth\.getSession\(\);/);
    expect(code.indexOf("await signOutLocal()")).toBeLessThan(code.indexOf("return setState("));
    // The screen claims "signed out" only when no session is left.
    expect(code).toMatch(/after\.data\.session \? "google-mismatch-still-signed-in" : "google-mismatch"/);
  });

  it("PlayerProvider runs the shared sign-out sequence, local for signOutLocal", () => {
    const ctx = read("lib", "context", "player-context.tsx");
    expect(ctx).toContain('const signOutLocal = useCallback(() => runSignOut(signOutEffects, "local"), [signOutEffects]);');
    expect(ctx).toContain('void runSignOut(signOutEffects, "global");');
    expect(ctx).toContain('signOutOfSupabase(scope === "local" ? { scope: "local" } : undefined)');
    expect(ctx).toContain("bumpHydrateGeneration: () => void ++hydrateGeneration.current");
    expect(ctx).toContain("clearBrowserStorage: () => void clearSeededBrowserStorage()");
    const auth = read("lib", "auth.ts");
    expect(auth).toContain("supa.auth.signOut(opts?.scope ? { scope: opts.scope } : undefined)");
  });
});
