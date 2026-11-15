import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRIVATE_ROUTE_PREFIXES,
  PUBLIC_CONTENT_ROUTES,
  GATED_BUT_PUBLIC,
  isPrivateRoute,
} from "./private-routes";

// app/robots.ts used to carry a hand-written disallow list naming /dashboard,
// /roadmap and /coaches — routes the Seeded rebuild superseded — while the
// live auth-gated routes the 5-item nav points at (/today, /plan, /outreach,
// /events) were absent. Nobody noticed because nothing checked.
//
// This walks the real app directory, follows each page's component imports,
// and fails when a route whose tree contains an AuthGate is not disallowed.

const REPO = join(__dirname, "..", "..");
const APP = join(REPO, "app");

function routesWithPages(dir = APP, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    // Route groups `(name)` do not appear in the URL.
    const segment = entry.startsWith("(") && entry.endsWith(")") ? "" : `/${entry}`;
    const route = `${prefix}${segment}`;
    if (existsSync(join(full, "page.tsx"))) out.push(route === "" ? "/" : route);
    out.push(...routesWithPages(full, route));
  }
  if (prefix === "" && existsSync(join(APP, "page.tsx"))) out.push("/");
  return [...new Set(out)];
}

/** Does this page's component tree RENDER an AuthGate?
 *
 * Two deliberate narrowings, both learned by getting it wrong first:
 *  - it looks for `<AuthGate`, not the bare word. Importing the symbol, or
 *    merely mentioning it in a comment, is not a gate. The first version
 *    matched the word and reported /pricing, /login and /cost-calculator as
 *    gated — they reach a file that talks about AuthGate without rendering
 *    one.
 *  - it only follows `@/components/...` imports, not `@/lib/...`. Views
 *    reach shared libraries that reach everything.
 *
 * Depth 3 covers this codebase's shape: page -> view -> inner -> gate. */
function reachesAuthGate(file: string, depth = 0, seen = new Set<string>()): boolean {
  if (depth > 3 || seen.has(file) || !existsSync(file)) return false;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  if (/<AuthGate[\s/>]/.test(src)) return true;
  for (const m of src.matchAll(/from\s+"@\/(components\/[^"]+)"/g)) {
    for (const cand of [`${m[1]}.tsx`, `${m[1]}/index.tsx`]) {
      if (reachesAuthGate(join(REPO, cand), depth + 1, seen)) return true;
    }
  }
  return false;
}

function pageFileFor(route: string): string {
  return route === "/" ? join(APP, "page.tsx") : join(APP, ...route.slice(1).split("/"), "page.tsx");
}

describe("robots.txt covers every auth-gated route", () => {
  const routes = routesWithPages().filter((r) => !r.includes("["));

  it("finds the app's routes at all (guards against a vacuous sweep)", () => {
    // Without this, a broken walker would silently assert nothing — the
    // mistake made twice in lib/family-utr-honesty.test.ts.
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain("/today");
    expect(routes).toContain("/pricing");
  });

  it("every route behind an AuthGate is disallowed", () => {
    const gatedButCrawlable = routes.filter(
      (r) => reachesAuthGate(pageFileFor(r)) && !isPrivateRoute(r) && !(r in GATED_BUT_PUBLIC)
    );
    expect(
      gatedButCrawlable,
      "disallow these in PRIVATE_ROUTE_PREFIXES, or justify them in GATED_BUT_PUBLIC"
    ).toEqual([]);
  });

  it("detects the gate it is looking for (guards against a vacuous check)", () => {
    // If reachesAuthGate silently returned false for everything, the test
    // above would pass no matter what. Pin a route known to be gated.
    expect(reachesAuthGate(pageFileFor("/today"))).toBe(true);
    expect(reachesAuthGate(pageFileFor("/outreach"))).toBe(true);
    // ...and not report a gate on a page that has none.
    expect(reachesAuthGate(pageFileFor("/pricing"))).toBe(false);
  });

  it("every GATED_BUT_PUBLIC exemption is real and carries a reason", () => {
    // An exemption list is only safe if it cannot quietly collect routes.
    for (const [route, reason] of Object.entries(GATED_BUT_PUBLIC)) {
      expect(routes, `${route} is exempted but is not a route`).toContain(route);
      expect(
        reachesAuthGate(pageFileFor(route)),
        `${route} is exempted but renders no AuthGate — delete the exemption`
      ).toBe(true);
      expect(reason.length, route).toBeGreaterThan(40);
    }
  });

  it("no /dev route is ever crawlable", () => {
    const dev = routes.filter((r) => r.startsWith("/dev"));
    expect(dev.length).toBeGreaterThan(0);
    for (const r of dev) expect(isPrivateRoute(r), r).toBe(true);
  });

  it("robots.ts uses the shared list rather than its own copy", () => {
    const robots = readFileSync(join(APP, "robots.ts"), "utf8");
    expect(robots).toContain("PRIVATE_ROUTE_PREFIXES");
    expect(robots).not.toMatch(/disallow:\s*\[\s*"/);
  });
});

describe("the sitemap lists the public pages and nothing private", () => {
  const sitemap = readFileSync(join(APP, "sitemap.ts"), "utf8");

  it("includes every public content route", () => {
    const missing = PUBLIC_CONTENT_ROUTES.filter((r) => {
      if (r === "/") return !sitemap.includes("url: BASE_URL");
      return !sitemap.includes(`${r}\``);
    });
    expect(missing, "add these to app/sitemap.ts").toEqual([]);
  });

  it("includes the privacy policy", () => {
    // Called out on its own: it is what Google's OAuth consent screen links
    // to, and it was the one missing when this test was written.
    expect(sitemap).toContain("/privacy`");
  });

  it("lists nothing that robots disallows", () => {
    for (const prefix of PRIVATE_ROUTE_PREFIXES) {
      expect(sitemap.includes(`\${BASE_URL}${prefix}`), prefix).toBe(false);
    }
  });
});
