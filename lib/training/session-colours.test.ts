import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SESSION_TYPES } from "./session-types";

// In the month view a session is only a coloured dot, so two types must never
// look the same. Recovery and Mental work were two greys 6 apart (2026-11-23).

type Rgb = [number, number, number];
const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8").replace(/\r\n/g, "\n");

function tokens(mode: string): Record<string, Rgb> {
  const start = css.indexOf(`  :root[data-seeded-mode="${mode}"] {`);
  expect(start).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf("\n  }", start)).replace(/\/\*[\s\S]*?\*\//g, "");
  return Object.fromEntries(
    [...block.matchAll(/--(c-[\w-]+):\s*(\d+) (\d+) (\d+);/g)].map((m) => [m[1], [+m[2], +m[3], +m[4]] as Rgb])
  );
}

/** A type's colour as painted on a card: its token, mixed in if it has an alpha. */
function painted(color: string, t: Record<string, Rgb>): Rgb {
  const m = color.match(/^rgb\(var\(--(c-[\w-]+)\)(?: \/ ([\d.]+))?\)$/);
  expect(m, color).toBeTruthy();
  const base = t[m![1]];
  expect(base, m![1]).toBeDefined();
  const a = m![2] ? Number(m![2]) : 1;
  return base.map((v, i) => v * a + t["c-card"][i] * (1 - a)) as Rgb;
}

function lab(c: Rgb): Rgb {
  const [r, g, b] = c.map((v) => {
    const n = v / 255;
    return n > 0.04045 ? ((n + 0.055) / 1.055) ** 2.4 : n / 12.92;
  });
  const f = (n: number) => (n > 0.008856 ? Math.cbrt(n) : 7.787 * n + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const distance = (a: Rgb, b: Rgb) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

describe("every session type has a colour of its own", () => {
  it("the distance is right (the same colour is 0, black to white is 100)", () => {
    expect(distance([10, 20, 30], [10, 20, 30])).toBe(0);
    expect(distance([0, 0, 0], [255, 255, 255])).toBeCloseTo(100, 0);
  });

  for (const mode of ["light", "dark"]) {
    it(`${mode}: no two are closer than 20`, () => {
      const t = tokens(mode);
      const close: string[] = [];
      SESSION_TYPES.forEach((a, i) =>
        SESSION_TYPES.slice(i + 1).forEach((b) => {
          const d = distance(painted(a.color, t), painted(b.color, t));
          if (d < 20) close.push(`${a.label} / ${b.label}: ${d.toFixed(1)}`);
        })
      );
      expect(close).toEqual([]);
    });
  }
});
