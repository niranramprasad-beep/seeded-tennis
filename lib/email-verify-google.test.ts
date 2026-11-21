import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GOOGLE_VERIFY_TTL_MS,
  VERIFY_COPY,
  googleReturnOutcome,
  rememberGoogleVerifyStart,
  sendFailureMessage,
  takeGoogleVerifyStart,
} from "./email-verify-flow";
import { googleRedirectTo } from "./auth";
import { EMAIL_VERIFIED_PATH } from "./config/auth";

/* PR D (final-check, 2026-11-21): "Verify with Google instead".
 *
 * Production has not sent a magic-link email since 2026-10-22, so a parent
 * may never receive the 043 verification link. 043 already accepts a second
 * proof: a Google identity whose VERIFIED email equals the account's CURRENT
 * auth email (mark_email_verified() and email_is_verified() both read
 * auth.identities provider = 'google'). These pin the screens' half:
 *   - Google comes back to /auth/verified (the link's own landing page), so
 *     the existing mark_email_verified() path runs and the redirect
 *     allow-list needs nothing new;
 *   - a DIFFERENT account coming back is detected and signed out, with an
 *     honest sentence — never treated as verified;
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
const g = globalThis as unknown as { window?: { localStorage: Storage } };

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
    g.window = { localStorage: fakeStorage() };
  });
  afterEach(() => {
    delete g.window;
  });

  it("round-trips once, then is gone", () => {
    rememberGoogleVerifyStart("user-1", "parent@example.com", 1_000);
    expect(takeGoogleVerifyStart(2_000)).toEqual({ owner: "user-1", email: "parent@example.com" });
    expect(takeGoogleVerifyStart(2_000)).toBeNull();
  });

  it("expires after the TTL (a stale start never changes a later emailed link)", () => {
    rememberGoogleVerifyStart("user-1", "parent@example.com", 0);
    expect(takeGoogleVerifyStart(GOOGLE_VERIFY_TTL_MS + 1)).toBeNull();
  });

  it("stores nothing without an owner, and reads malformed values as nothing", () => {
    rememberGoogleVerifyStart(null, "parent@example.com", 0);
    expect(takeGoogleVerifyStart(0)).toBeNull();
    g.window!.localStorage.setItem("seeded.verify.google", "{not json");
    expect(takeGoogleVerifyStart(0)).toBeNull();
    g.window!.localStorage.setItem("seeded.verify.google", JSON.stringify({ owner: 5, at: 0 }));
    expect(takeGoogleVerifyStart(0)).toBeNull();
  });

  it("works (as nothing) with no storage at all", () => {
    delete g.window;
    expect(() => rememberGoogleVerifyStart("u", "e@example.com")).not.toThrow();
    expect(takeGoogleVerifyStart()).toBeNull();
  });
});

describe("what /auth/verified does on arrival", () => {
  const started = { owner: "user-1", email: "parent@example.com" };

  it("no marker: the emailed-link path, unchanged", () => {
    expect(
      googleReturnOutcome({ started: null, providerError: true, sessionUserId: "x", sessionEmail: null }).kind
    ).toBe("link");
  });

  it("Google error / cancel: nothing changed", () => {
    expect(
      googleReturnOutcome({ started, providerError: true, sessionUserId: "user-1", sessionEmail: null }).kind
    ).toBe("cancelled");
  });

  it("same account back (linked by its verified email): run mark_email_verified", () => {
    expect(
      googleReturnOutcome({
        started,
        providerError: false,
        sessionUserId: "user-1",
        sessionEmail: "parent@example.com",
      })
    ).toEqual({ kind: "same-account" });
  });

  it("a different account back: mismatch, naming both addresses", () => {
    expect(
      googleReturnOutcome({
        started,
        providerError: false,
        sessionUserId: "user-2",
        sessionEmail: "someone.else@example.com",
      })
    ).toEqual({
      kind: "different-account",
      accountEmail: "parent@example.com",
      googleEmail: "someone.else@example.com",
    });
  });
});

describe("copy", () => {
  it("a failed send points to the Google option when it is on screen", () => {
    const msg = sendFailureMessage("Too many tries. Wait a minute and try again.", true);
    expect(msg).toContain("Too many tries.");
    expect(msg).toContain(`“${VERIFY_COPY.google}”`);
    expect(sendFailureMessage(undefined, true)).toContain(VERIFY_COPY.google);
  });

  it("with the flag off it never mentions an option that is not there", () => {
    expect(sendFailureMessage("Nope.", false)).toBe("Nope.");
    expect(sendFailureMessage("", false)).not.toContain("Google");
  });

  it("the mismatch says why the database refuses, and never claims success", () => {
    const m = VERIFY_COPY.googleMismatch("parent@example.com", "other@example.com");
    expect(m).toContain("other@example.com");
    expect(m).toContain("parent@example.com");
    expect(m).toMatch(/same/);
    expect(m).toMatch(/nothing was confirmed/);
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

describe("the Google option cannot render with the flag off", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function renderWithFlag(value: string | undefined) {
    vi.resetModules();
    if (value === undefined) vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", "");
    else vi.stubEnv("NEXT_PUBLIC_GOOGLE_AUTH_ENABLED", value);
    // The .tsx is compiled with the classic JSX runtime under vitest.
    (globalThis as unknown as { React?: typeof React }).React = React;
    const mod = await import("../components/auth/auth-card");
    return renderToStaticMarkup(createElement(mod.GoogleVerifyButton, { hint: VERIFY_COPY.googleHint }));
  }

  it.each([undefined, "false", "1", "TRUE"])("flag %s -> nothing rendered", async (value) => {
    expect(await renderWithFlag(value)).toBe("");
  });

  it('flag "true" -> the button and the one-line hint', async () => {
    const html = await renderWithFlag("true");
    expect(html).toContain(VERIFY_COPY.google);
    expect(html).toContain("same email address");
  });

  it("the guard sits inside GoogleVerifyButton itself", () => {
    const card = read("components", "auth", "auth-card.tsx");
    const fn = card.slice(card.indexOf("export function GoogleVerifyButton"));
    const body = fn.slice(0, fn.indexOf("\n/**"));
    expect(body).toContain("if (!GOOGLE_AUTH_ENABLED) return null;");
    // Remembers who asked BEFORE leaving, and leaves for /auth/verified.
    expect(body.indexOf("rememberMyGoogleVerifyStart")).toBeGreaterThan(-1);
    expect(body.indexOf("rememberMyGoogleVerifyStart")).toBeLessThan(body.indexOf("signInWithGoogle("));
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
    // Both prompts (join, and approve/consent) carry it.
    expect(read("components", "auth", "verify-email-prompt.tsx").match(/<GoogleVerifyButton/g)?.length).toBe(2);
  });
});

describe("/auth/verified handles the Google return honestly", () => {
  const src = read("components", "auth", "email-verified.tsx");

  it("reads the start marker and signs a different account out", () => {
    expect(src).toContain("takeGoogleVerifyStart()");
    const at = src.indexOf('back.kind === "different-account"');
    expect(at).toBeGreaterThan(-1);
    const branch = src.slice(at, at + 600);
    expect(branch).toContain("signOut();");
    expect(branch).toContain('setState("google-mismatch")');
    // ...and only marks after the account check.
    expect(at).toBeLessThan(src.indexOf("await markEmailVerified()"));
  });

  it("still lets the database decide: verified only when mark_email_verified() says so", () => {
    expect(src).toMatch(/if \(marked !== "verified"\) return setState\(/);
  });
});
