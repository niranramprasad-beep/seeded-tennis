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

/** Does this file's component tree RENDER an AuthGate?
 *
 * It looks for `<AuthGate`, not the bare word: importing the symbol, or
 * mentioning it in a comment, is not a gate. An earlier version matched the
 * word and reported /pricing, /login and /cost-calculator as gated.
 *
 * An independent review then proved three ways past it, by building the
 * cases and watching all nine tests stay green:
 *   1. a gate in `layout.tsx` — layouts were never read at all;
 *   2. a chain one level deeper than the old cap of 3;
 *   3. `dynamic(() => import("@/components/..."))`, which the old
 *      `from "..."`-only regex could not see.
 * All three are covered now, and `routeChainFiles` adds the layout chain. */
function reachesAuthGate(file: string, depth = 0, seen = new Set<string>()): boolean {
  // 8 is far deeper than this codebase goes and costs nothing on ~50 pages;
  // a cap that is merely "deep enough today" is how blind spot 2 happened.
  if (depth > 8 || seen.has(file) || !existsSync(file)) return false;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  if (/<AuthGate[\s/>]/.test(src)) return true;
  // Aliased AND relative imports. A second verification pass got past the
  // alias-only regex with `import { Inner } from "./inner"` — a shape this
  // repo already uses (`app/layout.tsx` imports `./providers`).
  for (const m of src.matchAll(/(?:from|import\()\s*["'](@\/(?:components|app)\/[^"']+|\.{1,2}\/[^"']+)["']/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/")
      ? join(REPO, spec.slice(2))
      : join(dirname(file), spec);
    for (const cand of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
      if (reachesAuthGate(cand, depth + 1, seen)) return true;
    }
  }
  return false;
}

/** The page plus every wrapper above it: `layout.tsx` AND `template.tsx`,
 * at every ancestor segment.
 *
 * `template.tsx` was the second bypass a verification pass built — Next
 * wraps children with it exactly as it does a layout, and this repo already
 * has an `app/template.tsx`. Reconstructing paths from URL segments also
 * skips route-group directories, whose names never appear in the URL, so
 * those are walked explicitly. */
function routeChainFiles(route: string): string[] {
  const files = [pageFileFor(route)];
  const pageDir = dirname(pageFileFor(route));

  // Walk up the real directory tree, so `(group)` segments are included.
  let dir = pageDir;
  for (;;) {
    files.push(join(dir, "layout.tsx"), join(dir, "template.tsx"));
    if (dir === APP) break;
    const parent = dirname(dir);
    if (parent === dir || !parent.startsWith(APP)) break;
    dir = parent;
  }
  return [...new Set(files)].filter((f) => existsSync(f));
}

function routeIsGated(route: string): boolean {
  return routeChainFiles(route).some((f) => reachesAuthGate(f));
}

function pageFileFor(route: string): string {
  return route === "/" ? join(APP, "page.tsx") : join(APP, ...route.slice(1).split("/"), "page.tsx");
}

describe("robots.txt covers every auth-gated route", () => {
  // Dynamic segments are kept, mapped to their parent for the prefix check:
  // dropping every `[slug]` route made a gated dynamic page invisible.
  const routes = routesWithPages();

  it("finds the app's routes at all (guards against a vacuous sweep)", () => {
    // Without this, a broken walker would silently assert nothing — the
    // mistake made twice in lib/family-utr-honesty.test.ts.
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain("/today");
    expect(routes).toContain("/pricing");
  });

  it("every route behind an AuthGate is disallowed", () => {
    const gatedButCrawlable = routes.filter(
      (r) => routeIsGated(r) && !isPrivateRoute(r) && !(r in GATED_BUT_PUBLIC)
    );
    expect(
      gatedButCrawlable,
      "disallow these in PRIVATE_ROUTE_PREFIXES, or justify them in GATED_BUT_PUBLIC"
    ).toEqual([]);
  });

  it("detects the gate it is looking for (guards against a vacuous check)", () => {
    // If reachesAuthGate silently returned false for everything, the test
    // above would pass no matter what. Pin a route known to be gated.
    expect(routeIsGated("/today")).toBe(true);
    expect(routeIsGated("/outreach")).toBe(true);
    // ...and not report a gate on a page that has none.
    expect(routeIsGated("/pricing")).toBe(false);
  });

  it("every GATED_BUT_PUBLIC exemption is real and carries a reason", () => {
    // An exemption list is only safe if it cannot quietly collect routes.
    for (const [route, reason] of Object.entries(GATED_BUT_PUBLIC)) {
      expect(routes, `${route} is exempted but is not a route`).toContain(route);
      expect(
        routeIsGated(route),
        `${route} is exempted but renders no AuthGate — delete the exemption`
      ).toBe(true);
      expect(reason.length, route).toBeGreaterThan(40);
    }
  });

  it("every private page that exists also carries a noindex meta robots tag", () => {
    // robots.txt is a request a crawler may ignore; `robots: { index: false }`
    // is an instruction to one that already has the page. The first version
    // of this work applied the tag to 2 of 13 private routes and called it
    // "belt-and-braces" — it was neither belt nor braces for the other 11.
    const missing = routes
      .filter((r) => isPrivateRoute(r) && !r.startsWith("/dev") && existsSync(pageFileFor(r)))
      .filter((r) => !/robots:\s*\{[^}]*index:\s*false/.test(readFileSync(pageFileFor(r), "utf8")));
    expect(missing, "add `robots: { index: false, follow: false }` to these").toEqual([]);
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
