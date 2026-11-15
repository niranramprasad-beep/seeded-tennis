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
    // P0-8 UPDATE (2026-11-14): the reason this is banned CHANGED, so the
    // entry stays but the explanation had to be rewritten. Deletion is now
    // real (migration 029, delete_my_account) — but it is IMMEDIATE. A
    // 30-day promise is still false, now in the other direction: it would
    // tell someone their data lingers for a month when it is already gone,
    // and it would imply a purge job that still does not exist.
    why: "deletion is immediate (029); nothing is queued and nothing takes 30 days",
  },
  {
    // Straight out of the pricing mockup. Nothing in the product or in Whop
    // checks who owns the card — a 16-year-old can pay with their own — so
    // this is a claim about a control that does not exist. The true version
    // is on /pricing: under-13 accounts need a parent's consent, which the
    // database does enforce (migration 030).
    pattern: /billed to a (?:parent|guardian)|under 18 are billed/i,
    why: "nobody checks who pays; there is no parent-billing control",
  },
  {
    // "Two clicks" is a measurement of Whop's UI, which we do not own and
    // cannot keep true.
    pattern: /cancel in two clicks|cancel in one click/i,
    why: "cancellation happens in Whop's UI; we cannot promise its click count",
  },
  {
    pattern: /(?:deleted|removed) within \d+ days|deletion (?:is |will be )?scheduled|queued for deletion/i,
    why: "deletion is immediate; there is no grace period, queue or scheduled job",
  },
  {
    // P0-8. The consent flow states plainly that Seeded cannot check any of
    // this. These patterns catch the affirmative claim only — the honest
    // negation ("Seeded can't verify that you are an adult") must keep
    // passing, which is why none of them match the word "verify" alone.
    pattern: /\bverified parent\b|\bparent verification\b|we verify (?:that )?you/i,
    why: "there is no adult or parent verification of any kind; consent is a stated claim",
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
