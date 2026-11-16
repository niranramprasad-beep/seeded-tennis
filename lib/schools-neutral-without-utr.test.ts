import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifySchoolFit, countSchoolFits, fitBasis } from "@/lib/school-fit";
import { hasRealUtr } from "@/lib/utils";
import { emptyPlayer } from "@/lib/data/user";
import { syntheticUtrHistoryFor } from "@/lib/what-if-utr";

// P0 from the launch UI review: a logged-out visitor opening /schools was
// shown "Reach 37 · Target 0 · Likely 0", every row banded "Reach", and
// "You 0.0" on all 37 range bars — all of it computed against the
// `currentUTR <= 0` sentinel.
//
// This is the regression guard. It has two halves, because either alone
// would be defeatable:
//
//  1. A BEHAVIOURAL proof that the sentinel really does produce a wrong
//     answer, so nobody can argue the guard is theatre and delete it.
//  2. A SOURCE check that the browser gates its derived output on
//     hasRealUtr(), because the rendering itself needs a DOM this suite
//     does not run.
//
// Half 2 is a lint, not a proof — same honest caveat as
// lib/db/family-scope.test.ts carries. It can tell you the gate is
// present; it cannot tell you every branch respects it.

const BROWSER = "components/seeded/schools/seeded-schools-browser.tsx";

const SAMPLE = [
  { minCompetitiveUTR: 9.1, avgRosterUTR: 10.2, usNewsRanking: 10 },
  { minCompetitiveUTR: 7.4, avgRosterUTR: 8.6, usNewsRanking: 40 },
  { minCompetitiveUTR: 11.0, avgRosterUTR: 12.4, usNewsRanking: 4 },
];

describe("the UTR sentinel is detectably wrong, which is why the guard exists", () => {
  it("emptyPlayer carries the sentinel, not a plausible rating", () => {
    expect(emptyPlayer.currentUTR).toBe(0);
    expect(hasRealUtr(emptyPlayer.currentUTR)).toBe(false);
  });

  it("classifying against the sentinel calls every program a Reach", () => {
    const projection = {
      utrHistory: syntheticUtrHistoryFor({ currentUTR: 0, targetUTR: 0, graduationYear: 2028 }),
      graduationYear: 2028,
    };
    const counts = countSchoolFits(fitBasis(0, projection), SAMPLE);
    // This is the bug, asserted: 0 is below every team floor, so the
    // honest classifier honestly reports the whole catalogue as a Reach.
    // That is a true answer to a meaningless question, and showing it to a
    // visitor is the thing being prevented.
    expect(counts.likely).toBe(0);
    expect(counts.target).toBe(0);
    expect(counts.reach + counts.outOfRange).toBe(SAMPLE.length);
  });

  it("a real rating produces a spread of bands, so the guard is not hiding a broken classifier", () => {
    const projection = {
      utrHistory: syntheticUtrHistoryFor({ currentUTR: 10.5, targetUTR: 10.5, graduationYear: 2028 }),
      graduationYear: 2028,
    };
    const bands = new Set(SAMPLE.map((s) => classifySchoolFit(fitBasis(10.5, projection), s)));
    expect(bands.size).toBeGreaterThan(1);
  });
});

// Comments are stripped before any of this is scanned. An earlier version
// did NOT strip them, and an independent verifier pointed out that one of
// the two things satisfying its caption assertion was the explanatory
// COMMENT quoting `You ${effectiveUtr.toFixed(1)}` — the guard was reading
// the prose about the bug as evidence the bug was fixed.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

