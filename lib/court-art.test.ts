import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CourtBackdrop, CourtCorner, CourtDivider, TennisBall } from "../components/seeded/court";

const root = join(__dirname, "..");
const courtDir = join(root, "components/seeded/court");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? sourceFiles(file) : [file];
  });
}

// Inspect the returned element objects directly: no DOM or server rendering.
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [child, ...elements(child.props.children as ReactNode)];
  });
}

const drawings = [
  ["court-backdrop", () => CourtBackdrop({ className: "court-art" })],
  ["court-corner", () => CourtCorner({ className: "court-art" })],
  ["court-divider-net", () => CourtDivider({ className: "court-art" })],
  ["court-divider-baseline", () => CourtDivider({ className: "court-art", variant: "baseline" })],
  ["tennis-ball", () => TennisBall({ className: "court-art" })],
] as const;

const primitive = /^(?:line|path|rect|circle)$/;
const geometryKeys = new Set([
  "x", "y", "width", "height", "x1", "y1", "x2", "y2", "cx", "cy", "r", "d",
  "vector-effect", "stroke-width",
]);
const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
function shapeSignature(tag: string, attrs: Record<string, unknown>): string {
  return JSON.stringify([tag, Object.entries(attrs)
    .map(([key, value]) => [kebab(key), String(value)])
    .filter(([key]) => geometryKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b))]);
}

describe("court art contract", () => {
  it("keeps every component source free of fixed colours and external artwork", () => {
    for (const file of sourceFiles(courtDir)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/#[0-9a-fA-F]{3,6}|gradient|<image|http/i);
    }
  });

  it.each(drawings)("%s is decorative, inert and crisp at any size", (_name, draw) => {
    const svg = draw();
    expect(svg.type).toBe("svg");
    expect(svg.props).toMatchObject({
      className: "court-art",
      "aria-hidden": "true",
      focusable: "false",
      style: { pointerEvents: "none" },
      fill: "none",
      strokeWidth: 1.5,
    });
    for (const element of elements(svg)) {
      if (typeof element.type === "string" && primitive.test(element.type)) {
        expect(element.props.vectorEffect).toBe("non-scaling-stroke");
      }
      expect(element.type).not.toBe("text");
    }
  });

  it("uses caller colours for courts and palette variables for the ball", () => {
    for (const draw of [CourtBackdrop, CourtCorner, CourtDivider]) {
      expect(draw({}).props.stroke).toBe("currentColor");
      for (const element of elements(draw({}))) {
        expect(element.props.fill ?? "none").toBe("none");
        expect(element.props.stroke ?? "currentColor").toBe("currentColor");
      }
    }
    const ball = TennisBall({ size: 96 });
    expect(ball.props).toMatchObject({ width: 96, height: 96, viewBox: "0 0 64 64", stroke: "rgb(var(--c-ink))" });
    expect(elements(ball).find((element) => element.type === "circle")?.props.fill).toBe("rgb(var(--c-lime))");
    expect(TennisBall({}).props.width).toBe(64);
  });

  it("preserves regulation court distances in the baseline-to-net crop", () => {
    const backdrop = CourtBackdrop({});
    expect(backdrop.props).toMatchObject({ viewBox: "0 0 1440 720", width: "100%", height: "100%", preserveAspectRatio: "xMidYMid slice" });
    const shapes = elements(backdrop);
    const lines = shapes.filter((element) => element.type === "line").map((element) => element.props);
    const net = lines.find((line) => line.strokeWidth === 2)!;
    const singles = lines.filter((line) => line.y1 === net.y1 && line.y2 === "672");
    const service = lines.find((line) => line.y1 === line.y2 && line.y1 !== net.y1)!;
    const baseline = 672;
    const scale = (baseline - Number(net.y1)) / 39;
    expect(shapes.find((element) => element.type === "path")?.props.d).toBe("M432 48V672H1008V48");
    expect((1008 - 432) / scale).toBe(36);
    expect(singles).toHaveLength(2);
    expect((Number(singles[1].x1) - Number(singles[0].x1)) / scale).toBe(27);
    expect((Number(service.y1) - Number(net.y1)) / scale).toBe(21);
    expect(lines).toContainEqual(expect.objectContaining({ x1: "720", x2: "720", y1: "48", y2: "384" }));
    expect(lines).toContainEqual(expect.objectContaining({ x1: "720", x2: "720", y1: "664", y2: "672" }));
  });

  it("keeps the cream-section accent sparse", () => {
    const corner = CourtCorner({});
    expect(corner.props).toMatchObject({ viewBox: "0 0 1440 480", preserveAspectRatio: "xMidYMid slice" });
    expect(elements(corner).filter((element) => typeof element.type === "string" && primitive.test(element.type))).toHaveLength(3);
  });

  it("provides both divider variants, with a net by default", () => {
    const net = CourtDivider({});
    const baseline = CourtDivider({ variant: "baseline" });
    expect(net.props.viewBox).toBe("0 0 1440 48");
    expect(baseline.props.viewBox).toBe("0 0 1440 48");
    expect(elements(CourtDivider({ variant: "net" }))).toEqual(elements(net));
    const netLines = elements(net).filter((element) => element.type === "line");
    expect(netLines).toHaveLength(92);
    expect(netLines.filter((element) => element.props.y1 !== element.props.y2)).toHaveLength(90);
    expect(netLines).toContainEqual(expect.objectContaining({ props: expect.objectContaining({ y1: "8", y2: "8", strokeWidth: 2 }) }));
    const baselineLines = elements(baseline).filter((element) => element.type === "line");
    expect(baselineLines).toHaveLength(1);
    expect(baselineLines[0].props).toMatchObject({ x1: "0", x2: "1440", y1: "24", y2: "24" });
  });

  it.each(drawings)("%s has a matching explicit-colour Figma copy", (name, draw) => {
    const svg = draw();
    const copy = readFileSync(join(root, "public/brand/court", `${name}.svg`), "utf8");
    expect(copy).toContain(`viewBox="${svg.props.viewBox}"`);
    expect(copy).not.toMatch(/currentColor|var\(|<text|<image|<pattern|gradient/i);
    const staticShapes = [...copy.matchAll(/<(line|path|rect|circle)\b([^>]*?)\/?\s*>/g)]
      .filter((match) => !(match[1] === "rect" && /fill="#1F6B4A"/.test(match[2])))
      .map((match) => shapeSignature(match[1], Object.fromEntries(
        [...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]])
      )));
    const componentShapes = elements(svg)
      .filter((element) => typeof element.type === "string" && primitive.test(element.type))
      .map((element) => shapeSignature(element.type as string, element.props));
    expect(staticShapes).toEqual(componentShapes);
    if (name === "court-backdrop") {
      expect(copy).toContain('fill="#1F6B4A"');
      expect(copy).toContain('stroke="#FFFFFF" stroke-opacity="0.28"');
    } else if (name === "tennis-ball") {
      expect(copy).toContain('fill="#D7F25A"');
      expect(copy).toContain('stroke="#14181A"');
    } else {
      expect(copy).toContain('stroke="#E4E2DA"');
    }
  });
});
