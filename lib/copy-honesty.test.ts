import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { decodeSourceText } from "./testing/source-text";

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
/**
 * HTML entities are decoded before any pattern runs.
 *
 * This is the single biggest hole these guards have had. JSX escapes
 * apostrophes — the codebase writes `We&apos;ll` and `men&apos;s`
 * everywhere — and every pattern here that contained an apostrophe was
 * therefore blind to the exact spelling the source uses. A verifier
 * shipped "37 men&apos;s programs." (a hardcoded catalogue count) and
 * "We&apos;ll send your weekly report every Sunday." (an email promise)
 * straight past guards written and widened specifically to catch both.
 *
 * Decode first, then match. Otherwise every apostrophe in every pattern
 * below is a hole.
 */
function decodeEntities(src: string): string {
  // Delegates to the shared normaliser, which also decodes what this local
  // version missed: \u2019 / \x27 escapes, numeric entities (&#39;,
  // &#x27;) and JSX joins ({" "}, {"'"}). Template slots are NOT replaced
  // here — several patterns below ban hardcoded counts, and a `${n}` is
  // the opposite of hardcoded.
  return decodeSourceText(src);
}

function strippedSource(file: string): string {
  return decodeEntities(
    readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "")
  );
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
      // "confirmed with each program in October 2026" matched none of the
      // earlier spellings. Any claim that a human checked or confirmed the
      // data, in any tense, is the P0-7 claim.
      // Requires a FIRST-PERSON subject. A bare
      // /checked against the (school)/ fired on /terms telling the USER to
      // "check against the school directly" — advice to go and verify,
      // which is the opposite of claiming we did.
      /date we (?:last )?check(?:ed)?|(?:last|we) checked (?:it|on)|mark(?:s|ed)? the date|checked on \d|as of [A-Z][a-z]+ \d|\bwe (?:confirm|confirmed|verify|verified|validate|validated)\b|rosters? (?:confirmed|verified) (?:with|in)\b/i,
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
      // The first version required a SECOND verb after "will", so "Your
      // rating will be 11.7 by junior year" slipped through: "will be" then
      // a number, with no "be|reach|hit" to follow.
      /\b(?:you'?ll|you will|will|is going to)\s+(?:be|reach|hit|get to)\s+(?:a |around |about )?\d+(?:\.\d+)?\b|\bwe guarantee\b|\bguaranteed (?:results|placement|spot|improvement|offer)\b|\bwe predict\b|\bour prediction\b/i,
    why: "UTR growth is a stated assumption, not a forecast; never promise a future rating",
  },
  {
    // Seeded sends nothing. The weekly family report is a page you open,
    // computed live when you open it — there is no sender, no schedule and
    // no inbox anywhere in this product.
    pattern:
      // "tell" was not in the verb list, so "We'll tell you when a school
      // changes band" shipped — the same P0-7 notification promise the
      // Notifications card was deleted for.
      // Names WHAT is sent, not just the verb. Seeded does send exactly
      // one kind of mail — Supabase Auth's own confirmation and password
      // reset — and "we'll send a secure reset link" on
      // reset-password-form.tsx is true. A bare verb list banned it.
      /\b(?:we'?ll|we will|seeded will) (?:email|e-mail|send|text|notify|tell|alert|ping|message)\s+(?:you\s+)?(?:a |an |the |your )?(?:report|update|digest|summary|alert|reminder|notification|weekly|newsletter|when|if|as soon as)\b|\bwe'?ll let you know\b|sent to your inbox|straight to your inbox|delivered (?:every|each)\b/i,
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
  // ---- 2026-11-15 overnight pass: a methodology the code does not run ----
  // /methodology's opening sentence, the homepage's "How fit works" list
  // and a FAQ answer each described the mockup's target-state model in the
  // present tense. None of these is computed anywhere.
  {
    pattern: /\bdated rosters?\b|real,? dated roster/i,
    why: "no roster is stored and no date exists on any team range",
  },
  {
    pattern: /count(?:s|ing)? (?:who'?s|seniors who|players who) (?:graduat|leav|finish)/i,
    why: "no players-leaving count exists: Seeded stores no per-player rosters",
  },
  {
    pattern: /(?:with|and|gives? you) a confidence (?:level|score)|bands and confidence/i,
    why: "no confidence level is computed or shown for any band",
  },
  {
    pattern: /(?:from|built from|based on) (?:public )?(?:UTR )?profiles|public team rosters/i,
    why: "the team ranges have no published source; DATA_QUALITY rates them UNVERIFIED",
  },
  {
    pattern: /we add academics|academics and your preferences (?:can )?move/i,
    why: "academics and preferences are filters; nothing but UTR moves a band",
  },
  {
    pattern: /calendar (?:your )?parents? can see/i,
    why: "training tables are own-row only under RLS; a parent cannot see the player's calendar",
  },
  {
    pattern: /turn (?:recruiting )?goals into a (?:training )?schedule|balances court work, match play/i,
    why: "Seeded generates no training plan (CLAUDE.md: manual calendar only)",
  },
  {
    pattern: /the real Today screen/i,
    why: "the homepage mock is an example; it must only show actions /today can produce",
  },
  {
    pattern: /Follow-up reminders/i,
    why: "reads as a notification; Seeded sends none — follow-ups are flagged in the app",
  },
  {
    pattern: /lowest reliable (?:player|rating)|highest reliable rating/i,
    why: "describes per-player roster ratings Seeded does not store; it is an estimated floor",
  },
  {
    pattern: /usually covers a year|pays for itself/i,
    why: "an unmeasured claim about what tournaments cost families",
  },
  {
    pattern: /read-only view of the plan/i,
    why: "a parent cannot see /plan; the parent dashboard shows the player's progress",
  },
  {
    // 2026-11-16: the projection target is the summer before senior year.
    pattern: /by junior year|junior[- ]year (?:estimate|UTR|rating|view|projection)|Junior year:/i,
    why: "the projection is to the summer before senior year — say 'by summer 2030', not 'by junior year'",
  },
  // D3 (2026-11-19): sentences the coach-email draft put in a minor's mouth
  // with nothing stored behind them. lib/db/coach-email.test.ts guards the
  // builder structurally; these keep the phrasings out of every file.
  {
    pattern: /following\b.{0,60}\bclosely/i,
    why: "the coach email claimed the player had been following the program closely; they never said so",
  },
  {
    pattern: /the level I want to be competing at/i,
    why: "the coach email stated an ambition the player never entered",
  },
  {
    pattern: /My goal is \S+ tournaments?|happy to send the schedule/i,
    why: "tournaments_goal was a hardcoded signup default (12) until 049; it is now an optional count most players never set, and the coach email does not state it (D3)",
  },
  {
    pattern: /so far this season/i,
    why: "tournaments_played is a column default no screen writes (049 stopped reading it), not a count the player entered",
  },
  {
    pattern: /high on my list/i,
    why: "overstates the stored fact, which is only that the player picked it as a target school",
  },
  {
    pattern: /Right now I'm working on/i,
    why: "the player answered 'What do you want to improve?', not what they are working on today",
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

describe("copy guard reads sentences the way the screen shows them", () => {
  // Each got past the "by junior year" ban on 2026-11-16 (independent
  // verifier): the source split the phrase across lines or wrapped part of
  // it in markup, and the screen still read "by junior year".
  const spellings: [string, string][] = [
    ["split across lines", "<p>\n  Projected by junior\n  year, at typical growth\n</p>"],
    ["markup inside", '<p>Projected by{" "}<b>junior year</b></p>'],
    ["projection noun", "<p>Your junior-year projection</p>"],
    // D3: the coach-email sentences exactly as lib/db/schools.ts spelled them
    // before they were removed — template slots and all.
    ["coach email: following closely", "const programSentence = `I've been following ${school.shortName} closely, and ${school.division} tennis in the ${school.conference} is the level I want to be competing at.`;"],
    ["coach email: tournament goal", "? ` My goal is ${player.tournamentsGoal} tournament${\n player.tournamentsGoal === 1 ? \"\" : \"s\"\n } this season, and I'm happy to send the schedule once it's set.`"],
    ["coach email: tournaments played", "? `I've played ${player.tournamentsPlayed} tournament${\n  player.tournamentsPlayed === 1 ? \"\" : \"s\"\n} so far this season.`"],
    ["coach email: focus", "focus.length > 0 ? `Right now I'm working on ${joinList(focus.slice(0, 2))}.` : \"\";"],
    ["coach email: high on my list", "and I'm reaching out because ${school.shortName} is high on my list."],
  ];
  for (const [label, sample] of spellings) {
    it(`catches ${label}`, () => {
      const text = decodeSourceText(sample);
      expect(BANNED.some(({ pattern }) => pattern.test(text)), text).toBe(true);
    });
  }
});

describe("the tournament fit checker is not a paid perk", () => {
  // Billing listed "Unlimited · tournament fit checks" under BOTH paid plans.
  // Nothing limits the checker on Free — it is a public page doing client-
  // side maths (pricing-data's ALWAYS_FREE_FEATURES) — so "unlimited" on a
  // paid plan implied a Free limit that does not exist. Removed 2026-11-18.
  //
  // Scanned on comment-stripped RAW source, not the decoded text the guards
  // above use: the claim lived in JSX attributes (<Tile value="Unlimited"
  // label="tournament fit checks" />), and decoding strips whole tags, so the
  // BANNED list could never have seen it. If Free ever gets a real limit,
  // delete this block in the same commit that adds the limit.
  const PERK = /\btournament fit checks\b|\bunlimited\b[^\n]{0,60}\btournament fit\b/i;

  it("the detector catches the old attribute spelling (self-test)", () => {
    expect(PERK.test('<Tile value="Unlimited" label="tournament fit checks" />')).toBe(true);
    expect(PERK.test("Unlimited tournament fit checks")).toBe(true);
    expect(PERK.test('{ group: "Planning", label: "Tournament fit checker" }')).toBe(false);
  });

  it("no source calls tournament fit checks a counted or paid perk", () => {
    const offenders = ROOTS.flatMap((r) => sourceFiles(r)).filter((f) =>
      PERK.test(
        readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^[ \t]*\/\/.*$/gm, "")
      )
    );
    expect(offenders).toEqual([]);
  });
});
