import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  PARENT_NAV_LINKS,
  PARENT_TOOL_LINKS,
  PLAYER_NAV_LINKS,
  PLAYER_TOOL_LINKS,
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
    for (const l of [...PARENT_NAV_LINKS, ...PARENT_TOOL_LINKS, ...SHARED_SECONDARY_LINKS]) {
      expect(
        isParentAllowedPath(l.href) || PUBLIC.has(l.href),
        `${l.href} is in the parent nav but AuthGate bounces a parent from it`
      ).toBe(true);
    }
  });

  it("no player link leads to a page AuthGate bounces a player from", () => {
    for (const l of [...PLAYER_NAV_LINKS, ...PLAYER_TOOL_LINKS, ...SHARED_SECONDARY_LINKS]) {
      expect(isPlayerBlockedPath(l.href), l.href).toBe(false);
    }
  });

  it("the player's primary nav is exactly the five; Results and the tournament checker are Tools", () => {
    // CLAUDE.md: "5-item nav: Today, Plan, Schools, Outreach, Events" — the
    // Tools group (docs/DECISIONS.md, 2026-11-18) is secondary, not a sixth.
    expect(PLAYER_NAV_LINKS.map((l) => l.label)).toEqual(["Today", "Plan", "Schools", "Outreach", "Events"]);
    expect(PLAYER_TOOL_LINKS.map((l) => l.href)).toEqual(["/matches", "/tournament-fit"]);
    const sidebar = read(join(ROOT, "components/seeded/layout/sidebar.tsx"));
    const palette = read(join(ROOT, "components/seeded/shared/command-palette.tsx"));
    expect(sidebar).toMatch(/PLAYER_TOOL_LINKS/);
    expect(palette).toMatch(/PLAYER_TOOL_LINKS/);
    // The theme toggle lives in Settings → Appearance only.
    expect(sidebar).not.toMatch(/DarkModeToggle/);
  });

  it("the parent nav never offers the player's write surfaces", () => {
    const hrefs = [...PARENT_NAV_LINKS, ...PARENT_TOOL_LINKS].map((l) => l.href);
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
      // Any key order: `{ label, icon, href: "/matches" }` got past a
      // label-then-href pattern (verifier, 2026-11-16).
      expect(src, `${f} defines its own nav entries`).not.toMatch(/\bhref\s*:\s*["'`]\//);
      // Literal JSX links are limited to the account menu's fixed entries;
      // a `<Link href="/matches">` dropped into the sidebar is a second list.
      const literal = [...src.matchAll(/\bhref=["'`](\/[^"'`]*)["'`]/g)].map((m) => m[1]);
      for (const h of literal) {
        expect(["/settings", "/settings/billing", "/tournament-fit"], `${f}: literal link ${h}`).toContain(h);
      }
    }
  });
});

describe("one answer to 'which player is this family screen about'", () => {
  it("the picker detector catches the spellings that slipped past", () => {
    const find = /\.(?:find|findLast)\(\s*\(?[^)]{0,40}\)?\s*=>[^;]{0,60}\brole\s*===?\s*["'`]player["'`]/;
    const first = /\.filter\(\s*\(?[^)]{0,40}\)?\s*=>[^;]{0,60}\brole\s*===?\s*["'`]player["'`][^;]{0,20}?\)\s*(?:\??\.?\[0\]|\.at\(0\)|\.shift\(\))/;
    expect(find.test('members.find(({ role }) => role === "player")')).toBe(true);
    expect(first.test('members.filter((m) => m.role === "player")[0]')).toBe(true);
    expect(first.test('members.filter((m) => m.role === "player").length')).toBe(false);
  });

  it("no component picks the player for itself", () => {
    const offenders: string[] = [];
    for (const f of SOURCES) {
      if (f.endsWith(join("lib", "family-view.ts"))) continue;
      const src = read(f);
      // .find(m => m.role === "player"), .find((x) => x.role == 'player'), etc.
      // Any find/filter callback testing role === "player" — destructured
      // `({ role }) =>` and `.filter(…)[0]` both got past the first,
      // narrower pattern (verifier, 2026-11-16).
      const picks =
        /\.(?:find|findLast)\(\s*\(?[^)]{0,40}\)?\s*=>[^;]{0,60}\brole\s*===?\s*["'`]player["'`]/.test(src) ||
        /\.filter\(\s*\(?[^)]{0,40}\)?\s*=>[^;]{0,60}\brole\s*===?\s*["'`]player["'`][^;]{0,20}?\)\s*(?:\??\.?\[0\]|\.at\(0\)|\.shift\(\))/.test(src);
      if (picks) {
        offenders.push(relative(ROOT, f));
      }
    }
    expect(offenders, "use pickFamilyPlayer() from lib/family-view.ts").toEqual([]);
  });
});

describe("data rights are reachable before onboarding", () => {
  it("an un-onboarded player is not bounced from Settings", async () => {
    const { isOnboardingExemptPath } = await import("./route-access");
    expect(isOnboardingExemptPath("/settings")).toBe(true);
    expect(isOnboardingExemptPath("/settings/billing")).toBe(true);
    const gate = readFileSync(join(ROOT, "components/shared/auth-gate.tsx"), "utf8");
    expect(gate.match(/!isOnboardingExemptPath\(pathname\)/g)?.length).toBe(2);
  });
});
