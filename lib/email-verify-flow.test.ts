import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_VERIFY_RETURN,
  VERIFY_COPY,
  approvalNeedsVerification,
  clearPendingJoinCode,
  dismissVerifyBanner,
  isVerifyBannerDismissed,
  joinOutcomeFor,
  readPendingJoinCode,
  readVerifyReturn,
  rememberPendingJoinCode,
  rememberVerifyReturn,
  safeVerifyReturn,
  shouldShowVerifyBanner,
} from "./email-verify-flow";
import { VERIFY_EMAIL_REQUIRED_MESSAGE } from "./email-verify-required";
import type { JoinFamilyStatus } from "./db/family-join";

/* B6 (migration 043). The database refuses an unverified PARENT's join,
 * approval and consent with 42501 verify_email_required; players are never
 * refused. These pin what the screens do about it:
 *   - the join step treats the refusal as a STEP (kind "verify"), never as a
 *     failed sign-up, and keeps the code;
 *   - the approval card asks a parent to verify BEFORE the click, and turns
 *     a 42501 into the same prompt rather than an error;
 *   - the banner shows for any signed-in unverified account, never on auth
 *     pages or onboarding, and stays dismissed;
 *   - /auth/verified bounces back only to a same-origin, non-auth path. */

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

// A minimal localStorage, installed as `window` for the storage helpers.
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