// M9 from the final verification: a NEW file
// `components/seeded/schools/compare-fit-card.tsx` rendering
// `<FitBadge band={explainSchoolFit(playerUtr > 0 ? playerUtr : 7, …).band}/>`
// and a "You 7.0" caption passed the whole suite, because this file scans
// exactly one path. The old placeholder 7 and a full band set, for a
// visitor with no rating.
//
// So: NO component anywhere may render a FitBadge from anything but a
// checked, nullable band, and the 7 placeholder is banned outright.
describe("no component anywhere renders a band it decided itself", () => {
  const ROOTS = ["components", "app"];
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".tsx") && !full.includes(".test.")) files.push(full);
    }
  })("components");
  for (const r of ROOTS.slice(1)) {
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".tsx") && !full.includes(".test.")) files.push(full);
      }
    })(r);
  }

  it("finds the component tree", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it("every FitBadge band comes from a checked variable, never an inline call", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const m of src.matchAll(/<FitBadge[^>]*band=\{([^}]*)\}/g)) {
        const expr = m[1].trim();
        // `bandBySlug.get(slug)` IS the report and is the intended shape —
        // banning every call flagged it, which would have taught the next
        // person that the guard is noise. What must never appear is a
        // component deciding the band itself, or a numeric rating inline.
        const decidesItself =
          /\b(?:classifySchoolFit|countSchoolFits|fitBasis)\s*\(/.test(expr) ||
          /\b\d+(?:\.\d+)?\b/.test(expr);
        if (decidesItself) offenders.push(`${f}: band={${expr.slice(0, 60)}}`);
      }
    }
    expect(offenders, "bands come from useFitReport, not from an inline call").toEqual([]);
  });

  it("the old placeholder rating of 7 never backs a band or a caption", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, "utf8"));
      // `x > 0 ? x : 7` and friends — the exact shape of the placeholder
      // that lib/family-utr-honesty.test.ts was written about.
      if (/>\s*0\s*\?[^:]{0,40}:\s*7\b/.test(src) || /\?\?\s*7\b/.test(src)) {
        offenders.push(f);
      }
    }
    expect(offenders, "no rating falls back to the placeholder 7").toEqual([]);
  });
});

