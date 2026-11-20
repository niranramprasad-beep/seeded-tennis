import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { SIGNED_IN_ONLY_PREFIXES, isSignedInOnlyPath } from "@/lib/route-access";

// D8: the head script in app/layout.tsx sends a browser with NO saved
// Supabase session straight to /login from a signed-in-only route, before
// any bundle loads — the same place AuthGate sends it, only earlier. This
// runs the real script text against a fake browser. The rules that matter:
// a saved session is NEVER redirected, public routes are never redirected,
// and a storage error redirects nobody (AuthGate still decides then).

const ROOT = join(__dirname, "..");
const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
const match = layout.match(/__html: `([\s\S]*?)`,/);
if (!match) throw new Error("head script not found in app/layout.tsx");
const script = match[1].replace("${SIGNED_IN_ONLY_JSON}", JSON.stringify(SIGNED_IN_ONLY_PREFIXES));

function run(pathname: string, storage: Record<string, string> | "throws") {
  const attrs: Record<string, string> = {};
  const replaced: string[] = [];
  const keys = storage === "throws" ? [] : Object.keys(storage);
  const localStorage =
    storage === "throws"
      ? new Proxy({}, { get: () => { throw new Error("SecurityError"); } })
      : {
          get length() {
            return keys.length;
          },
          key: (i: number) => keys[i] ?? null,
          getItem: (k: string) => (k in storage ? storage[k] : null),
        };
  runInNewContext(script, {
    localStorage,
    window: { matchMedia: () => ({ matches: false }) },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } },
    location: { pathname, replace: (to: string) => replaced.push(to) },
  });
  return { attrs, replaced };
}

const SESSION = { "sb-gnlcpnsweqbtwpaqhqqg-auth-token": "{}" };

describe("head script early /login redirect", () => {
  it("redirects a browser with no session from every signed-in-only prefix (and below it)", () => {
    for (const p of SIGNED_IN_ONLY_PREFIXES) {
      expect(run(p, {}).replaced).toEqual(["/login"]);
      expect(run(`${p}/anything`, {}).replaced).toEqual(["/login"]);
    }
  });

  it("never redirects a browser that holds a saved session", () => {
    for (const p of SIGNED_IN_ONLY_PREFIXES) {
      const r = run(p, SESSION);
      expect(r.replaced).toEqual([]);
      expect(r.attrs["data-session"]).toBe("1");
    }
  });

  it("never redirects a public route, or a prefix look-alike", () => {
    for (const p of ["/", "/schools", "/schools/stanford-m", "/pricing", "/onboarding", "/login", "/signup", "/tournament-fit", "/sample-report", "/todays-news", "/planner", "/family-guide"]) {
      expect(isSignedInOnlyPath(p)).toBe(false);
      expect(run(p, {}).replaced).toEqual([]);
    }
  });

  it("a PKCE code-verifier key alone is not a session", () => {
    expect(run("/today", { "sb-x-auth-token-code-verifier": "v" }).replaced).toEqual(["/login"]);
  });

  it("does nothing when storage throws — AuthGate decides then", () => {
    expect(run("/today", "throws").replaced).toEqual([]);
  });
});
