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

// `lib` is in this list because it was NOT, and that was the single biggest
// hole in this guard: /privacy's entire body lives in lib/legal/policy.ts,
// so the most honesty-sensitive page on the site was outside the scan. An
// independent verifier planted five banned phrases in one string there —
// "Weekly training plan. Rosters verified Oct 2026. Sent every Sunday. We'll
// email you a weekly report within 48 hours. Browse 68 programs." — and the
// full suite stayed green. Every user-facing string in lib/ (policy copy,
// config, type-level labels) is now scanned too.
const ROOTS = ["components", "app", "lib"];
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
  {
    // Added after a FAQ answer written in this very pass said "Official
    // team rosters and public UTR profiles, WITH THE DATE WE CHECKED."
    // That is the P0-7 claim ("shows its source and date") in words the
    // existing pattern did not match — a reword around a live guard, which
    // CLAUDE.md names as the thing not to do. There is no source field and
    // no date field on `School`.
    // Third widening. "date we LAST checked it" matched none of the first
    // version's alternatives and was live in two more places in the same
    // file the commit said it had corrected — a reword around the guard,
    // sitting inside the fix for a reword around the guard. Also catches
    // "mark the date", which was the same claim on the homepage.
    pattern:
      /date we (?:last )?check(?:ed)?|(?:last|we) checked (?:it|on)|mark(?:s|ed)? the date|checked on \d|as of [A-Z][a-z]{2} \d/i,
    why: "no School record carries a source or a check date; the ranges are unverified estimates",
  },
  {
    // WORKSTREAM D. A projected UTR is an assumption with no data behind
    // it (lib/config/growth.ts says so at length), so no surface may state
    // one as a prediction or a certainty. "You will be 11.7" and "your
    // UTR will reach" are forecasts; "on track for", "projected" and "by
    // junior year" paired with the Estimate chip are not.
    pattern:
      // A bare /guaranteed/ matched two innocents: /methodology saying
      // "there's no guaranteed turnaround" — an honest NEGATION, the
      // opposite of the claim — and an internal `withGuaranteedPlan()`
      // helper. A guard that fires on the denial of the thing it bans is
      // worse than no guard, because the fix is to delete the honesty.
      /\b(?:you'?ll|you will|will be|is going to) (?:be|reach|hit) (?:a )?\d+(?:\.\d+)?\b|\bwe guarantee\b|\bguaranteed (?:results|placement|spot|improvement|offer)\b|\bwe predict\b|\bour prediction\b/i,
    why: "UTR growth is a stated assumption, not a forecast; never promise a future rating",
  },
  {
    // Seeded sends nothing. The weekly family report is a page you open,
    // computed live when you open it — there is no sender, no schedule and
    // no inbox anywhere in this product.
    pattern:
      /\b(?:we'?ll|we will) (?:email|send|text|notify)\b|sent to your inbox|straight to your inbox|delivered (?:every|each)\b/i,
    why: "Seeded has no email or push; the only mail is Supabase Auth's own",
  },
  {
    // Found by the launch UI review: /pricing was selling "Weekly training
    // plan" as a paid feature. Seeded does not generate training plans and
    // is not going to — "No auto-generated training plans, manual calendar
    // only" is a non-negotiable in CLAUDE.md. What exists is a calendar the
    // player fills in, so the feature is called a training calendar.
    //
    // This bans Seeded PROMISING to produce one ("weekly training plan",
    // "your training plan", "we'll weight your training plan"). It does not
    // reach inside /training itself.
    //
    // THE STATED REASON FOR THAT CARVE-OUT DOES NOT FULLY HOLD, and an
    // independent verifier was right to push on it. The argument was "a
    // plan inside /training is a grouping the USER creates" — but
    // components/training/training-view.tsx ships a button labelled
    // "Generate my training week" wired to `generatePersonalizedPlan()`,
    // which writes a week of sessions Seeded invented. Seeded makes that
    // plan, not the user, so the line is crossed inside the exempt scope.
    //
    // It is still carved out here on purpose, because the fix is to DELETE
    // THE GENERATOR, not to rename it — banning the phrase would push
    // someone to relabel the button and leave the behaviour. That is
    // docs/TODO.md #2 and it is a product change, out of scope for a
    // copy pass. Recorded so the exemption is not mistaken for a finding
    // that the feature is fine.
    pattern:
      /weekly training plan|your training plan|training plan (?:for you|toward)|we'?ll weight your training/i,
    why: "Seeded never generates a training plan; the calendar is filled in by hand",
  },
  {
    // The program count must come from getCatalogCounts(), never a literal.
    // /pricing promised "68 D1/D2/D3 programs" while /schools listed 37 —
    // both true (68 is the whole catalogue, 37 is the men's half) and
    // together they read as a broken promise, because neither said which.
    // First version was /\b\d{2,}\s+(?:D1\b[^.]{0,20})?programs\b/i, which
    // required "programs" to follow the number almost immediately. It
    // therefore missed the exact form the pages actually use — a verifier
    // replaced `{ranked.length} {genderLabel} programs.` with the literal
    // "37 men's programs." and the suite stayed green. It also missed
    // "68 schools" and "68 D1, D2 and D3 programs". Now: any 2+ digit
    // number followed, within a short run of words, by programs/schools/
    // teams. Written-out numerals are still a gap and are not worth the
    // false positives.
    // Second attempt. The first was too loose and flagged four innocent
    // strings — "6 of her 12 target schools" in a labelled sample report,
    // "Save 10+ schools across 3 bands" (a goal, not a count), a line of
    // combinedScore arithmetic, and a correction note containing
    // "under-13 account ... cannot see schools". This matches a CATALOGUE
    // SIZE claim specifically: a number followed only by division or
    // gender words before "programs"/"schools"/"teams".
    //
    // `teams?` and `Division I/II/III` were missing from the third version
    // while the comment above it already CLAIMED teams was covered — so
    // "Browse 68 D1 teams across 37 men's teams" shipped past it in a
    // verifier's mutation. A comment describing a regex is not the regex.
    pattern:
      /\b\d{2,}\s+(?:(?:D[123]|Division\s+[IV]+|men's|women's|college|tennis)[,/]?\s*(?:and\s+)?)*(?:programs?|schools?|teams?)\b/i,
    why: "program counts are derived from the catalogue (getCatalogCounts), never typed into copy",
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
