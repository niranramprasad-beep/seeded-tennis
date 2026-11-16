import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// An independent review found that "202 accessibility violations to zero"
// was true only for the Seeded design. `--c-stone-light` is defined in
// ELEVEN blocks in app/globals.css; Night 2 fixed two and left nine legacy
// themes between 2.37:1 and 3.85:1. Those themes ship — Settings' legacy
// branch renders a ThemeSwitcher offering all of them — so the same ~127
// nodes still failed for anyone who picked one.
//
// This parses the real stylesheet and checks every block, so the claim is
// something the build verifies rather than something a commit message says.

const CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

type Rgb = [number, number, number];

function parseRgb(line: string): Rgb | null {
  const m = /:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/.exec(line);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

interface Block {
  selector: string;
  line: number;
  vars: Partial<Record<"--c-bg" | "--c-card" | "--c-panel-bg" | "--c-stone-light", Rgb>>;
}

/** Brace-depth walk, so each token is matched to its OWN block's surfaces.
 * A window-based scan (look N lines either side) reads a neighbouring
 * theme's background and produces confidently wrong numbers — that is how
 * the first attempt at this measurement disagreed with the reviewer's. */
function parseBlocks(): Block[] {
  const lines = CSS.split("\n");
  const out: Block[] = [];
  const stack: Block[] = [];
  const keys = ["--c-bg", "--c-card", "--c-panel-bg", "--c-stone-light"] as const;

  lines.forEach((line, i) => {
    for (let k = 0; k < (line.match(/\{/g) ?? []).length; k++) {
      stack.push({ selector: line.trim().replace(/\{\s*$/, "").trim() || "?", line: i + 1, vars: {} });
    }
    for (const key of keys) {
      if (line.includes(`${key}:`) && stack.length) {
        const rgb = parseRgb(line);
        if (rgb) stack[stack.length - 1].vars[key] = rgb;
      }
    }
    for (let k = 0; k < (line.match(/\}/g) ?? []).length; k++) {
      const b = stack.pop();
      if (b?.vars["--c-stone-light"]) out.push(b);
    }
  });
  return out;
}

const blocks = parseBlocks();

describe("--c-stone-light meets WCAG AA in every theme that ships", () => {
  it("finds every block that defines the token (guards a vacuous sweep)", () => {
    // Eleven at the time of writing. A parser that silently found none
    // would make every assertion below pass.
    expect(blocks.length).toBeGreaterThanOrEqual(11);
    expect(blocks.some((b) => b.selector.includes('data-theme="grass"'))).toBe(true);
    expect(blocks.some((b) => b.selector.includes("data-seeded-mode"))).toBe(true);
  });

  for (const b of blocks) {
    const fg = b.vars["--c-stone-light"] as Rgb;
    const surfaces = (["--c-bg", "--c-card", "--c-panel-bg"] as const)
      .filter((k) => b.vars[k])
      .map((k) => [k, b.vars[k] as Rgb] as const);

    it(`${b.selector} (line ${b.line}) is >= 4.5:1 on its own surfaces`, () => {
      expect(surfaces.length, `${b.selector} declares no background to check against`)
        .toBeGreaterThan(0);
      for (const [name, bg] of surfaces) {
        const ratio = contrast(fg, bg);
        expect(
          Math.round(ratio * 100) / 100,
          `${b.selector}: stone-light rgb(${fg}) on ${name} rgb(${bg})`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
