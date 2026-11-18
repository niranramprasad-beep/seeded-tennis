import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { codeOnly, readableSource } from "./testing/source-text";

/* Design system v2 (docs/DESIGN_MOCKUP_SPEC_V2.md, board 23): the eight
 * rules, enforced where a file can be checked without rendering it.
 *
 *   rule 1  one green button per screen; lime is never a button fill
 *   rule 3  badges only say what is true today
 *   rule 8  the focus ring on light is court green (lime only on dark)
 *   tokens  colours come from CSS variables, never raw hex
 *
 * Scope: the Seeded design (components/seeded, components/layout,
 * components/auth, components/pricing, components/shared, app/). The Legacy
 * design (components/home, components/training, components/tournaments …)
 * is slated for deletion (docs/TODO.md) and is not held to v2.
 */

const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

const V2_DIRS = [
  "components/seeded",
  "components/layout",
  "components/auth",
  "components/pricing",
  "components/shared",
  "app",
];
const V2_FILES = V2_DIRS.flatMap((d) => walk(join(ROOT, d))).filter(
  (f) => !relative(ROOT, f).startsWith("app/dev/")
);
const rel = (f: string) => relative(ROOT, f);

/* ------------------------------------------------------------ rule 3 */

export const BANNED_BADGE_COPY: { pattern: RegExp; why: string }[] = [
  { pattern: /\bmost[- ]popular\b/i, why: "a popularity claim with no data behind it" },
  { pattern: /\bbest[- ]?sell(?:ing|er)\b/i, why: "a sales claim with no data behind it" },
  { pattern: /(?:^|[\s>("'])#1\b(?![\d,.])/, why: "a #1 ranking claim" },
  { pattern: /\btrusted by\b/i, why: "a social-proof claim" },
  { pattern: /\bthousands of\b/i, why: "a scale claim Seeded cannot back" },
];

describe("rule 3: badges only say what is true today", () => {
  it("the detector catches each banned phrase (self-test)", () => {
    for (const s of ["Most popular", "most-popular plan", "Best-selling", "bestseller", "Rated #1 by families", "Trusted by coaches", "Join thousands of players"]) {
      expect(BANNED_BADGE_COPY.some((b) => b.pattern.test(s)), s).toBe(true);
    }
    for (const s of ["U.S. News academic rank #7.", "Recommended", "Estimate", "New"]) {
      expect(BANNED_BADGE_COPY.some((b) => b.pattern.test(s)), s).toBe(false);
    }
  });

  it("no user-facing copy uses a banned badge phrase", () => {
    const files = [...V2_FILES, ...walk(join(ROOT, "lib"))];
    const hits: string[] = [];
    for (const f of files) {
      const text = readableSource(f);
      for (const b of BANNED_BADGE_COPY) {
        const m = text.match(b.pattern);
        if (m) hits.push(`${rel(f)}: "${m[0].trim()}" — ${b.why}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

/* ----------------------------------------------------------- tokens */

// Hex that is allowed to stay hex, each with its reason.
const HEX_ALLOWED: Record<string, string> = {
  // Google's own logo must be its exact brand colours (their branding rules).
  "components/auth/auth-card.tsx": "the four Google logo fills",
  // next/og image generation: no CSS variables exist in that renderer.
  "app/apple-icon.tsx": "ImageResponse has no access to CSS variables",
  "app/icon.tsx": "ImageResponse has no access to CSS variables",
  "app/opengraph-image.tsx": "ImageResponse has no access to CSS variables",
  "app/twitter-image.tsx": "ImageResponse has no access to CSS variables",
  // The web app manifest is JSON for the OS (theme_color/background_color).
  "app/manifest.ts": "the OS reads theme colours from the manifest, not CSS",
};

/** A colour literal: #abc, #aabbcc or #aabbccdd, not part of a URL fragment
 *  like href="#faq" (a fragment follows a quote or a slash). */
export const RAW_HEX = /(?<![\w"'`/&])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/;

describe("tokens: colours come from CSS variables, never raw hex", () => {
  it("the detector catches colour literals and ignores fragments (self-test)", () => {
    for (const s of ['className="bg-[#1F6B4A]"', 'fill="#D7F25A"', "color: '#fff'", "border-[#D6D3C8]/40"]) {
      expect(RAW_HEX.test(s.replace(/"#|'#/, " #")), s).toBe(true);
    }
    for (const s of ['href="#faq"', 'href="#how-fit-works"', "/schools#add", "rgb(var(--c-primary))"]) {
      expect(RAW_HEX.test(s), s).toBe(false);
    }
  });

  it("no Seeded-design file paints with a hex literal", () => {
    const hits: string[] = [];
    for (const f of V2_FILES) {
      if (HEX_ALLOWED[rel(f)]) continue;
      // Quotes are opened up so `fill="#D7F25A"` is caught but a fragment
      // href (a quote then #, then a word that is not hex) is not.
      const code = codeOnly(f).replace(/(["'`])#(?=[0-9a-fA-F]{3,8}(?![\w-]))/g, "$1 #");
      const m = code.match(RAW_HEX);
      if (m) hits.push(`${rel(f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });
});

/* ------------------------------------------------------------ rule 1 */

/** Every opening JSX tag of a button-like element, with its attribute text.
 *  A scanner, not a regex: `[^>]*` stopped at the `>` of an arrow function
 *  (`onClick={() => …}`), so `<button onClick={() => go()} className=
 *  "bg-lime-accent">` read as having no class at all (independent review,
 *  2026-11-16). Braces and quotes are tracked; only a `>` at depth 0 ends a
 *  tag. */
export function buttonishTags(code: string): { tag: string; attrs: string; index: number }[] {
  const out: { tag: string; attrs: string; index: number }[] = [];
  const open = /<(button|Link|a|SeededButton|Button)\b/g;
  for (const m of code.matchAll(open)) {
    let i = m.index! + m[0].length;
    let depth = 0;
    let quote: string | null = null;
    for (; i < code.length; i++) {
      const c = code[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ tag: m[1], attrs: code.slice(m.index! + m[0].length, i), index: m.index! });
  }
  return out;
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

describe("rule 1: lime is never a button fill", () => {
  it("no button, link or SeededButton is filled with the lime accent", () => {
    const hits: string[] = [];
    for (const f of V2_FILES) {
      const code = codeOnly(f);
      for (const t of buttonishTags(code)) {
        if (/\bbg-lime-accent\b/.test(t.attrs)) hits.push(`${rel(f)}:${lineOf(code, t.index)} <${t.tag}>`);
      }
    }
    // The button variants themselves.
    expect(readFileSync(join(ROOT, "components/seeded/ui/button.tsx"), "utf8")).not.toMatch(/bg-lime-accent/);
    expect(hits).toEqual([]);
  });
});

/** Primary (green-filled) buttons in a file: the SeededButton default and
 *  its "primary" variant, and hand-rolled bg-grass + on-primary buttons. */
export function primaryButtonCount(code: string): number {
  let n = 0;
  for (const { tag, attrs } of buttonishTags(code)) {
    if (tag === "SeededButton" || tag === "Button") {
      const variant = attrs.match(/variant=\{?["']([a-z]+)["']\}?/)?.[1];
      // A conditional variant ({x ? "secondary" : "primary"}) can be primary.
      if (!variant || variant === "primary" || /variant=\{[^}]*"primary"/.test(attrs)) n++;
    } else if (/\bbg-grass\b(?![-/])/.test(attrs) && /\btext-on-primary\b/.test(attrs)) n++;
    else if (/variant:\s*"primary"/.test(attrs)) n++;
  }
  return n;
}

describe("rule 1: one green button per screen", () => {
  it("the counter sees each way a primary is written (self-test)", () => {
    expect(primaryButtonCount('<SeededButton onClick={go}>Save</SeededButton>')).toBe(1);
    expect(primaryButtonCount('<SeededButton variant="secondary">Back</SeededButton>')).toBe(0);
    expect(primaryButtonCount('<Link href="/x" className="rounded-lg bg-grass text-on-primary">Go</Link>')).toBe(1);
    expect(primaryButtonCount('<Link href="/x" className={cn(seededButtonVariants({ variant: "primary" }), "w-full")}>Go</Link>')).toBe(1);
    expect(primaryButtonCount('<span className="bg-grass text-on-primary">mock</span>')).toBe(0);
    // The bypasses an independent review used: an arrow function before the
    // class, and the shadcn <Button>.
    expect(primaryButtonCount('<Link onClick={() => 1} className="bg-grass text-on-primary">x</Link>')).toBe(1);
    expect(primaryButtonCount('<Button variant="primary">x</Button>')).toBe(1);
    expect(buttonishTags('<button onClick={() => alert(1)} className="bg-lime-accent">x</button>')[0].attrs).toMatch(/bg-lime-accent/);
  });

  // Hard caps on the pages this pass rebuilt and measured. A page may have a
  // second primary only where it sits on a different screen (a final CTA
  // band far below the hero) — those are listed with the reason.
  const CAPS: Record<string, { max: number; why: string }> = {
    "components/seeded/schools/seeded-school-detail.tsx": { max: 1, why: "Save to targets" },
    "components/seeded/schools/seeded-schools-browser.tsx": { max: 1, why: "Compare side by side, in the bar that appears once schools are ticked" },
    "components/seeded/layout/nav.tsx": { max: 2, why: "the header CTA, desktop + the mobile menu copy of it" },
    "components/seeded/events/seeded-events-layout.tsx": { max: 1, why: "Add session (sweep C20)" },
    "components/seeded/events/upcoming-tournaments-card.tsx": { max: 0, why: "it sits on /events, whose one green button is Add session" },
    "components/seeded/events/events-calendar-card.tsx": { max: 0, why: "it sits on /events, whose one green button is Add session" },
    "components/seeded/events/recent-results-card.tsx": { max: 0, why: "it sits on /events, whose one green button is Add session" },
    "components/seeded/home/seeded-home-view.tsx": {
      max: 3,
      why: "hero (desktop), the calculator's button (phones only, where the hero copy is hidden), the final CTA band at the bottom",
    },
  };

  it("the rebuilt pages stay within their caps", () => {
    const over: string[] = [];
    for (const [file, cap] of Object.entries(CAPS)) {
      const n = primaryButtonCount(codeOnly(join(ROOT, file)));
      if (n > cap.max) over.push(`${file}: ${n} primaries (cap ${cap.max}: ${cap.why})`);
    }
    expect(over).toEqual([]);
  });

  // Warn-level for everything else: rendering is needed to know what shares
  // a screen, so this lists candidates rather than failing on them.
  it("reports other files with more than one primary (warning only)", () => {
    const many = V2_FILES.filter((f) => !CAPS[rel(f)])
      .map((f) => [rel(f), primaryButtonCount(codeOnly(f))] as const)
      .filter(([, n]) => n > 1);
    if (many.length) {
      console.warn(
        "[design-system-v2] files with more than one primary button (check they are on different screens):\n" +
          many.map(([f, n]) => `  ${f}: ${n}`).join("\n")
      );
    }
    expect(true).toBe(true);
  });
});

/* ------------------------------------------------------------ rule 8 */

describe("rule 8: the focus ring is court green on light, lime only on dark", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(selector + " {");
    expect(start, selector).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("\n  }", start));
  };
  const varIn = (b: string, name: string) => b.match(new RegExp(`--${name}:\\s*([\\d\\s]+);`))?.[1].trim();

  it("light: --c-focus is the primary; dark: --c-focus is the lime", () => {
    const light = block('[data-design="seeded"][data-seeded-mode="light"]');
    const dark = block('[data-design="seeded"][data-seeded-mode="dark"]');
    expect(varIn(light, "c-focus")).toBe(varIn(light, "c-primary"));
    expect(varIn(light, "c-focus")).not.toBe(varIn(light, "c-lime"));
    expect(varIn(dark, "c-focus")).toBe(varIn(dark, "c-lime"));
  });

  it("every Seeded element gets a 2px, offset-2 ring in --c-focus", () => {
    expect(css).toMatch(/\[data-design="seeded"\] :focus-visible \{\s*outline: 2px solid rgb\(var\(--c-focus\)\);\s*outline-offset: 2px;/);
  });

  it("no component hard-codes a lime focus ring", () => {
    const hits = V2_FILES.filter((f) => /focus(?:-visible|-within)?:(?:outline|ring)-lime-accent/.test(codeOnly(f))).map(rel);
    expect(hits).toEqual([]);
  });
});

/* ------------------------------------------------------- no gradients */

// Sweep C17: the ⌘K highlight was the accent gradient, /matches had a
// gradient divider under a marketing headline, Match mode a gradient badge.
// Board 23 is flat: solid tokens only. Scope is every Seeded file plus the
// app-route components that live outside components/seeded (results,
// Today's drawers).
export const GRADIENT =
  /bg-gradient-|(?:linear|radial|conic)-gradient\(|--s-accent-gradient|seeded-gradient-text|seeded-glass|\brule-gold\b/;

// Files that may keep one, each with the reason. Shrink this list; never
// grow it without a reason a reviewer would accept.
const GRADIENT_ALLOWED: Record<string, string> = {
  "components/layout/footer.tsx":
    "the gradient sits in `isSeeded ?` branches below `if (isSeeded) return <SlimFooter />` — unreachable for Seeded, Legacy-only in practice",
  "components/pricing/legacy-pricing-view.tsx": "the Legacy pricing page; Seeded renders seeded-pricing-view.tsx",
  "components/shared/glow-orb.tsx": "used only by Legacy views (legacy-home-view, roadmap-view, pricing-view)",
  "components/shared/spotlight-card.tsx": "used only by Legacy views (legacy-home-view, roadmap-view, pricing-view)",
  "components/auth/parent-login-form.tsx":
    "OPEN: a real Seeded violation (glass card + gradient button on /parent-login). Auth belongs to the onboarding pass running in parallel; flagged in the sweep C17 report rather than edited here",
};

const APP_ROUTE_EXTRA_DIRS = ["components/matches", "components/dashboard"];

describe("design system v2: no gradients on Seeded screens", () => {
  it("the detector catches each spelling (self-test)", () => {
    for (const s of [
      'style={{ background: "var(--s-accent-gradient)" }}',
      'className="seeded-glass p-6"',
      'className="bg-gradient-to-r from-grass to-lime"',
      'background: "linear-gradient(90deg, red, blue)"',
      'className="rule-gold mt-8"',
      'className="seeded-gradient-text"',
    ]) {
      expect(GRADIENT.test(s), s).toBe(true);
    }
    for (const s of ['className="bg-grass-50 text-grass"', "gradient of the trajectory"]) {
      expect(GRADIENT.test(s), s).toBe(false);
    }
  });

  it("no Seeded or app-route file paints a gradient", () => {
    const files = [...V2_FILES, ...APP_ROUTE_EXTRA_DIRS.flatMap((d) => walk(join(ROOT, d)))];
    const hits: string[] = [];
    for (const f of files) {
      if (GRADIENT_ALLOWED[rel(f)]) continue;
      const m = codeOnly(f).match(GRADIENT);
      if (m) hits.push(`${rel(f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it("every allow-listed file still has one (so the list cannot rot)", () => {
    const stale = Object.keys(GRADIENT_ALLOWED).filter((f) => {
      try {
        return !GRADIENT.test(codeOnly(join(ROOT, f)));
      } catch {
        return true;
      }
    });
    expect(stale, "remove these from GRADIENT_ALLOWED").toEqual([]);
  });
});
