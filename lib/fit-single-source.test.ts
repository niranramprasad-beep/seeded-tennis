import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildFitReport, recruitingTimeUtr, type FitView } from "./fit";
import type { SchoolLite } from "./types";

// WORKSTREAM A, GUARD (a) AND (b).
//
// The fit report told a family four things at once. For Men's UTR 8.7,
// Class of 2031 it said, on one screen:
//
//   trajectory panel  "in range: 0 today → 20 by junior year"
//   headline          "You're a realistic target for 0 programs"
//   tabs              "Reach 37 · Target 0 · Likely 0"
//   every row         compared 8.7 to the team's range
//
// Every number was correct about a different question, and nothing on the
// screen said they were different questions. The cause was two parallel
// band systems (countBands in fit.ts, countSchoolFits in school-fit.ts),
// each reachable from any component with whatever rating it happened to
// hold.
//
// (a) asserts the numbers agree, per persona, in BOTH views.
// (b) asserts no component can classify for itself.
//
// (b) is backed by the type system rather than this file: classifySchoolFit
// takes a branded `FitBasis` whose brand symbol is private to
// school-fit.ts, so `classifySchoolFit(8.7, school)` does not compile. This
// test covers what types cannot — that nobody re-exports a way around it.

const SCHOOLS: SchoolLite[] = [
  { slug: "a", minCompetitiveUTR: 12.4, avgRosterUTR: 13.6 },
  { slug: "b", minCompetitiveUTR: 10.9, avgRosterUTR: 12.1 },
  { slug: "c", minCompetitiveUTR: 9.1, avgRosterUTR: 10.4 },
  { slug: "d", minCompetitiveUTR: 7.6, avgRosterUTR: 8.9 },
  { slug: "e", minCompetitiveUTR: 6.2, avgRosterUTR: 7.4 },
  { slug: "f", minCompetitiveUTR: 4.5, avgRosterUTR: 5.8 },
].map((s) => ({ ...s, id: s.slug, name: s.slug, shortName: s.slug }) as unknown as SchoolLite);

// The personas from the brief. These are the inputs a real family types,
// not convenient ones — (a) is the case that produced the bug.
const PERSONAS = [
  { name: "a — Men's 8.7, Class of 2031 (7th grade)", currentUtr: 8.7, graduationYear: 2031, gender: "male" as const },
  { name: "b — Women's 6.0, Class of 2029 (sophomore)", currentUtr: 6.0, graduationYear: 2029, gender: "female" as const },
  { name: "c — Men's 11.0, Class of 2027 (junior)", currentUtr: 11.0, graduationYear: 2027, gender: "male" as const },
  { name: "d — Women's 9.4, Class of 2026 (senior)", currentUtr: 9.4, graduationYear: 2026, gender: "female" as const },
  { name: "e — Men's 4.0, Class of 2030 (beginner)", currentUtr: 4.0, graduationYear: 2030, gender: "male" as const },
];

const NOW = new Date("2026-11-15T12:00:00Z");

