import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PARENT_SETTINGS_SECTIONS,
  SETTINGS_FROM_ONBOARDING_HREF,
  SETTINGS_SECTIONS,
  sectionForRole,
  sectionFromLegacyLink,
  settingsHref,
} from "./settings-sections";
import { isConsentPendingAllowedPath, isOnboardingExemptPath, isParentAllowedPath } from "./route-access";
import {
  PARENT_SETTINGS_SECTION_LINKS,
  PLAYER_SETTINGS_SECTION_LINKS,
} from "@/components/seeded/layout/nav-links";

// PR D, D6: every Settings section has its own URL.

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("Settings sections have real URLs", () => {
  it("every section has a page", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(existsSync(join(ROOT, "app", s.href, "page.tsx")), s.href).toBe(true);
    }
  });

  it("lists the mockup's five sections in order; a parent has no Account", () => {
    expect(SETTINGS_SECTIONS.map((s) => s.label)).toEqual(["Profile", "Account", "Family", "Billing", "Privacy + data"]);
    expect(PARENT_SETTINGS_SECTIONS.map((s) => s.id)).toEqual(["profile", "family", "billing", "privacy"]);
    expect(sectionForRole("account", "parent")).toBe("profile");
    expect(sectionForRole("account", "player")).toBe("account");
  });

  it("stays reachable for every role and state that could reach /settings", () => {
    for (const s of SETTINGS_SECTIONS) {
      expect(isParentAllowedPath(s.href), s.href).toBe(true);
      expect(isOnboardingExemptPath(s.href), s.href).toBe(true);
      expect(isConsentPendingAllowedPath(s.href), s.href).toBe(true);
    }
  });

  it("keeps old /settings deep links working", () => {
    expect(sectionFromLegacyLink("#family", null)).toBe("family");
    expect(sectionFromLegacyLink("", "billing")).toBe("billing");
    expect(sectionFromLegacyLink("#privacy-data", null)).toBe("privacy");
    expect(sectionFromLegacyLink("#notifications", null)).toBe("profile");
    expect(sectionFromLegacyLink("#FAMILY", null)).toBe("family");
    // The query wins over the hash; nonsense lands on Profile.
    expect(sectionFromLegacyLink("#privacy", "family")).toBe("family");
    expect(sectionFromLegacyLink("#nope", "also-nope")).toBe("profile");
    expect(sectionFromLegacyLink(null, null)).toBe("profile");
  });

  it("/settings forwards rather than rendering a section of its own", () => {
    const page = readFileSync(join(ROOT, "app/settings/page.tsx"), "utf8");
    expect(page).toMatch(/SettingsIndexRedirect/);
    const redirect = readFileSync(join(ROOT, "components/settings/settings-index-redirect.tsx"), "utf8");
    expect(redirect).toMatch(/router\.replace\(settingsHref\(sectionFromLegacyLink\(hash, tab\)\)\)/);
  });

  it("onboarding's redirect target is the Profile section", () => {
    expect(SETTINGS_FROM_ONBOARDING_HREF.startsWith(settingsHref("profile") + "?")).toBe(true);
  });

  it("the settings tab nav is links, not client-side tab state", () => {
    const shell = readFileSync(join(ROOT, "components/seeded/settings/seeded-settings-shell.tsx"), "utf8");
    expect(shell).not.toMatch(/onTabChange|useState/);
    expect(shell).toMatch(/<Link\s+href=\{tab\.href\}/);
  });

  it("⌘K offers the sections a role can open", () => {
    expect(PLAYER_SETTINGS_SECTION_LINKS.map((l) => l.href)).toEqual([
      "/settings/account",
      "/settings/family",
      "/settings/billing",
      "/settings/privacy",
    ]);
    expect(PARENT_SETTINGS_SECTION_LINKS.map((l) => l.href)).not.toContain("/settings/account");
    for (const l of PARENT_SETTINGS_SECTION_LINKS) expect(isParentAllowedPath(l.href)).toBe(true);
  });

  it("no link in the app targets a section the old way (#hash or ?tab=)", () => {
    const hits: string[] = [];
    for (const f of ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)))) {
      // Code only: the compatibility shim and the section list describe the
      // old shapes in comments, which is the point of them.
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/["'`]\/settings(?:#|\?tab=)/.test(src)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
});
