import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Phone sweep (C29): a full-screen overlay rendered inside a page sits in
// AppShell's animated wrapper — its own stacking context — so the z-40
// phone header and tab bar draw OVER it, whatever its z-index. The check-in
// drawer's Save button sat under the tab bar at 320px (C18); the family
// budget modals and the delete-account dialog had the same shape. Every
// full-screen overlay renders through components/ui/portal.tsx.
//
// Exempt, with reasons: the app chrome itself, which is mounted by AppShell
// OUTSIDE the animated wrapper.
const EXEMPT: Record<string, string> = {
  "components/seeded/layout/sidebar.tsx": "Seeded app chrome (incl. the phone tab bar), mounted by AppShell",
  "components/seeded/shared/command-palette.tsx": "mounted by AppShell beside the sidebar, outside the page wrapper",
  "components/ui/portal.tsx": "the portal itself",
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(e) && !e.includes(".test.")) acc.push(full);
  }
  return acc;
}

const OVERLAY = /className=["'`{][^"'`]*\bfixed inset-0\b/;

describe("full-screen overlays render on document.body", () => {
  it("every file that draws a fixed inset-0 layer uses <Portal>", () => {
    const offenders = [...walk("components"), ...walk("app")]
      .filter((f) => !EXEMPT[f])
      .filter((f) => OVERLAY.test(readFileSync(f, "utf8")))
      .filter((f) => !/<Portal>/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the exemptions still exist (a stale entry fails)", () => {
    for (const f of Object.keys(EXEMPT)) expect(() => statSync(f), f).not.toThrow();
  });

  it("the detector sees an overlay (self-test)", () => {
    expect(OVERLAY.test('<div className="fixed inset-0 z-50 bg-black/40" />')).toBe(true);
    expect(OVERLAY.test('<div className="fixed inset-x-0 bottom-0" />')).toBe(false);
  });
});
