import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { plural } from "./utils";

// Sweep C26: "1 matches logged". Every screen hand-rolled `${n} …s`. One
// helper now, and a scan for the hand-rolled shape where the number can be 1.

describe("plural()", () => {
  it("uses the singular for exactly one, the plural otherwise", () => {
    expect(plural(1, "match", "matches")).toBe("1 match");
    expect(plural(0, "match", "matches")).toBe("0 matches");
    expect(plural(2, "match", "matches")).toBe("2 matches");
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(-1, "day", "days")).toBe("-1 days");
  });
});

const ROOT = join(__dirname, "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

const NOUNS =
  "matches|sessions|schools|programs|targets|entries|results|check-ins|checkins|days|hours|minutes|weeks|months|members|requests|notes|tournaments|expenses|coaches|emails|players";

/** `{list.length} schools`, `${count} matches`, `{n} days ago` — a count
 * expression straight into a plural noun. Literal numbers and catalog totals
 * are not counts that can be 1. */
export const HAND_ROLLED = new RegExp(
  String.raw`\$?\{\s*([^{}]*?(?:\.length|[cC]ount\b|\b(?:n|mins|minutes|hours|days|weeks)\b)[^{}]*?)\s*\}\s+(?:${NOUNS})\b`
);

// Counts that can never be 1, each with the reason.
const ALLOWED: Record<string, string> = {
  "counts.total": "the whole catalogue, hundreds of programs",
  "c.total": "the whole catalogue",
};

describe("no hand-rolled plurals", () => {
  it("the detector sees the shapes that shipped (self-test)", () => {
    for (const s of [
      "{`${matches.length} matches logged`}",
      "{targetSchools.length} programs",
      "return `${mins} minutes ago`;",
      "On track for {onTrackCount} of {targetSchools.length} targets",
      "`in about ${minutes} minutes`",
    ]) {
      expect(HAND_ROLLED.test(s), s).toBe(true);
    }
    for (const s of ['plural(matches.length, "match", "matches")', "{counts.total} programs", "Free tracks 3 schools"]) {
      const m = s.match(HAND_ROLLED);
      expect(!m || Object.keys(ALLOWED).includes(m[1].trim()), s).toBe(true);
    }
  });

  it("every count that meets a noun goes through plural()", () => {
    const files = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
    const hits: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f);
      // Legacy design, slated for deletion (docs/TODO.md); not on any Seeded screen.
      if (/^components\/(home|roadmap|coaches|cost|parents|tournaments|onboarding|dashboard\/dashboard-view)/.test(rel)) continue;
      if (rel.startsWith("components/dev/") || rel.startsWith("app/dev/")) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(new RegExp(HAND_ROLLED, "g"))) {
        if (ALLOWED[m[1].trim()]) continue;
        hits.push(`${rel}: ${m[0]}`);
      }
    }
    expect(hits, 'use plural(n, "match", "matches") from lib/utils.ts').toEqual([]);
  });
});