describe("(a) every number on the fit report comes from the same arithmetic", () => {
  for (const p of PERSONAS) {
    for (const view of ["recruiting", "today"] as FitView[]) {
      it(`${p.name} · ${view} view`, () => {
        const report = buildFitReport({ ...p, schools: SCHOOLS, view, now: NOW });
        expect(report).not.toBeNull();
        const r = report!;

        // "in range" means target + likely, everywhere. A Reach is a
        // program you are not competitive for yet; counting it would
        // inflate every number a family reads.
        expect(r.inRange).toBe(r.counts.target + r.counts.likely);

        // tab counts === the rows actually rendered under each tab
        for (const band of ["reach", "target", "likely", "out-of-range"] as const) {
          const rows = r.rows.filter((row) => row.band === band).length;
          const key = band === "out-of-range" ? "outOfRange" : band;
          expect(rows, `${band} rows vs ${band} tab count`).toBe(r.counts[key]);
        }

        // every row's band === what bandBySlug hands the row renderer
        for (const row of r.rows) {
          expect(r.bandBySlug.get(row.slug)).toBe(row.band);
        }

        // the trajectory panel's two numbers are the two views' in-range
        // totals, not a third calculation
        expect(r.todayInRange).toBe(r.todayCounts.target + r.todayCounts.likely);
        expect(r.recruitingInRange).toBe(
          r.recruitingCounts.target + r.recruitingCounts.likely
        );
        const selected = view === "recruiting" ? r.recruitingInRange : r.todayInRange;
        expect(r.inRange, "the panel and the tabs must agree").toBe(selected);

        // every school lands in exactly one band
        expect(r.rows.length).toBe(SCHOOLS.length);
        expect(
          r.counts.reach + r.counts.target + r.counts.likely + r.counts.outOfRange
        ).toBe(SCHOOLS.length);
      });
    }
  }

  it("a pre-junior player is judged on junior year by default, a junior on today", () => {
    const young = buildFitReport({ ...PERSONAS[0], schools: SCHOOLS, now: NOW })!;
    expect(young.utr.isProjected).toBe(true);
    expect(young.view).toBe("recruiting");
    expect(young.utr.value).toBeGreaterThan(PERSONAS[0].currentUtr);
    expect(young.utr.assumption, "a projection must carry its assumption").toBeTruthy();

    const junior = buildFitReport({ ...PERSONAS[2], schools: SCHOOLS, now: NOW })!;
    expect(junior.utr.isProjected).toBe(false);
    expect(junior.utr.value).toBe(PERSONAS[2].currentUtr);
    expect(junior.utr.low).toBe(junior.utr.value);
    expect(junior.utr.high).toBe(junior.utr.value);
    expect(junior.utr.assumption, "today's rating is not an estimate").toBeNull();
    expect(junior.canToggle, "nothing to toggle between for a junior").toBe(false);
  });

  it("the reported bug no longer reproduces: a 2031 player is not all-Reach", () => {
    // The brief's exact repro, and the thing a previous round marked
    // "passing" when it was not.
    const r = buildFitReport({ ...PERSONAS[0], schools: SCHOOLS, now: NOW })!;
    expect(r.counts.reach).toBeLessThan(SCHOOLS.length);
    expect(r.counts.target + r.counts.likely).toBeGreaterThan(0);
    // ...and the two views genuinely differ, which is why a toggle exists.
    expect(r.canToggle).toBe(true);
    // The point of the junior-year view: programs that are merely a Reach
    // for a 13-year-old become realistic by the time coaches look.
    expect(r.recruitingInRange).toBeGreaterThan(r.todayInRange);
    expect(r.recruitingCounts.reach).toBeLessThan(r.todayCounts.reach);
  });

  it("no rating means no bands anywhere — null, not zero", () => {
    for (const currentUtr of [null, undefined, 0, -1, Number.NaN]) {
      expect(
        buildFitReport({ currentUtr, graduationYear: 2030, gender: "male", schools: SCHOOLS, now: NOW })
      ).toBeNull();
      expect(
        recruitingTimeUtr({ currentUtr, graduationYear: 2030, gender: "male", now: NOW })
      ).toBeNull();
    }
  });

  it("an explicitly chosen rating is used as given, never projected twice", () => {
    // The what-if slider's value is already a future number.
    const chosen = 11.5;
    const r = buildFitReport({
      ...PERSONAS[0],
      schools: SCHOOLS,
      overrideUtr: chosen,
      now: NOW,
    })!;
    expect(r.utr.value).toBe(chosen);
    expect(r.utr.isProjected).toBe(false);
  });
});

/* ------------------------------------------------------------------ (b) */

const ROOTS = ["components", "app"];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("(b) band classification is reachable only through lib/fit.ts", () => {
  const files = ROOTS.flatMap((r) => sourceFiles(r));

  it("finds the UI tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no component classifies, counts, or mints a basis", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(f === null ? "" : readFileSync(f, "utf8"));
      for (const banned of ["classifySchoolFit", "countSchoolFits", "fitBasis"]) {
        if (new RegExp(`\\b${banned}\\s*\\(`).test(src)) offenders.push(`${f} → ${banned}()`);
      }
    }
    expect(
      offenders,
      "components render bands; lib/fit.ts decides them. Use useFitReport()."
    ).toEqual([]);
  });

  it("fitBasis is minted only by lib/fit.ts and the classifier's own module", () => {
    const libFiles = sourceFiles("lib").filter((f) => !f.includes(".test."));
    const minters = libFiles.filter((f) => /\bfitBasis\s*\(/.test(stripComments(readFileSync(f, "utf8"))));
    // school-fit.ts defines it; fit.ts owns the decision; school-sort and
    // today-actions are lib-level helpers that classify on fit.ts's behalf.
    expect(minters.sort()).toEqual(
      ["lib/fit.ts", "lib/school-fit.ts", "lib/school-sort.ts", "lib/today-actions.ts"].sort()
    );
  });

  it("the brand keeps a raw number from compiling as a basis", () => {
    // Documents what the type system is doing, since a test cannot assert
    // a compile error: FitBasis carries a `unique symbol` brand declared
    // and never exported, so no other module can produce a value of that
    // type with an object literal.
    const src = readFileSync("lib/school-fit.ts", "utf8");
    expect(src).toMatch(/declare const FIT_BASIS_BRAND: unique symbol/);
    expect(src).toMatch(/readonly \[FIT_BASIS_BRAND\]: true/);
    expect(src).toMatch(/export function classifySchoolFit\(\s*\n?\s*basis: FitBasis/);
  });
});
