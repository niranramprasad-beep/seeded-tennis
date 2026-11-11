import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Regression guard for P0-7. The site promised a set of things the code
// cannot do: rosters that had been "verified Oct 2026", a per-rating "source
// and date", a Sunday parent email, notification toggles, a public recruiting
// page, deletion that "removes everything within 30 days", "all D1 programs",
// and a 48-hour fix turnaround. None of it existed.
//
// Copy drifts back more easily than code does — marketing lines get reworded
// by someone who wasn't here for the audit. So this scans the actual source
// of every shipped component/route for the phrasings, and fails the build.
//
// If a claim here BECOMES true (a real email provider, a real deletion job, a
// sourced roster import), delete its entry deliberately in the same commit
// that makes it true. Don't reword around the check.

const ROOTS = ["components", "app"];
const EXTS = [".tsx", ".ts"];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (EXTS.some((e) => entry.endsWith(e)) && !entry.includes(".test.")) {
      acc.push(full);
    }
  }
  return acc;
}

// Comments are allowed to quote the old copy verbatim — that's how we record
// what was removed and why, and those notes are the main defense against
// someone reintroducing it. So only live code is checked. Block comments are
// stripped as blocks (a `{/* … */}` JSX note spans lines and its middle lines
// start with ordinary prose, so a line-by-line prefix filter misses them).
function strippedSource(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const BANNED: { pattern: RegExp; why: string }[] = [
  {
    pattern: /Rosters verified/i,
    why: "no roster has been verified and no verification date is stored",
  },
  {
    pattern: /shows its source and date|source and verification date/i,
    why: "schools carry no source or date field",
  },
  {
    pattern: /Sunday email|weekly email|we'll email you|email you (?:a|the) /i,
    why: "Seeded sends no email; only Supabase Auth's own confirmation/reset mail exists",
  },
  {
    pattern: /Sent every Sunday/i,
    why: "nothing is sent; the parent report is a page you open",
  },
  {
    pattern: /within 48 hours/i,
    why: "no ticketing and no on-call — we cannot hold ourselves to a turnaround",
  },
  {
    pattern: /Removes everything within 30 days/i,
    why: "deletion only sets deletion_requested_at; no purge job exists",
  },
  {
    pattern: /all D1 (?:tennis )?(?:programs|schools)|Browse all D1/i,
    why: "the catalog is 68 programs, not all of D1",
  },
  {
    pattern: /compares you to real rosters|Every program with real roster/i,
    why: "the comparison is against unverified team UTR estimates, not real rosters",
  },
  {
    pattern: /verified (?:singles )?(?:rating|result)s?\b/i,
    why: "UTR entries are self-reported; Seeded never checks them",
  },
];

describe("no user-facing copy promises something the code can't do", () => {
  const files = ROOTS.flatMap((r) => sourceFiles(r));

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const { pattern, why } of BANNED) {
    it(`never says ${pattern.source} — ${why}`, () => {
      const offenders = files
        .filter((f) => pattern.test(strippedSource(f)))
        .map((f) => f);
      expect(offenders).toEqual([]);
    });
  }
});