describe("the schools browser gates every derived output on hasRealUtr", () => {
  const source = stripComments(readFileSync(BROWSER, "utf8"));

  it("derives a single hasUtr flag from hasRealUtr", () => {
    expect(source).toMatch(/const hasUtr = hasRealUtr\(effectiveUtr\)/);
  });

  it("does not classify or count anything itself", () => {
    // Stronger than the assertion this replaces. The browser used to call
    // countSchoolFits and classifySchoolFit behind its own hasUtr gate. It
    // now reads bands from the single report (lib/fit.ts) and classifies
    // nothing — so the gate it used to need is gone, along with the
    // opportunity to get that gate wrong, which is what happened twice.
    for (const banned of ["classifySchoolFit", "countSchoolFits", "fitBasis"]) {
      expect(
        source,
        `the browser must not call ${banned} — read bands from useFitReport`
      ).not.toMatch(new RegExp(`\\b${banned}\\s*\\(`));
    }
    expect(source, "bands must come from the shared report").toMatch(/useFitReport\(/);
  });

  // THE IMPORTANT ONE. The previous version of this file checked the
  // hasUtr declaration, the countSchoolFits gate, the caption, the prompt
  // and the sort — and said nothing at all about the band badge. A
  // verifier replaced the row's gated badge with a bare
  // `<FitBadge band={fit} />`, putting "Reach" on all 37 rows of the
  // logged-out page — the exact headline symptom this file exists to
  // prevent — and the full suite stayed green.
  //
  // Checking each badge's surroundings would just be a better lint. The
  // component instead has ONE gated entry point, and this asserts that
  // invariant: classifySchoolFit is called exactly once, inside bandFor,
  // which returns null without a rating. A band that can be null cannot be
  // handed to FitBadge without the typechecker objecting, so a fourth
  // caller added later is gated by construction rather than by vigilance.
  it("gets every band from the shared report", () => {
    expect(
      [...source.matchAll(/classifySchoolFit\s*\(/g)].length,
      "bands come from the report, not from a local classify"
    ).toBe(0);
    expect(source).toMatch(/const bandFor\s*=[\s\S]{0,200}?report\?\.bandBySlug\.get/);
  });

  it("the only rating in scope is nullable, and the raw player value is not reachable", () => {
    // Two nullable ratings now, for two different jobs: `youUtr` is the
    // VIEWER's own (or their what-if choice), `judgingUtr` is the rating
    // the bands are judged against — the player's own, or their child's
    // when a parent is viewing. Both nullable, neither a raw number.
    expect(source).toMatch(/const youUtr:\s*number \| null = hasUtr \? effectiveUtr : null/);
    expect(source).toMatch(/const judgingUtr:\s*number \| null = report\?\.utr\.value \?\? null/);
    expect(source).toMatch(/const bandFor\s*=/);
    expect(source).toMatch(/const hasFit = report != null/);
    // `player.currentUTR` belongs to the what-if hook's input and nowhere
    // else; every defeat so far has reached for it as a fallback.
    const uses = [...source.matchAll(/player\.currentUTR/g)];
    expect(
      uses.length,
      "player.currentUTR is the sentinel — read it only to seed useWhatIfUtr"
    ).toBe(1);
    const before = source.slice(Math.max(0, uses[0].index! - 120), uses[0].index!);
    expect(before, "the one player.currentUTR read is not the what-if input").toMatch(
      /useWhatIfUtr\(\{[\s\S]*$/
    );
  });

  it("every FitBadge is fed from a nullable band, never from a raw classify", () => {
    for (const m of source.matchAll(/<FitBadge[^>]*band=\{([^}]*)\}/g)) {
      expect(m[1].trim(), "FitBadge must receive a checked band variable").toMatch(/^fit$/);
    }
    // ...and each one sits inside a truthiness check on that variable.
    for (const m of source.matchAll(/<FitBadge/g)) {
      const before = source.slice(Math.max(0, m.index! - 160), m.index!);
      expect(before, "a FitBadge outside a `fit ? ...` branch").toMatch(/fit\s*\?/);
    }
  });

  it("never formats the raw rating — the sentinel is unformattable, not merely guarded", () => {
    // This was a POSITIONAL check (does `hasUtr ?` appear in the 300
    // characters before the caption) and a verifier defeated it: with the
    // caption de-gated, the `youPct={hasUtr ? ...}` line directly above it
    // still satisfied the window. A guard that can be satisfied by a
    // NEIGHBOUR is not checking the thing it names.
    //
    // Structural instead: `effectiveUtr` is never formatted or plotted
    // anywhere in this file. Everything user-visible goes through
    // `youUtr`, which is `number | null`, so `.toFixed()` on the raw
    // value does not typecheck — the compiler enforces this and the test
    // only stops someone removing the seam.
    expect(source, "format youUtr, not the raw effectiveUtr").not.toMatch(
      /effectiveUtr\s*\.\s*toFixed/
    );
    expect(source).toMatch(/const youUtr:\s*number \| null = hasUtr \? effectiveUtr : null/);
    for (const m of source.matchAll(/toFixed\(/g)) {
      const before = source.slice(Math.max(0, m.index! - 40), m.index!);
      expect(
        before,
        "a .toFixed() on something other than youUtr or a real team number"
      ).toMatch(
        /youUtr|judgingUtr|range\.(min|max)|avgRosterUTR|minCompetitiveUTR|gapTo\w+|\bexplanation\./
      );
    }
  });

  it("a parent is shown their player's fit, not their own absent rating", () => {
    // Persona (f): the parent's own nav links to /schools, and a parent
    // has no UTR, so the page banded 37 programs against nothing while
    // the Overview tab beside it said "Bailey's recruiting".
    expect(source).toMatch(/viewingAsParent/);
    expect(source).toMatch(/resolveFamilyPlayerFacts/);
    expect(source, "the heading must say whose fit this is").toMatch(
      /Sorted by fit for \$\{subjectName\}/
    );
  });

  it("shows the visitor how to get a fit instead of a zero", () => {
    expect(source).toMatch(/Enter your UTR to see your fit/);
  });

  it("does not sort by gap or fit without a rating, and says so in the control", () => {
    // Asserts the SEAM, not one spelling of the condition: a single
    // `safeSort` that both the list and the <select> read, so the dropdown
    // cannot display an order the rows are not in. The control used to
    // accept "Gap (closest first)", persist it, and leave the catalogue in
    // default order.
    expect(source).toMatch(/const safeSort:\s*SeededSchoolSort\s*=/);
    expect(source).toMatch(/hasFit[\s\S]{0,80}?:\s*"default"/);
    expect(source, "the list must sort by safeSort").toMatch(
      /sortSchoolsForSeeded\(\s*filtered,\s*safeSort/
    );
    expect(source, "the select must display safeSort, not the raw stored sort").toMatch(
      /value=\{safeSort\}/
    );
  });
});
