import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activeNavHref, isActivePath } from "./nav-active";
import {
  PARENT_NAV_LINKS,
  PARENT_TOOL_LINKS,
  PLAYER_NAV_LINKS,
  PLAYER_TOOL_LINKS,
  SETTINGS_LINK,
} from "@/components/seeded/layout/nav-links";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("isActivePath", () => {
  it("matches the page itself", () => {
    expect(isActivePath("/schools", "/schools")).toBe(true);
    expect(isActivePath("/tournament-fit", "/tournament-fit")).toBe(true);
  });

  it("matches nested routes under the link", () => {
    expect(isActivePath("/schools/stanford", "/schools")).toBe(true);
    expect(isActivePath("/tournament-fit/share/abc", "/tournament-fit")).toBe(true);
    expect(isActivePath("/matches/new", "/matches")).toBe(true);
    expect(isActivePath("/settings/billing", "/settings")).toBe(true);
  });

  it("is segment-aware, not a raw prefix", () => {
    expect(isActivePath("/schoolsx", "/schools")).toBe(false);
    expect(isActivePath("/matches-old", "/matches")).toBe(false);
    expect(isActivePath("/plan", "/planner")).toBe(false);
  });

  it("ignores a trailing slash, query and hash", () => {
    expect(isActivePath("/events/", "/events")).toBe(true);
    expect(isActivePath("/events?tab=results", "/events")).toBe(true);
    expect(isActivePath("/events#calendar", "/events")).toBe(true);
    expect(isActivePath("/events", "/events/")).toBe(true);
  });

  it("the site root only matches itself", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/schools", "/")).toBe(false);
  });

  it("no pathname is never active", () => {
    expect(isActivePath(null, "/today")).toBe(false);
    expect(isActivePath(undefined, "/today")).toBe(false);
    expect(isActivePath("", "/today")).toBe(false);
  });
});

describe("activeNavHref — exactly one current item per group", () => {
  const player = [...PLAYER_NAV_LINKS, ...PLAYER_TOOL_LINKS, SETTINGS_LINK].map((l) => l.href);
  const parent = [...PARENT_NAV_LINKS, ...PARENT_TOOL_LINKS, SETTINGS_LINK].map((l) => l.href);

  it("a Tools page is current just like a primary page", () => {
    expect(activeNavHref("/tournament-fit", player)).toBe("/tournament-fit");
    expect(activeNavHref("/tournament-fit/anything", player)).toBe("/tournament-fit");
    expect(activeNavHref("/matches", player)).toBe("/matches");
    expect(activeNavHref("/tournament-fit", parent)).toBe("/tournament-fit");
  });

  it("primary pages and their nested routes", () => {
    expect(activeNavHref("/today", player)).toBe("/today");
    expect(activeNavHref("/schools/some-school", player)).toBe("/schools");
    expect(activeNavHref("/settings/privacy", player)).toBe("/settings");
  });

  it("the longest match wins: /family/budget is Budget, not also Overview", () => {
    expect(activeNavHref("/family", parent)).toBe("/family");
    expect(activeNavHref("/family/budget", parent)).toBe("/family/budget");
    expect(activeNavHref("/family/weekly-reports", parent)).toBe("/family/weekly-reports");
    expect(activeNavHref("/family/weekly-reports/2026-11-16", parent)).toBe("/family/weekly-reports");
  });

  it("a page outside the nav lights nothing", () => {
    expect(activeNavHref("/pricing", player)).toBeNull();
    expect(activeNavHref("/", player)).toBeNull();
  });
});

describe("every nav surface uses the shared rule", () => {
  for (const f of [
    "components/seeded/layout/sidebar.tsx",
    "components/seeded/shared/command-palette.tsx",
    "components/seeded/layout/nav.tsx",
  ]) {
    it(`${f} imports lib/nav-active and keeps no inline prefix match`, () => {
      const src = read(f);
      expect(src).toMatch(/from "@\/lib\/nav-active"/);
      expect(src, "an inline pathname.startsWith is a second rule").not.toMatch(/pathname\.startsWith\(/);
      expect(src).toMatch(/aria-current=\{/);
    });
  }

  it("the avatar menu's links carry aria-current too", () => {
    const src = read("components/seeded/layout/sidebar.tsx");
    const panelLink = src.slice(src.indexOf("function PanelLink"));
    expect(panelLink).toMatch(/aria-current=\{active \? "page" : undefined\}/);
  });
});
