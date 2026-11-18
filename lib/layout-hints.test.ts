import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROLE_HINT_KEY,
  SCHOOLS_SHAPE_KEY,
  SCHOOLS_SHAPES,
  readSchoolsShape,
  rememberRole,
  rememberSchoolsShape,
  schoolsShapeFor,
} from "@/lib/layout-hints";

const ROOT = join(__dirname, "..");

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("schoolsShapeFor", () => {
  it("a player with a rating sees bands; without one, the Enter-your-UTR banner", () => {
    const base = { isParent: false, hasLinkedPlayer: false, childHasUtr: false };
    expect(schoolsShapeFor({ ...base, hasOwnUtr: true })).toBe("fit");
    expect(schoolsShapeFor({ ...base, hasOwnUtr: false })).toBe("prompt");
  });

  it("a parent's shape follows the child, never the parent's own (absent) rating", () => {
    const base = { isParent: true, hasOwnUtr: false };
    expect(schoolsShapeFor({ ...base, hasLinkedPlayer: true, childHasUtr: true })).toBe("fit");
    // A free family (044 returns the child's rating as NULL) or a child with no rating.
    expect(schoolsShapeFor({ ...base, hasLinkedPlayer: true, childHasUtr: false })).toBe("nofit");
    // No linked player yet (e.g. an under-13 still pending) — the page shows the banner.
    expect(schoolsShapeFor({ ...base, hasLinkedPlayer: false, childHasUtr: false })).toBe("prompt");
    expect(schoolsShapeFor({ isParent: true, hasOwnUtr: true, hasLinkedPlayer: false, childHasUtr: false })).toBe("prompt");
  });
});

describe("the /schools shape hint", () => {
  it("round-trips every shape and ignores anything else in the slot", () => {
    const s = memoryStorage();
    expect(readSchoolsShape(s)).toBeNull();
    for (const shape of SCHOOLS_SHAPES) {
      rememberSchoolsShape(shape, s);
      expect(readSchoolsShape(s)).toBe(shape);
    }
    s.setItem(SCHOOLS_SHAPE_KEY, "1");
    expect(readSchoolsShape(s)).toBeNull();
    rememberSchoolsShape(null, s);
    expect(s.map.has(SCHOOLS_SHAPE_KEY)).toBe(false);
  });

  it("never throws when storage does (private mode), and reads as unknown", () => {
    expect(readSchoolsShape(throwing)).toBeNull();
    expect(() => rememberSchoolsShape("nofit", throwing)).not.toThrow();
    expect(() => rememberRole(null, throwing)).not.toThrow();
    expect(readSchoolsShape(null)).toBeNull();
  });

  it("is cleared with the role on sign-out, and kept while signed in", () => {
    const s = memoryStorage();
    rememberRole("parent", s);
    rememberSchoolsShape("nofit", s);
    rememberRole("parent", s);
    expect(readSchoolsShape(s)).toBe("nofit");
    rememberRole(null, s);
    expect(s.map.has(ROLE_HINT_KEY)).toBe(false);
    expect(s.map.has(SCHOOLS_SHAPE_KEY)).toBe(false);
  });
});

// The head script runs as an inline string before any bundle, so it cannot
// import the constants above. These keep the copies from drifting.
describe("the head script and CSS agree with lib/layout-hints.ts", () => {
  const layout = readFileSync(join(ROOT, "app/layout.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

  it("reads both keys and accepts exactly the known shapes", () => {
    expect(layout).toContain(`localStorage.getItem('${ROLE_HINT_KEY}')`);
    expect(layout).toContain(`localStorage.getItem('${SCHOOLS_SHAPE_KEY}')`);
    for (const shape of SCHOOLS_SHAPES) expect(layout).toContain(`sh==='${shape}'`);
    expect(layout).toContain("setAttribute('data-schools-shape',sh)");
  });

  it("sets the shape only alongside a saved session", () => {
    const session = layout.indexOf("setAttribute('data-session','1')");
    const shape = layout.indexOf("setAttribute('data-schools-shape',sh)");
    expect(session).toBeGreaterThan(-1);
    expect(shape).toBeGreaterThan(session);
    // Same block: the session loop `break`s right after setting the hints.
    expect(layout.slice(session, shape)).not.toContain("break;");
  });

  it("has a pre-session rule for each no-band shape", () => {
    expect(css).toContain('[data-schools-shape="nofit"] .pre-session-bands');
    expect(css).toContain('[data-schools-shape="prompt"] .pre-session-bands');
    expect(css).toContain('[data-schools-shape="prompt"] .pre-session-hide');
    expect(css).toContain('[data-schools-shape="nofit"] .pre-session-parent-nofit-only');
  });
});
