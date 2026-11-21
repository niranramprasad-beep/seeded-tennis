import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CONSENT_PENDING_TARGETS_MESSAGE, targetSchoolEditRefusal } from "./config/consent";

// QA sweep 2026-11-20, H1 (UI half). A consent-pending under-13 could add
// target schools from /schools — a public page, so ConsentPendingScreen
// (AuthGate) never covered it. The database half (a profiles trigger) is a
// separate migration; this guards the UI half only.

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("targetSchoolEditRefusal", () => {
  it("refuses only a pending account", () => {
    expect(targetSchoolEditRefusal("pending")).toBe(CONSENT_PENDING_TARGETS_MESSAGE);
    for (const s of ["granted", "not_required", "unknown", undefined] as const) {
      expect(targetSchoolEditRefusal(s), String(s)).toBeNull();
    }
  });

  it("uses the consent screen's words and claims nothing about the database", () => {
    expect(CONSENT_PENDING_TARGETS_MESSAGE).toMatch(/^A parent needs to say yes first\./);
    expect(read("components/seeded/family/consent-pending-screen.tsx")).toContain(
      "A parent needs to say yes first"
    );
    expect(CONSENT_PENDING_TARGETS_MESSAGE).not.toMatch(/database|blocked|refused|server/i);
  });
});

describe("every target add/remove path checks consent", () => {
  it("useStarSchools refuses before writing, in toggleStar AND addManyToTargets", () => {
    const src = read("lib/hooks/use-star-schools.ts");
    // Signed in: refused until the consent check answers (review of PR #18).
    expect(src).toMatch(/signedInTargetEditRefusal\(consent\?\.status, Boolean\(consentError\)\)/);
    for (const fn of ["const toggleStar", "const addManyToTargets"]) {
      const body = src.slice(src.indexOf(fn));
      const refusal = body.indexOf("if (consentRefusal)");
      const write = body.indexOf("updatePlayer(");
      expect(refusal, fn).toBeGreaterThan(-1);
      expect(refusal, `${fn}: refusal must come before the first write`).toBeLessThan(write);
    }
  });

  it("no other component writes targetSchoolSlugs except behind AuthGate's consent screen", () => {
    // seeded-roadmap-layout's drag-to-reorder lives on /plan, which AuthGate
    // replaces with ConsentPendingScreen for a pending account. Legacy and
    // dev-only views are not part of the Seeded UI.
    const ALLOWED = new Set(["components/seeded/roadmap/seeded-roadmap-layout.tsx"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${entry}`;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) {
          const src = read(rel);
          if (/updatePlayer\(\s*\{[^}]*targetSchoolSlugs/.test(src) && !ALLOWED.has(rel)) offenders.push(rel);
        }
      }
    };
    walk("components/seeded");
    walk("app");
    expect(offenders).toEqual([]);
  });
});
