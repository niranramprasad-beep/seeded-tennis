import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "../components/seeded/icons/index.tsx"), "utf8");
const icons = [...source.matchAll(/export function (\w+)\(/g)].map((match, index, matches) => ({
  name: match[1],
  body: source.slice(match.index, matches[index + 1]?.index ?? source.length),
}));

describe("Seeded icon source", () => {
  it("contains no raw hex colours", () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it("exports the four contracted SVG components", () => {
    expect(icons.map(({ name }) => name)).toEqual(["SeededMark", "RacketIcon", "CourtIcon", "DrawIcon"]);
    for (const { name, body } of icons) {
      expect(body, name).toContain("<svg");
      expect(body, name).toContain('viewBox="0 0 24 24"');
    }
  });

  it("uses currentColor for every exported icon except the CSS-variable mark", () => {
    for (const { name, body } of icons) {
      const svg = body.match(/<svg\b[\s\S]*?>/)?.[0];
      expect(svg, name).toContain(name === "SeededMark" ? 'stroke="rgb(var(--c-ink))"' : 'stroke="currentColor"');
      expect(svg, name).toContain('fill="none"');
      expect(svg, name).toContain("strokeWidth={1.75}");
      expect(svg, name).toContain('strokeLinecap="round"');
      expect(svg, name).toContain('strokeLinejoin="round"');
    }
    expect(icons.find(({ name }) => name === "SeededMark")?.body).toContain('fill="rgb(var(--c-lime))"');
  });

  it("hides decorative icons and names titled icons", () => {
    for (const { name, body } of icons) {
      expect(body, name).toContain("aria-hidden={title ? undefined : true}");
      expect(body, name).toContain('role={title ? "img" : undefined}');
      expect(body, name).toContain("{title ? <title>{title}</title> : null}");
    }
  });
});
