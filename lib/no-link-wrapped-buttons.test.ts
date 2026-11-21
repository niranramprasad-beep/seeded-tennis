import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// QA sweep 2026-11-20, M9: <Link> wrapping a <button> ("Edit profile", "Log a
// result" on /plan, "Back to overview" on the weekly report). Invalid nesting,
// two tab stops for one action, both announced. Style the link itself with
// seededLinkButtonClass() (components/seeded/ui/button.tsx).

const ROOT = join(__dirname, "..");
const NESTED = /<(?:Link|a)\b[^>]*>\s*<(?:SeededButton|Button|button)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".tsx") && !name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("no link wraps a button", () => {
  it("the detector sees the shape that shipped (self-test)", () => {
    expect(NESTED.test('<Link href="/settings">\n  <SeededButton variant="secondary">Edit profile</SeededButton>')).toBe(true);
    expect(NESTED.test('<Link href="/settings" className={seededLinkButtonClass("secondary")}>\n  Edit profile')).toBe(false);
  });

  it("on every Seeded screen and app route", () => {
    const hits = [join(ROOT, "components/seeded"), join(ROOT, "app")]
      .flatMap((d) => walk(d))
      .filter((f) => NESTED.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});
