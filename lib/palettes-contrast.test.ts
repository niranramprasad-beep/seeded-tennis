import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The colour exploration (app/palettes.css) must stay readable and must stay
// an exploration: every set measures WCAG AA in both modes, and nothing
// applies without html[data-palette], which only a preview build sets.

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");
const CSS = read("app/palettes.css");
const IDS = ["blue-court", "red-clay", "club-lawn"];

type Rgb = [number, number, number];

function vars(selector: string): Record<string, Rgb> {
  const start = CSS.indexOf(selector + " {");
  expect(start, selector).toBeGreaterThan(-1);
  const block = CSS.slice(start, CSS.indexOf("\n}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(\d+) (\d+) (\d+);/g)].map((m) => [m[1], [+m[2], +m[3], +m[4]] as Rgb])
  );
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((n) => {
    const v = n / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const over = (f: Rgb, b: Rgb, alpha: number) => f.map((v, i) => v * alpha + b[i] * (1 - alpha)) as Rgb;

// [text, surface, minimum]
const PAIRS: [string, string, number][] = [
  ...["c-bg", "c-card", "c-panel-bg"].flatMap((s) =>
    ["c-ink", "c-stone", "c-stone-light", "c-primary", "c-error"].map((t): [string, string, number] => [t, s, 4.5])
  ),
  ["c-ink", "c-subtle-hover", 4.5],
  ["c-stone", "c-subtle-hover", 4.5],
  ["c-ink", "c-primary-50", 4.5],
  ["c-stone", "c-primary-50", 4.5],
  ["c-primary", "c-primary-50", 4.5],
  ["c-on-primary", "c-primary", 4.5],
  ["c-on-primary", "c-primary-600", 4.5],
  ["c-error", "c-error-bg", 4.5],
  ["c-error-strong", "c-error-bg", 4.5],
  ["c-clay-tint-text", "c-clay-tint-bg", 4.5],
  ["c-clay-tint-text-strong", "c-clay-tint-bg", 4.5],
  ["c-sage-tint-text", "c-sage-tint-bg", 4.5],
  ["c-gold-tint-text", "c-gold-tint-bg", 4.5],
  ["c-on-lime", "c-lime", 4.5],
  ["c-focus", "c-bg", 3],
  ["c-focus", "c-card", 3],
  ["c-night-text", "c-night", 4.5],
  ["c-night-soft", "c-night", 4.5],
  ["c-night-muted", "c-night-card", 4.5],
];

describe("the colour exploration meets WCAG AA", () => {
  it("the contrast function is right (black on white is 21:1)", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  for (const id of IDS) {
    const fixed = `:root[data-palette="${id}"]`;
    for (const mode of ["light", "dark"]) {
      it(`${id}, ${mode}`, () => {
        const v = { ...vars(fixed), ...vars(`${fixed}[data-seeded-mode="${mode}"]`) };
        for (const [t, s, min] of PAIRS) {
          expect(v[t], t).toBeDefined();
          expect(v[s], s).toBeDefined();
          expect(contrast(v[t], v[s]), `${t} on ${s}`).toBeGreaterThanOrEqual(min);
        }
        expect(contrast([255, 255, 255], v["c-error-solid"])).toBeGreaterThanOrEqual(4.5);
        // The cost calculator's pill is white on this gradient: both ends.
        const rule = CSS.slice(CSS.indexOf(`${fixed}[data-seeded-mode="${mode}"] {`));
        const gradient = rule.match(/--s-accent-gradient: ([^;]+);/)?.[1] ?? "";
        const ends = [...gradient.matchAll(/rgb\((\d+) (\d+) (\d+)\)/g)].map((m) => [+m[1], +m[2], +m[3]] as Rgb);
        expect(ends.length).toBe(2);
        for (const end of ends) expect(contrast([255, 255, 255], end)).toBeGreaterThanOrEqual(4.5);
        // Rule 8 (design-system-v2.test.ts), per set.
        expect(v["c-focus"]).toEqual(mode === "light" ? v["c-primary"] : v["c-lime"]);
      });
    }

    it(`${id}: the court hero, down to its 85%-white copy`, () => {
      const v = vars(fixed);
      for (const alpha of [1, 0.9, 0.85]) {
        expect(contrast(over(v["c-court-text"], v["c-court"], alpha), v["c-court"])).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("it stays an exploration, not a new default", () => {
  it("every rule in palettes.css is scoped to data-palette", () => {
    const selectors = CSS.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g) ?? [];
    expect(selectors.length).toBe(IDS.length * 3);
    for (const s of selectors) expect(s.trim()).toMatch(/^:root\[data-palette="/);
  });

  it("only the preview script sets data-palette, behind its build flag", () => {
    expect(read("app/layout.tsx")).not.toMatch(/data-palette/);
    expect(read("components/dev/palette-preview.tsx")).toMatch(
      /if \(process\.env\.NEXT_PUBLIC_PALETTE_PREVIEW !== "1"\) return null;/
    );
  });
});
