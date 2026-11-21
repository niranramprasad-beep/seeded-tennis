import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RETIRED_DESIGN_STORAGE_KEY,
  choseRetiredDesign,
  parseRemoteAppearance,
  resolveStoredSystemSync,
} from "./appearance";

// The Legacy design is deleted (2026-11-20, PR-LEGACY). Seeded had two
// designs, chosen by `design: "legacy" | "seeded"` (localStorage
// `seeded.design`, html[data-design], user_settings…design), and Legacy came
// with nine `data-theme` palettes, a palette picker, its own home, pricing,
// settings, dashboard, roadmap, coaches, cost calculator and tournament-fit
// pages, and a "Legacy theme" pill in Settings → Appearance. Every honesty
// guard had to cover it twice. This fails the build if any of it comes back.
//
// "legacy" is an overloaded word here. The Whop legacy PLANS
// (WHOP_PLAN_PLAYER/FAMILY, legacyPlayer/legacyFamily), the old outreach
// localStorage key (LEGACY_OUTREACH_KEY), LEGACY_HAND_PLAN_NAME and
// sectionFromLegacyLink are not the theme, and nothing below matches them.

const ROOT = join(__dirname, "..");
const rel = (f: string) => relative(ROOT, f);

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx?|css|mjs)$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(full);
  }
  return acc;
}

const SOURCE_FILES = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));

/** Comments out: a comment may say what was deleted; only code counts. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

// The ONE place a stored "legacy" design value may be read, with the reason.
// Grow this only with a reason a reviewer would accept.
const RETIRED_VALUE_READERS: Record<string, string> = {
  "lib/appearance.ts": "maps a stored \"legacy\" (localStorage or user_settings) to Match system",
  "app/layout.tsx": "the pre-paint head script mirrors lib/appearance.ts; it runs before any bundle and cannot import it",
};

/** Every way the Legacy design has been spelled in code. Returns the reasons a
 * source string is a re-add; [] when it is clean. */
