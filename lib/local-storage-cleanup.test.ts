import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { codeOnly } from "./testing/source-text";
import {
  PRESERVED_ON_SIGN_OUT,
  clearSeededBrowserStorage,
  clearSeededLocalStorage,
  clearSeededSessionStorage,
} from "./local-storage-cleanup";

// Audit A-033: sign-out and account deletion clear what this browser
// remembered about the account, keeping only the theme and the
// internal-analytics flag.

const ROOT = join(__dirname, "..");

function fakeStorage(init: Record<string, string>) {
  const data = new Map(Object.entries(init));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("clearSeededLocalStorage", () => {
  it("removes every seeded.* key except the browser preferences and the internal flag", () => {
    const s = fakeStorage({
      "seeded.mode": "dark",
      "seeded.mode.system": "0",
      "seeded.design": "seeded",
      "seeded.internal": "1",
      "seeded.role": "player",
      "seeded.schools.shape": "fit",
      "seeded.schools.filters": "{}",
      "seeded.outreach": "{\"draft\":\"Dear coach\"}",
      "seeded.verify.joinCode": "ABC123",
      "seeded.verify.return": "/family",
      "seeded.browseGender": "women",
      "seeded.demo-tier": "family",
      "seeded.sidebar.collapsed": "1",
      "seeded.theme": "night",
      "sb-abc-auth-token": "session",
      "unrelated": "x",
      "seededfoo": "not our prefix",
    });
    const removed = clearSeededLocalStorage(s);
    expect(removed.sort()).toEqual(
      [
        "seeded.role",
        "seeded.schools.shape",
        "seeded.schools.filters",
        "seeded.outreach",
        "seeded.verify.joinCode",
        "seeded.verify.return",
        "seeded.browseGender",
        "seeded.demo-tier",
        "seeded.theme",
      ].sort()
    );
    expect(Array.from(s.data.keys()).sort()).toEqual(
      ["seeded.mode", "seeded.mode.system", "seeded.design", "seeded.internal", "seeded.sidebar.collapsed", "sb-abc-auth-token", "unrelated", "seededfoo"].sort()
    );
  });

  it("preserves exactly the theme keys, the sidebar preference and the internal flag", () => {
    expect([...PRESERVED_ON_SIGN_OUT].sort()).toEqual(
      ["seeded.design", "seeded.internal", "seeded.mode", "seeded.mode.system", "seeded.sidebar.collapsed"].sort()
    );
  });

  it("never throws on missing or hostile storage", () => {
    expect(clearSeededLocalStorage(null)).toEqual([]);
    const hostile = {
      get length(): number {
        throw new Error("SecurityError");
      },
      key: () => null,
      removeItem: () => {},
    };
    expect(clearSeededLocalStorage(hostile)).toEqual([]);
    const stuck = fakeStorage({ "seeded.role": "player", "seeded.outreach": "x" });
    const orig = stuck.removeItem;
    stuck.removeItem = (k: string) => {
      if (k === "seeded.role") throw new Error("nope");
      orig(k);
    };
    expect(clearSeededLocalStorage(stuck)).toEqual(["seeded.outreach"]);
  });
});

describe("sessionStorage too (A-033 follow-up)", () => {
  it("clears every seeded.* key in sessionStorage, including the onboarding answers", () => {
    const s = fakeStorage({
      "seeded.onboarding.pending": "{\"utr\":9.5}",
      "seeded.anything": "x",
      "other": "kept",
    });
    expect(clearSeededSessionStorage(s).sort()).toEqual(["seeded.anything", "seeded.onboarding.pending"]);
    expect(Array.from(s.data.keys())).toEqual(["other"]);
  });

  it("clearSeededBrowserStorage covers both storages and is safe with no window", () => {
    expect(clearSeededBrowserStorage()).toEqual([]); // node: no window
    const src = codeOnly(join(ROOT, "lib/local-storage-cleanup.ts"));
    expect(src).toMatch(/return \[\.\.\.clearSeededLocalStorage\(\), \.\.\.clearSeededSessionStorage\(\)\];/);
    expect(src).toMatch(/browserStorage\("sessionStorage"\)/);
  });

  it("a sign-out in another tab clears this tab too", () => {
    const src = codeOnly(join(ROOT, "lib/context/player-context.tsx"));
    const listener = src.slice(src.indexOf("onAuthStateChange("), src.indexOf("data.subscription.unsubscribe()"));
    // The decision is authEventAction() (lib/session-identity.test.ts); the
    // listener must stop on "none" and clear storage only on signOutLocal.
    expect(listener).toMatch(/const action = authEventAction\(event, sessionUserId, userIdRef\.current\);\s*if \(action === "none"\) return;/);
    const signedOut = listener.slice(listener.indexOf('if (action === "signOutLocal") {'), listener.indexOf("return;", listener.indexOf('if (action === "signOutLocal") {')));
    expect(signedOut).toMatch(/clearSeededBrowserStorage\(\)/);
    expect(listener.match(/clearSeededBrowserStorage\(\)/g)).toHaveLength(1);
    expect(listener).toMatch(/setUserId\(nextUserId\(userIdRef\.current, \{ type: "auth-event", event, sessionUserId \}\)\)/);
    expect(listener).toMatch(/mutate\(isMyConsentStateKey/);
  });
});

describe("every sign-out and deletion path clears", () => {
  it("PlayerProvider.signOut() clears (sidebar and both Settings views go through it)", () => {
    const src = codeOnly(join(ROOT, "lib/context/player-context.tsx"));
    const body = src.slice(src.indexOf("const signOut = useCallback("), src.indexOf("}, []);", src.indexOf("const signOut = useCallback(")));
    expect(body).toMatch(/clearSeededBrowserStorage\(\)/);
    expect(body).toMatch(/setUserId\(null\)/);
    expect(body).toMatch(/mutate\(isMyConsentStateKey, undefined/);
  });

  it.each(["components/seeded/settings/seeded-settings-view.tsx", "components/seeded/settings/parent-settings-view.tsx"])(
    "%s clears after a successful deletion",
    (file) => {
      const src = codeOnly(join(ROOT, file));
      expect(src).toMatch(/postJson\("\/api\/account\/deletion"[^)]*\);\s*clearSeededBrowserStorage\(\);\s*signOut\(\);/);
    }
  );

  it("nothing signs out of Supabase except through PlayerProvider", () => {
    // lib/auth.ts signOut() holds the only supabase.auth.signOut(), and only
    // player-context imports it. A new direct caller would skip the clear.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const src = codeOnly(join(ROOT, rel));
          if (/auth\.signOut\(/.test(src) && rel !== "lib/auth.ts") offenders.push(`${rel}: auth.signOut()`);
          if (/import\s*\{[^}]*\bsignOut\b[^}]*\}\s*from\s*"@\/lib\/auth"/.test(src) && rel !== "lib/context/player-context.tsx")
            offenders.push(`${rel}: imports signOut from lib/auth`);
        }
      }
    };
    for (const dir of ["app", "components", "lib"]) walk(dir);
    expect(offenders).toEqual([]);
  });
});
