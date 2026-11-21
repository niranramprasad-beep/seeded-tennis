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
  verifiedScreenFor,
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
 *   - the banner shows only to a signed-in unverified PARENT, never on auth
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
    expect(src).toMatch(/rememberMyPendingJoinCode\(joinCode\)/);
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
    expect(src).toMatch(/readMyPendingJoinCode\(\)/);
  });

  it("the onboarding diagnostic's parent save handles it too (it used to drop the code and route on)", () => {
    const src = read("components", "seeded", "onboarding", "diagnostic", "diagnostic-save.tsx");
    const parentSave = src.slice(src.indexOf("function ParentSave"));
    const branch = parentSave.indexOf('result.joinStatus === "verify_email_required"');
    expect(branch, "ParentSave must branch on verify_email_required").toBeGreaterThan(-1);
    // ...before the catch-all that starts the session and routes to /family.
    const routeOn = parentSave.indexOf('router.replace("/family")');
    expect(branch).toBeLessThan(routeOn);
    expect(parentSave).toMatch(/rememberMyPendingJoinCode\(joinCode\)/);
    expect(parentSave).toMatch(/setVerifyJoinCode\(joinCode\.trim\(\)\.toUpperCase\(\)\)/);
    expect(parentSave).toMatch(/<VerifyEmailToJoin[\s\S]{0,80}code=\{verifyJoinCode\}/);
    // The session starts only once the join step is done (beginSession
    // unmounts this form), and the step routes to /family.
    expect(parentSave).toMatch(/onJoined=\{\(\) => \{\s+if \(sessionPlayer\) beginSession\(sessionPlayer\);\s+router\.replace\("\/family"\);/);
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
    expect(src).toMatch(/if \(request\.reason === "rate_limited"\) return \{ ok: false, error: VERIFY_COPY\.linkLimit \}/);
    expect(VERIFY_COPY.linkLimit).toMatch(/3 links in the last hour/);
  });

  it("a refused verification write says 'too many tries', not 'not proven'", () => {
    expect(VERIFY_COPY.markRateLimited).toBe("Too many tries. Wait a few minutes and try again.");
    const src = read("components", "auth", "email-verified.tsx");
    // The mapping is the pure verifiedScreenFor() now (lib/email-verify-google.test.ts).
    expect(verifiedScreenFor("rate-limited", "link")).toBe("rate-limited");
    expect(verifiedScreenFor("rate-limited", "google")).toBe("rate-limited");
    expect(src).toMatch(/verifiedScreenFor\(await markEmailVerified\(\), action\.via\)/);
    expect(src).toMatch(/state === "rate-limited"\s+\? VERIFY_COPY\.markRateLimited/);
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
    role: "parent" as string | null | undefined,
    emailVerified: false as boolean | undefined,
    pathname: "/today",
    dismissed: false,
  };

  it("shows for a signed-in, unverified PARENT", () => {
    expect(shouldShowVerifyBanner(base)).toBe(true);
  });

  it("never shows to a player (043 never gates them), verified or not", () => {
    expect(shouldShowVerifyBanner({ ...base, role: "player" })).toBe(false);
    expect(shouldShowVerifyBanner({ ...base, role: undefined })).toBe(false);
  });

  it("says something true: no password-reset claim (Supabase sends resets regardless)", () => {
    expect(VERIFY_COPY.bannerText).not.toMatch(/reset|password/i);
    expect(VERIFY_COPY.bannerText).toMatch(/approve/i);
    expect(read("components", "shared", "verify-email-banner.tsx")).toMatch(/role: player\.role/);
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

  const ME = "00000000-0000-0000-0000-0000000b0401";
  const SOMEONE_ELSE = "00000000-0000-0000-0000-0000000b0102";

  it("keeps the family code, normalised, and forgets it on request", () => {
    rememberPendingJoinCode(" abcd-2345 ", ME);
    expect(readPendingJoinCode(ME)).toBe("ABCD-2345");
    clearPendingJoinCode();
    expect(readPendingJoinCode(ME)).toBeNull();
  });

  it("binds the code to the account that stored it (a shared browser never submits it for anyone else)", () => {
    rememberPendingJoinCode("ABCD-2345", ME);
    expect(readPendingJoinCode(SOMEONE_ELSE)).toBeNull();
    expect(readPendingJoinCode(null)).toBeNull();
    expect(readPendingJoinCode(ME)).toBe("ABCD-2345");
    // Nothing is stored without an owner.
    clearPendingJoinCode();
    rememberPendingJoinCode("ABCD-2345", null);
    expect(readPendingJoinCode(ME)).toBeNull();
    // The old, unbound shape (a bare code) reads as nothing.
    g.window!.localStorage.setItem("seeded.verify.joinCode", "ABCD-2345");
    expect(readPendingJoinCode(ME)).toBeNull();
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
    expect(readPendingJoinCode(ME)).toBeNull();
  });
});

describe("/auth/verified bounces back", () => {
  it("reads the stored return path and finishes a remembered join", () => {
    const src = read("components", "auth", "email-verified.tsx");
    expect(src).toMatch(/readVerifyReturn\(\)/);
    expect(src).toMatch(/router\.replace\(returnPath\)/);
    // Only this account's code, and cleared after one use whatever happens.
    expect(src).toMatch(/const pendingCode = await readMyPendingJoinCode\(\);\s+clearPendingJoinCode\(\);/);
    expect(src).not.toMatch(/\breadPendingJoinCode\(/);
    expect(src).toMatch(/retryConnection\(\)/);
  });
});