export function legacyThemeProblems(src: string, file: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  if (/\[data-design\b|data-design\s*=|["'`]data-design["'`]|dataset\.design\b/.test(code))
    out.push("the data-design attribute (the design switch)");
  if (/\[data-theme\b|data-theme\s*=|["'`]data-theme["'`]|dataset\.theme\b/.test(code))
    out.push("the data-theme attribute (Legacy's palettes)");
  if (/\bDesignSystemId\b|\bsetDesign\b|\bdesign\s*[!=]==\s*["'`]|["'`](?:legacy|seeded)["'`]\s*[!=]==\s*design\b/.test(code))
    out.push("a design switch (`design === …`, setDesign, DesignSystemId)");
  if (/\b(?:ThemeProvider|useTheme|useThemeColors|ThemeSwitcher|DesignSwitcher|THEMES)\b|theme-context|theme-switcher|design-switcher/.test(code))
    out.push("Legacy's palette picker / theme context");
  // A Legacy UI component, by the suffixes the deleted ones had. Not
  // lib/catalog's LegacyLike / withoutLegacyDuplicates (the hand-typed
  // catalog), which is a different "legacy".
  if (/\bLegacy(?:[A-Z]\w*)?(?:View|Layout|Settings|Contact|Terms|Parents|HowItWorks|Gate|Dashboard|Home|Pricing|Footer|Nav|Sidebar|Theme|Design|Switcher|Page)\b/.test(code))
    out.push("a Legacy* component (LegacyHomeView, LegacyPricingView, …)");
  if (/legacy-(?:home|pricing)-view|home-design-switch|school-detail-switch|seeded-route-redirect/.test(code))
    out.push("an import of a deleted Legacy file");
  if (/\bconcept-(?:matchpoint|clubhouse|nightrally)\b|["'`](?:Grass Court|Night Match|Hard Court|UTR Pulse|(?:Match Point|Clubhouse|Night Rally) \(concept\))["'`]/.test(code))
    out.push("a Legacy palette (or its name)");
  if (/--font-(?:plex-mono|space-grotesk)|IBMPlexMono|SpaceGrotesk/.test(code))
    out.push("a font only the Legacy concept themes used");
  if (/Legacy theme|Switch to Legacy|Legacy or Seeded/i.test(code)) out.push("a Legacy option in the UI copy");
  if (!RETIRED_VALUE_READERS[file] && /["'`]legacy["'`]/.test(code))
    out.push(`the string "legacy" outside the retired-value readers (${Object.keys(RETIRED_VALUE_READERS).join(", ")})`);
  return out;
}

describe("the Legacy design stays deleted", () => {
  it("no source file brings back any piece of it", () => {
    const hits = SOURCE_FILES.flatMap((f) =>
      legacyThemeProblems(readFileSync(f, "utf8"), rel(f)).map((p) => `${rel(f)}: ${p}`)
    );
    expect(hits).toEqual([]);
  });

  it("no Legacy-only file exists again", () => {
    const gone = [
      "components/home/legacy-home-view.tsx",
      "components/home/home-design-switch.tsx",
      "components/pricing/legacy-pricing-view.tsx",
      "components/seeded/schools/school-detail-switch.tsx",
      "components/seeded/schools/seeded-schools-header.tsx",
      "components/settings/design-switcher.tsx",
      "components/settings/theme-switcher.tsx",
      "components/shared/seeded-route-redirect.tsx",
      "components/shared/dark-mode-toggle.tsx",
      "components/layout/nav.tsx",
      "components/layout/sidebar.tsx",
      "components/tournaments/tournament-fit-view.tsx",
      "lib/context/theme-context.tsx",
    ];
    expect(gone.filter((f) => existsSync(join(ROOT, f)))).toEqual([]);
  });

  it("Settings → Appearance offers exactly Light, Dark and Match system", () => {
    const src = stripComments(readFileSync(join(ROOT, "components/seeded/settings/appearance-card.tsx"), "utf8"));
    const labels = [...src.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Light", "Dark", "Match system"]);
    expect(src).not.toMatch(/legacy/i);
  });

  it("the stylesheet has no Legacy palette or design selector", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
    expect(css).not.toMatch(/\[data-theme|\[data-design/);
    // The two Seeded modes are the only palettes besides the :root base.
    expect(css.match(/^\s*:root\[data-seeded-mode="(?:light|dark)"\] \{/gm)?.length).toBe(3); // light, dark, dark color-scheme
  });

  it("the Legacy-only routes stay server redirects into the Seeded pages", () => {
    const routes: [string, string][] = [
      ["app/dashboard/page.tsx", "/today"],
      ["app/roadmap/page.tsx", "/plan"],
      ["app/coaches/page.tsx", "/outreach"],
      ["app/cost-calculator/page.tsx", "/family"],
    ];
    for (const [file, to] of routes) {
      const src = stripComments(readFileSync(join(ROOT, file), "utf8"));
      expect(src, file).toMatch(new RegExp(`redirect\\(\\s*(?:query \\? \`${to}\\?\\$\\{query\\}\` : )?"${to}"\\s*\\)`));
      expect(src, file).not.toMatch(/@\/components\//);
      // A loading.tsx wraps the page in Suspense, and a redirect() inside a
      // streamed boundary is sent as a 200 with a client-side hop instead of
      // a 307 — the Legacy pages' loading/error files went with them.
      for (const sibling of ["loading.tsx", "error.tsx"]) {
        expect(existsSync(join(ROOT, file.replace("page.tsx", sibling))), `${file} ${sibling}`).toBe(false);
      }
    }
  });
});

describe("a stored \"legacy\" choice is read as Match system — never a crash, never Legacy", () => {
  it("localStorage: seeded.design = legacy follows the OS, whatever seeded.mode.system says", () => {
    expect(RETIRED_DESIGN_STORAGE_KEY).toBe("seeded.design");
    expect(choseRetiredDesign("legacy")).toBe(true);
    expect(choseRetiredDesign("seeded")).toBe(false);
    expect(choseRetiredDesign(null)).toBe(false);
    expect(resolveStoredSystemSync({ design: "legacy", systemSync: "0" })).toBe(true);
    expect(resolveStoredSystemSync({ design: "legacy", systemSync: null })).toBe(true);
    // Unchanged for everyone else.
    expect(resolveStoredSystemSync({ design: null, systemSync: null })).toBe(true);
    expect(resolveStoredSystemSync({ design: "seeded", systemSync: "0" })).toBe(false);
    expect(resolveStoredSystemSync({ design: null, systemSync: "1" })).toBe(true);
  });

  it("user_settings: design = legacy is Match system; its stored mode is ignored", () => {
    expect(parseRemoteAppearance({ design: "legacy", seededMode: "dark" })).toEqual({ matchSystem: true });
    expect(parseRemoteAppearance({ design: "seeded", seededMode: "light" })).toEqual({ seededMode: "light", matchSystem: false });
    expect(parseRemoteAppearance({ seededMode: "dark" })).toEqual({ seededMode: "dark", matchSystem: false });
    expect(parseRemoteAppearance({ design: 42, seededMode: "sepia" })).toEqual({ seededMode: undefined, matchSystem: false });
    expect(parseRemoteAppearance(null)).toBeNull();
  });

  it("saving a mode drops the retired `design` key from user_settings", () => {
    const src = stripComments(readFileSync(join(ROOT, "lib/db/settings.ts"), "utf8"));
    expect(src).toMatch(/mergeIntoBag\(\{ seededMode: pref\.seededMode \}, \[RETIRED_DESIGN_BAG_KEY\]\)/);
  });

  // The head script runs before any bundle, so it is checked by running it.
  function runHeadScript(store: Record<string, string>, osDark: boolean) {
    const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
    const m = layout.match(/__html: `(\(function\(\)\{[\s\S]*?\}\)\(\);)`/);
    expect(m, "head script not found in app/layout.tsx").toBeTruthy();
    const script = m![1].replace("${SIGNED_IN_ONLY_JSON}", "[]");
    const attrs: Record<string, string> = {};
    const keys = Object.keys(store);
    const localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      key: (i: number) => keys[i] ?? null,
      length: keys.length,
    };
    const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const window = { matchMedia: () => ({ matches: osDark }) };
    const location = { pathname: "/", replace: () => {} };
    new Function("localStorage", "document", "window", "location", script)(localStorage, document, window, location);
    return attrs;
  }

  it("the head script paints Seeded in the OS mode for a stored Legacy choice", () => {
    const legacy = { "seeded.design": "legacy", "seeded.mode.system": "0", "seeded.mode": "dark", "seeded.theme": "night" };
    expect(runHeadScript(legacy, false)).toEqual({ "data-seeded-mode": "light" });
    expect(runHeadScript(legacy, true)).toEqual({ "data-seeded-mode": "dark" });
  });

  it("the head script is unchanged for everyone else", () => {
    expect(runHeadScript({ "seeded.mode.system": "0", "seeded.mode": "dark" }, false)).toEqual({ "data-seeded-mode": "dark" });
    expect(runHeadScript({}, false)).toEqual({ "data-seeded-mode": "light" });
    expect(runHeadScript({ "seeded.design": "seeded", "seeded.mode.system": "0", "seeded.mode": "light" }, true)).toEqual({
      "data-seeded-mode": "light",
    });
  });
});

// Mutation tests: each detector catches what actually shipped before.
describe("the detectors catch the Legacy design as it shipped", () => {
  const shipped: [string, string][] = [
    ["design switch", 'const { design } = useDesign();\nreturn design === "seeded" ? <SeededHomeView /> : <LegacyHomeView />;'],
    ["reverse comparison", 'if ("legacy" === design) return null;'],
    ["setDesign", 'onClick: () => setDesign("legacy"),'],
    ["type", 'export type DesignSystemId = "legacy" | "seeded";'],
    ["html attribute", '<html lang="en" data-design="seeded">'],
    ["setAttribute", 'document.documentElement.setAttribute("data-design", d);'],
    ["dataset read", "document.documentElement.dataset.design"],
    ["CSS selector", '[data-design="seeded"][data-seeded-mode="dark"] {'],
    ["palette selector", '[data-theme="clay"] {'],
    ["palette attribute", 'document.documentElement.setAttribute("data-theme", t);'],
    ["palette provider", "<ThemeProvider>{children}</ThemeProvider>"],
    ["palette picker import", 'import { ThemeSwitcher } from "./theme-switcher";'],
    ["Legacy component", "function LegacySettingsView() {"],
    ["Legacy file import", 'import { LegacyPricingView } from "./legacy-pricing-view";'],
    ["switch import", 'import { SchoolDetailSwitch } from "@/components/seeded/schools/school-detail-switch";'],
    ["Appearance pill", '{ key: "legacy", label: "Legacy theme", active: !isSeeded },'],
    ["footer button", "<button>Switch to Legacy</button>"],
    ["stored value", 'if (stored === "legacy") setMode("legacy");'],
    ["concept theme", '{ id: "concept-nightrally", description: "Precision instrument dark" }'],
    ["palette name", '{ id: "x", name: "Night Match", swatch: ["#111111"] }'],
    ["concept font", "--font-mono-active: var(--font-plex-mono);"],
  ];
  for (const [label, src] of shipped) {
    it(`catches ${label}`, () => {
      expect(legacyThemeProblems(src, "components/x.tsx").length).toBeGreaterThan(0);
    });
  }

  it("does not flag the other meanings of legacy", () => {
    for (const src of [
      "const LEGACY_OUTREACH_KEY = \"seeded.outreach\";",
      "export const LEGACY_PLAN_PRICE_USD = { legacyPlayer: 19, legacyFamily: 39 } as const;",
      "if (planId === ids.legacyPlayer) return 19;",
      'router.replace(settingsHref(sectionFromLegacyLink(hash, tab)));',
      "// The Legacy design used data-design=\"legacy\" — a comment, not code.",
      'const { seededMode, setSeededMode } = useDesign();',
      "export interface LegacyLike { slug: string }",
      "return withoutLegacyDuplicates(programs, legacy);",
    ]) {
      expect(legacyThemeProblems(src, "components/x.tsx"), src).toEqual([]);
    }
  });

  it("allows the retired value only in its readers", () => {
    const read = 'export function choseRetiredDesign(v: unknown) { return v === "legacy"; }';
    expect(legacyThemeProblems(read, "lib/appearance.ts")).toEqual([]);
    expect(legacyThemeProblems(read, "lib/somewhere-else.ts").length).toBeGreaterThan(0);
  });
});
