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

const DIALOG = "(?:confirm|alert|prompt)";
const GLOBAL = "(?:window|globalThis|self)";
/** Every way to reach a native dialog, not a method of something else
 * (`dialog.confirm()`, `onConfirm(`):
 *  - a bare call: confirm(…), alert (…)
 *  - ANY reference through the global, called or not: window.confirm(…),
 *    `const c = window.confirm`, `(0, window.alert)(…)`, globalThis.prompt
 *  - bracket access: window["confirm"], self['alert'], window[`prompt`]
 *  - destructuring: const { confirm } = window
 * (The second to fourth were added after the PR C review showed the first
 * version only caught a direct call.) */
export const NATIVE_DIALOG = new RegExp(
  [
    `(?<![\\w.$])${DIALOG}\\s*\\(`,
    `\\b${GLOBAL}\\s*\\.\\s*${DIALOG}\\b`,
    `\\b${GLOBAL}\\s*\\[\\s*["'\`]${DIALOG}["'\`]\\s*\\]`,
    `\\{[^}]*\\b${DIALOG}\\b[^}]*\\}\\s*=\\s*${GLOBAL}\\b`,
  ].join("|")
);

describe("no native browser dialogs", () => {
  it("the detector catches every spelling (self-test)", () => {
    for (const s of [
      'if (!window.confirm("Delete?")) return;',
      'if (!confirm("Delete?")) return;',
      'alert("Saved")',
      "const name = prompt('Name?');",
      "globalThis.alert (x)",
      "self.prompt(x)",
      // the PR C review's bypasses
      'window["confirm"]("Delete?")',
      "if (!self['alert']) return;",
      "window[`prompt`]('x')",
      "const c = window.confirm; c('Delete?');",
      "(0, window.alert)('x')",
      "const ask = globalThis.prompt",
      "const { confirm } = window;",
      "const { alert: say } = globalThis;",
    ]) {
      expect(NATIVE_DIALOG.test(s), s).toBe(true);
    }
    for (const s of [
      "onConfirm()",
      "dialog.confirm()",
      "handleConfirm(x)",
      "<ConfirmDialog",
      "setAlert(true)",
      "confirmDelete()",
      "window.confirmed = true",
      'const { confirmLabel } = props;',
      "role=\"alert\"",
      "windowConfirm()",
    ]) {
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
