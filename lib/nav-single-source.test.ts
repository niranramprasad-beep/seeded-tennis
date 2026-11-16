import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  PARENT_NAV_LINKS,
  PLAYER_NAV_LINKS,
  SHARED_SECONDARY_LINKS,
} from "@/components/seeded/layout/nav-links";
import { isParentAllowedPath, isPlayerBlockedPath } from "./route-access";
import { PUBLIC_CONTENT_ROUTES } from "./seo/private-routes";

// One list of where each role can go, and one function for which child a
// family screen is about. Both used to be copies "kept in sync" by comment.

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const SOURCES = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
const read = (p: string) => readFileSync(p, "utf8");

const PUBLIC = new Set<string>(PUBLIC_CONTENT_ROUTES);

describe("navigation: one list, and every link reaches its page", () => {
  it("every parent link is a page a parent can actually open", () => {
    for (const l of [...PARENT_NAV_LINKS, ...SHARED_SECONDARY_LINKS]) {
      expect(
        isParentAllowedPath(l.href) || PUBLIC.has(l.href),
        `${l.href} is in the parent nav but AuthGate bounces a parent from it`
      ).toBe(true);
    }
  });

  it("no player link leads to a page AuthGate bounces a player from", () => {
    for (const l of [...PLAYER_NAV_LINKS, ...SHARED_SECONDARY_LINKS]) {
      expect(isPlayerBlockedPath(l.href), l.href).toBe(false);
    }
  });

  it("the parent nav never offers the player's write surfaces", () => {
    const hrefs = PARENT_NAV_LINKS.map((l) => l.href);
    for (const p of ["/events", "/outreach", "/plan", "/today", "/training", "/matches"]) {
      expect(hrefs).not.toContain(p);
    }
  });

  it("the sidebar and the palette build from nav-links.ts, not their own copies", () => {
    for (const f of ["components/seeded/layout/sidebar.tsx", "components/seeded/shared/command-palette.tsx"]) {
      const src = read(join(ROOT, f));
      expect(src, f).toMatch(/from "(\.\/|@\/components\/seeded\/layout\/)nav-links"/);
      // A hand-written route entry, e.g. `{ label: "Events", href: "/events"`
      // or `{ href: "/family", label: ...`, is a second list.
      expect(src, `${f} defines its own nav entries`).not.toMatch(
        /\{\s*(label:\s*"[^"]+",\s*)?href:\s*"\/[a-z-]*"/
      );
    }
  });
});

describe("one answer to 'which player is this family screen about'", () => {
  it("no component picks the player for itself", () => {
    const offenders: string[] = [];
    for (const f of SOURCES) {
      if (f.endsWith(join("lib", "family-view.ts"))) continue;
      const src = read(f);
      // .find(m => m.role === "player"), .find((x) => x.role == 'player'), etc.
      if (/\.find\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.role\s*===?\s*["']player["']/.test(src)) {
        offenders.push(relative(ROOT, f));
      }
    }
    expect(offenders, "use pickFamilyPlayer() from lib/family-view.ts").toEqual([]);
  });
});
