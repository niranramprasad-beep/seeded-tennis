import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { codeOnly } from "@/lib/testing/source-text";

// Landing polish + the Seeded mark everywhere (Herdy's review, 2026-11-22).

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("the public header and footer (23 Nov consult)", () => {
  it("drops the header's 'Get my free fit report' button: the links' 'Fit report' goes to the same page", () => {
    const nav = codeOnly("components/seeded/layout/nav.tsx");
    expect(nav).not.toMatch(/Get my free fit report/);
    expect(nav).toMatch(/\{ href: "\/onboarding", label: "Fit report" \}/);
  });

  it("opens the phone menu as the shared right-hand Drawer", () => {
    expect(codeOnly("components/seeded/layout/nav.tsx")).toMatch(/<Drawer\b/);
  });

  it("puts the sample report ('For parents') under the same header as every other public page", () => {
    expect(codeOnly("components/layout/app-shell.tsx")).not.toMatch(/"\/sample-report"/);
  });

  it("prints a copyright line with the current year", () => {
    expect(codeOnly("components/layout/footer.tsx")).toMatch(/©\s*\{new Date\(\)\.getFullYear\(\)\}\s*Seeded/);
  });
});

describe("the Seeded mark", () => {
  // The sample report used to draw its own mark in a standalone header; since
  // the 23 Nov consult it sits under the public header, which draws it.
  it("is the one SeededMark in the public header, the sidebar and the footer", () => {
    for (const f of [
      "components/seeded/layout/nav.tsx",
      "components/seeded/layout/sidebar.tsx",
      "components/layout/footer.tsx",
    ]) {
      expect(read(f), f).toMatch(/<SeededMark\b/);
    }
    // The public header drew its own copy of the ball (inline <svg>), which
    // had already drifted from the sidebar's.
    expect(read("components/seeded/layout/nav.tsx")).not.toMatch(/<svg\b/);
  });

  it("keeps the seams dark on the lime ball in both modes", () => {
    const src = read("components/seeded/icons/index.tsx");
    const mark = src.slice(src.indexOf("export function SeededMark"), src.indexOf("export function RacketIcon"));
    expect(mark).toMatch(/<path d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0" stroke="rgb\(var\(--c-on-lime\)\)"/);
  });

  it("the favicon, app icon and share image draw the same ball", () => {
    for (const f of ["app/icon.tsx", "app/apple-icon.tsx", "app/opengraph-image.tsx"]) {
      const src = read(f);
      expect(src, f).toContain('d="M3 8c5 2 11 2 16 0M3 14c5-2 11-2 16 0"');
      expect(src, f).toContain('fill="#D7F25A"');
    }
  });

  it("the static brand SVGs switch their ink for a dark colour scheme", () => {
    for (const f of ["public/brand/seeded-mark.svg", "public/brand/seeded-lockup.svg"]) {
      const svg = read(f);
      expect(svg, f).toMatch(/@media \(prefers-color-scheme: dark\)/);
      expect(svg, f).toContain("#ECEDE7"); // --c-ink in dark mode
    }
    expect(read("public/brand/seeded-lockup.svg")).toMatch(/\.word \{ fill: #ECEDE7; \}/);
  });
});

describe("landing layout", () => {
  it("uses no half-step spacing class Tailwind does not generate (py-4.5 was silently 0)", () => {
    const config = read("tailwind.config.ts");
    const offenders: string[] = [];
    for (const f of [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))]) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y|w|h|top|left|right|bottom|inset)-((?:4|5|6|7|8|9|1[0-9])\.5)(?![\w.])/g)) {
        if (!config.includes(`"${m[1]}"`)) offenders.push(`${relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a section heading keeps .seeded-section-head's bottom margin (no m-0 beside it)", () => {
    for (const f of walk(join(ROOT, "components"))) {
      const src = readFileSync(f, "utf8");
      expect(src, relative(ROOT, f)).not.toMatch(/"[^"\n]*(?:seeded-section-head[^"\n]*\bm-0\b|\bm-0\b[^"\n]*seeded-section-head)[^"\n]*"/);
    }
  });

  it("the three capability cards close the grid at two columns (third spans the row)", () => {
    expect(read("components/seeded/home/seeded-home-view.tsx")).toMatch(/sm:col-span-2 lg:col-span-1/);
  });
});
