import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Sweep C6: deleting a match used window.confirm, which froze the page,
// could not be styled, and offered no Undo. Every native dialog is replaced
// by the Seeded dialog (components/seeded/ui/dialog.tsx), with an Undo toast
// where the action can be reversed. This keeps them out.

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** window.confirm(…), confirm(…), globalThis.alert (…), self.prompt(…) —
 * but not a method of something else (`dialog.confirm()`, `onConfirm(`). */
export const NATIVE_DIALOG = /(?:\b(?:window|globalThis|self)\s*\.\s*|(?<![\w.$]))(?:confirm|alert|prompt)\s*\(/;

describe("no native browser dialogs", () => {
  it("the detector catches every spelling (self-test)", () => {
    for (const s of [
      'if (!window.confirm("Delete?")) return;',
      'if (!confirm("Delete?")) return;',
      'alert("Saved")',
      "const name = prompt('Name?');",
      "globalThis.alert (x)",
      "self.prompt(x)",
    ]) {
      expect(NATIVE_DIALOG.test(s), s).toBe(true);
    }
    for (const s of ["onConfirm()", "dialog.confirm()", "handleConfirm(x)", "<ConfirmDialog", "setAlert(true)", "confirmDelete()"]) {
      expect(NATIVE_DIALOG.test(s), s).toBe(false);
    }
  });

  it("no file in app, components or lib calls one", () => {
    const files = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
    const hits = files
      .map((f) => {
        const m = strip(readFileSync(f, "utf8")).match(NATIVE_DIALOG);
        return m ? `${relative(ROOT, f)}: ${m[0]}` : null;
      })
      .filter(Boolean);
    expect(hits, "use ConfirmDialog from components/seeded/ui/dialog.tsx, plus an Undo toast where the action is reversible").toEqual([]);
  });
});
