import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Signed in on a phone, the tab bar is fixed to the bottom (57px plus the safe
// area). Anything else pinned to the bottom must sit above it: the schools
// compare bar did not, and "Compare side by side" could not be tapped
// (2026-11-23).

const ROOT = join(__dirname, "..");
const rel = (f: string) => relative(ROOT, f).replace(/\\/g, "/");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

// Pinned to the bottom, and why each is fine. Grow with a reason only.
const ALLOWED: Record<string, string> = {
  "components/seeded/layout/sidebar.tsx": "the tab bar itself",
  "components/seeded/ui/toast.tsx": "bottom-24: above the tab bar already, and it leaves by itself",
};

/** Class strings that pin something to the bottom of the screen: `sticky` or
 *  `fixed` with a `bottom-*` utility, not a full-screen `inset-0` layer. */
export function bottomPinned(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(["'`])((?:(?!\1)[^\\\n])*\b(?:sticky|fixed)\b(?:(?!\1)[^\\\n])*)\1/g)) out.push(m[2]);
  return out.filter((c) => !/\binset-0\b|\binset-y-0\b/.test(c));
}

const CLEARS = /bottom-\[calc\(max\(18px,env\(safe-area-inset-bottom\)\)\+68px(?:\+var\(--verify-banner-clearance,0px\))?\)\]/;

describe("nothing pinned to the bottom hides behind the phone tab bar", () => {
  it("the detector finds pinned class strings (self-test)", () => {
    expect(bottomPinned('className="sticky bottom-4 mt-5"')).toEqual(["sticky bottom-4 mt-5"]);
    expect(bottomPinned('cn("sticky mt-5", x ? "bottom-4" : "")')).toEqual(["sticky mt-5"]);
    expect(bottomPinned('className="fixed inset-0 z-50 bg-black/40"')).toEqual([]);
  });

  it("every file that pins something to the bottom clears the tab bar or says why not", () => {
    const bad: string[] = [];
    for (const f of walk(join(ROOT, "components"))) {
      const src = readFileSync(f, "utf8");
      if (ALLOWED[rel(f)]) continue;
      const pinned = bottomPinned(src).filter((c) => /\bbottom-/.test(c) || (/\bsticky\b/.test(c) && !/\btop-/.test(c)));
      if (pinned.length && !CLEARS.test(src)) bad.push(`${rel(f)}: ${pinned[0].slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });

  it("the compare bar clears the tab bar, and the confirm-email card while it is open", () => {
    const src = readFileSync(join(ROOT, "components/seeded/schools/seeded-schools-browser.tsx"), "utf8").replace(/\s+/g, " ");
    expect(src).toMatch(
      /isAuthed \? "bottom-\[calc\(max\(18px,env\(safe-area-inset-bottom\)\)\+68px\+var\(--verify-banner-clearance,0px\)\)\] lg:bottom-\[calc\(1rem\+var\(--verify-banner-clearance,0px\)\)\]" : "bottom-4"/
    );
    // The card publishes its height while it shows, and takes it back.
    const card = readFileSync(join(ROOT, "components/shared/verify-email-banner.tsx"), "utf8");
    expect(card).toMatch(/setProperty\("--verify-banner-clearance"/);
    expect(card).toMatch(/removeProperty\("--verify-banner-clearance"/);
  });
});
