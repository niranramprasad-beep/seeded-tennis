import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The page must not be the direct child of a DOM element in AppShell. When it
// arrives as a lazy chunk of the server payload, React pauses on that element
// while hydrating, replays it without stepping back out, and throws #418: the
// whole document is then redrawn on the client (app-shell.tsx, 2026-11-23).
// Line comments go first (codeOnly() takes block comments first, and a line
// comment in this file says "/auth/*", which opens one that never closes).
const code = readFileSync(join(__dirname, "..", "components/layout/app-shell.tsx"), "utf8")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ");

/** Places where `{children}` sits directly inside a lower-case (DOM) tag. */
export function childrenDirectlyInDom(src: string): string[] {
  return [...src.matchAll(/<([a-z][a-z0-9]*)\b(?:[^<>]|=>)*>\s*\{children\}/g)].map((m) => m[1]);
}

describe("AppShell hydrates the page behind a component", () => {
  it("the detector sees a DOM parent and ignores a component or a fragment (self-test)", () => {
    expect(childrenDirectlyInDom('<div key={pathname} className="min-h-[100svh]">{children}</div>')).toEqual(["div"]);
    expect(childrenDirectlyInDom("<main> {children} </main>")).toEqual(["main"]);
    expect(childrenDirectlyInDom("<div onClick={() => go()}>{children}</div>")).toEqual(["div"]);
    expect(childrenDirectlyInDom("<PageSlot>{children}</PageSlot>")).toEqual([]);
    expect(childrenDirectlyInDom("return <>{children}</>;")).toEqual([]);
  });

  it("no DOM element holds {children} directly", () => {
    expect(childrenDirectlyInDom(code)).toEqual([]);
  });

  it("PageSlot holds it, inside the keyed wrapper, and does nothing else", () => {
    expect(code).toMatch(/<div key=\{pathname\} className="[^"]*"> <PageSlot>\{children\}<\/PageSlot> <\/div>/);
    expect(code).toMatch(/function PageSlot\(\{ children \}: \{ children: ReactNode \}\) \{ return <>\{children\}<\/>; \}/);
  });
});