describe("the join step: verify_email_required is a step, not a failure", () => {
  it("maps 043's refusal to 'verify' with the one sentence", () => {
    expect(joinOutcomeFor({ status: "verify_email_required" })).toEqual({
      kind: "verify",
      message: VERIFY_EMAIL_REQUIRED_MESSAGE,
    });
    expect(VERIFY_EMAIL_REQUIRED_MESSAGE).toBe("Confirm your email first. We'll send you a link.");
  });

  it.each<[JoinFamilyStatus, string]>([
    ["pending", "joined"],
    ["approved", "joined"],
    ["verify_email_required", "verify"],
    ["invalid", "error"],
    ["own_family", "error"],
    ["rate_limited", "error"],
    ["error", "error"],
  ])("%s -> %s", (status, kind) => {
    expect(joinOutcomeFor({ status }).kind).toBe(kind);
  });

  it("the sign-up flow shows the verify step instead of routing on (and keeps the code)", () => {
    const src = read("components", "auth", "signup-flow.tsx");
    const at = src.indexOf('result.joinStatus === "verify_email_required"');
    expect(at, "signup-flow must branch on verify_email_required").toBeGreaterThan(-1);
    // ...before it routes a parent to /family.
    expect(at).toBeLessThan(src.indexOf('router.replace("/family")'));
    expect(src).toMatch(/rememberPendingJoinCode\(joinCode\)/);
    expect(src).toMatch(/<VerifyEmailToJoin[\s\S]{0,80}code=\{verifyJoinCode\}/);
    // and signUp() passes the join status through (it used to drop it).
    expect(read("lib", "auth.ts")).toMatch(/return \{ ok: true, familyCode, joinStatus: profileResult\.joinStatus \}/);
  });

  it("Google completion handles it the same way", () => {
    const src = read("components", "auth", "complete-oauth-signup.tsx");
    expect(src).toMatch(/result\.joinStatus === "verify_email_required"/);
    expect(src).toMatch(/<VerifyEmailToJoin/);
  });

  it("/family's code forms keep the code and show the verify step", () => {
    const src = read("components", "seeded", "family", "family-pending-screen.tsx");
    expect(src.match(/outcome\.kind === "verify"/g)?.length).toBe(2);
    expect(src).toMatch(/readPendingJoinCode\(\)/);
  });

  it("the verify step offers Send the link, then the retry, with the planned copy", () => {
    expect(VERIFY_COPY.joinTitle("your family")).toBe("Confirm your email to join your family");
    expect(VERIFY_COPY.send).toBe("Send the link");
    expect(VERIFY_COPY.retryJoin).toBe("I’ve confirmed — try again");
    expect(VERIFY_COPY.sent("a@b.co")).toBe("We sent a link to a@b.co. Open it in this browser, then come back.");
    const src = read("components", "auth", "verify-email-prompt.tsx");
    expect(src).toMatch(/joinOutcomeFor\(await joinFamily\(code\)\)/);
    expect(src).toMatch(/rememberVerifyReturn\(/);
  });

  it("the link limit has its own sentence (3 an hour, not 'wait a minute')", () => {
    const src = read("lib", "db", "email-verification.ts");
    expect(src).toMatch(/if \(!allowed\) return \{ ok: false, error: VERIFY_COPY\.linkLimit \}/);
    expect(VERIFY_COPY.linkLimit).toMatch(/3 links in the last hour/);
  });
});

describe("the approval card's verify gate", () => {
  it("asks a parent who is not known to be verified; never a player", () => {
    expect(approvalNeedsVerification({ role: "parent", emailVerified: false })).toBe(true);
    expect(approvalNeedsVerification({ role: "parent", emailVerified: undefined })).toBe(true);
    expect(approvalNeedsVerification({ role: "parent", emailVerified: true })).toBe(false);
    expect(approvalNeedsVerification({ role: "player", emailVerified: false })).toBe(false);
    expect(approvalNeedsVerification({ role: "player", emailVerified: undefined })).toBe(false);
  });

  it("JoinRequestsCard hides Approve / consent behind the gate and turns a 42501 into the prompt", () => {
    const src = read("components", "seeded", "family", "join-requests-card.tsx");
    expect(src).toMatch(/approvalNeedsVerification\(player\)/);
    expect(src).toMatch(/\{verifyFirst && <VerifyEmailToApprove \/>\}/);
    expect(src).toMatch(/message === VERIFY_EMAIL_REQUIRED_MESSAGE\) setRefusedForEmail\(true\)/);
    // Approve and the consent button are both behind verifyFirst...
    expect(src).toMatch(/\{verifyFirst \? null : \(\s*<SeededButton[\s\S]{0,200}approveFamilyJoin/);
    expect(src).toMatch(/\{verifyFirst \? \([\s\S]{0,300}\) : \([\s\S]{0,300}grantParentConsent/);
    // ...and the gate only ever applies to a parent viewer.
    expect(src).toMatch(/const verifyFirst = viewerIsParent && /);
    // Deny is never gated.
    expect(src).not.toMatch(/verifyFirst[^\n]{0,80}denyFamilyJoin/);
  });

  it("the gate re-checks and flips Player.emailVerified after a link opened elsewhere", () => {
    const src = read("components", "auth", "verify-email-prompt.tsx");
    expect(src).toMatch(/await checkEmailVerified\(\)/);
    expect(src).toMatch(/setPlayerLocal\(\{ emailVerified: true \}\)/);
  });
});

describe("the banner's visibility rules", () => {
  const base = {
    hydrated: true,
    isAuthed: true,
    emailVerified: false as boolean | undefined,
    pathname: "/today",
    dismissed: false,
  };

  it("shows for a signed-in, unverified account (players included)", () => {
    expect(shouldShowVerifyBanner(base)).toBe(true);
  });

  it.each([
    ["not hydrated", { hydrated: false }],
    ["signed out", { isAuthed: false }],
    ["verified", { emailVerified: true }],
    ["unknown", { emailVerified: undefined }],
    ["dismissed", { dismissed: true }],
  ])("hidden when %s", (_label, patch) => {
    expect(shouldShowVerifyBanner({ ...base, ...patch })).toBe(false);
  });

  it.each(["/login", "/signup", "/parent-signup", "/parent-login", "/auth/verified", "/auth/callback", "/auth/complete", "/reset-password", "/onboarding", "/onboarding/step"])(
    "never on %s",
    (pathname) => {
      expect(shouldShowVerifyBanner({ ...base, pathname })).toBe(false);
    }
  );

  it.each(["/today", "/family", "/schools", "/settings", "/authors"])("shows on %s", (pathname) => {
    expect(shouldShowVerifyBanner({ ...base, pathname })).toBe(true);
  });

  it("is fixed-position, drawn after mount, and mounted for signed-in app pages only", () => {
    const src = read("components", "shared", "verify-email-banner.tsx");
    expect(src).toMatch(/className="fixed /);
    expect(src).toMatch(/setMounted\(true\)/);
    expect(src).toMatch(/mounted &&\s*shouldShowVerifyBanner\(/);
    expect(read("components", "layout", "app-shell.tsx")).toMatch(/\{showApp && <VerifyEmailBanner \/>\}/);
  });
});

describe("remembered state (localStorage, try/catch)", () => {
  beforeEach(() => {
    g.window = { localStorage: fakeStorage() };
  });
  afterEach(() => {
    delete g.window;
  });

  it("remembers a dismissal", () => {
    expect(isVerifyBannerDismissed()).toBe(false);
    dismissVerifyBanner();
    expect(isVerifyBannerDismissed()).toBe(true);
  });

  it("remembers the return path, refusing anything off-site or under /auth", () => {
    expect(readVerifyReturn()).toBe(DEFAULT_VERIFY_RETURN);
    rememberVerifyReturn("/family");
    expect(readVerifyReturn()).toBe("/family");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "/auth/verified", "/auth", "javascript:alert(1)"]) {
      rememberVerifyReturn(bad);
      expect(readVerifyReturn(), bad).toBe("/family");
      expect(safeVerifyReturn(bad), bad).toBeNull();
    }
  });

  it("keeps the family code, normalised, and forgets it on request", () => {
    rememberPendingJoinCode(" abcd-2345 ");
    expect(readPendingJoinCode()).toBe("ABCD-2345");
    clearPendingJoinCode();
    expect(readPendingJoinCode()).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    g.window = {
      get localStorage(): Storage {
        throw new Error("SecurityError");
      },
    } as unknown as { localStorage: Storage };
    expect(() => dismissVerifyBanner()).not.toThrow();
    expect(isVerifyBannerDismissed()).toBe(false);
    expect(readVerifyReturn()).toBe(DEFAULT_VERIFY_RETURN);
    expect(readPendingJoinCode()).toBeNull();
  });
});

describe("/auth/verified bounces back", () => {
  it("reads the stored return path and finishes a remembered join", () => {
    const src = read("components", "auth", "email-verified.tsx");
    expect(src).toMatch(/readVerifyReturn\(\)/);
    expect(src).toMatch(/router\.replace\(returnPath\)/);
    expect(src).toMatch(/readPendingJoinCode\(\)/);
    expect(src).toMatch(/retryConnection\(\)/);
  });
});
