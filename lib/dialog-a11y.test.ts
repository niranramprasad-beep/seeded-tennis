import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Every modal overlay gets Esc-to-close, a focus trap, focus return and a
// scroll lock from ONE hook (lib/hooks/use-dialog.ts). Before the
// 2026-11-15 keyboard pass none of the five did, and the shared Drawer was
// not announced as a dialog at all.

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(p);
  }
  return out;
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("modal overlays share one accessible behaviour", () => {
  const files = [...walk(join(ROOT, "components")), ...walk(join(ROOT, "app"))];

  // Keyed off role="dialog" as well as aria-modal: keyed off aria-modal
  // alone, the guard REWARDED dropping it — a role="dialog" overlay with no
  // aria-modal and no useDialog passed (verifier, 2026-11-16). Spread props
  // ({...dialogProps}) are covered by the same rule, since the role or the
  // attribute still has to be written somewhere in the file.
  const DIALOG = /role=["'{]+(?:alert)?dialog|aria-modal|["']aria-modal["']|ariaModal/;

  it("every component that renders a dialog calls useDialog", () => {
    const offenders = files
      .filter((f) => DIALOG.test(strip(readFileSync(f, "utf8"))))
      .filter((f) => !/\buseDialog\(/.test(strip(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("every dialog says it is modal", () => {
    const offenders = files
      .filter((f) => /role=["'{]+(?:alert)?dialog/.test(strip(readFileSync(f, "utf8"))))
      .filter((f) => !/aria-modal/.test(strip(readFileSync(f, "utf8"))))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("the shared Drawer is a labelled modal dialog", () => {
    const src = strip(readFileSync(join(ROOT, "components/ui/drawer.tsx"), "utf8"));
    expect(src).toMatch(/role="dialog"/);
    expect(src).toMatch(/aria-modal="true"/);
    expect(src).toMatch(/aria-labelledby=/);
    expect(src).toMatch(/useDialog\(open, onClose, panelRef\)/);
  });

  it("no overlay panel centres itself with a transform Framer will overwrite", () => {
    const offenders = files
      .filter((f) => /<motion\.[a-z]+[^>]*className="[^"]*left-1\/2[^"]*-translate-x-1\/2/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
