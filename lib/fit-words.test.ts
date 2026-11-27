// The words a player reads about fit (Niran, 2026-11-27): no "band" on any
// screen, the four tiers named Safe bet / Good match / Stretch / Long shot,
// every explanation said as the real comparison, and a college player's UTR
// only ever a whole number on the school page. Clearly-fake data only.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { SCHOOL_FIT_BAND_LABEL } from "./school-fit";
import { fitComparisonSentence, type JudgingRating } from "./fit-copy";
import type { SchoolLite } from "./types";

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(e) && !e.includes(".test.")) acc.push(full);
  }
  return acc;
}
const FILES = [...walk("app"), ...walk("components"), ...walk("lib")];

/** Every string literal, template text and JSX text in a file — what can
 *  reach a screen. Comments and identifiers are not scanned. */
function textsOf(file: string): { line: number; text: string; className: boolean }[] {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: { line: number; text: string; className: boolean }[] = [];
  const visit = (n: ts.Node) => {
    let text: string | null = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
    else if (ts.isTemplateExpression(n)) text = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" ");
    else if (ts.isJsxText(n)) text = n.text;
    if (text != null && !(n.parent && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent)))) {
      const attr = n.parent && ts.isJsxAttribute(n.parent) ? n.parent.name.getText() : null;
      out.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text, className: attr === "className" });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// Not words a person reads: a CSS hook class and the engine's own file name.
const NOT_COPY = new Set(["lib/fit/engine-files.ts"]);

describe("no 'band' on any screen", () => {
  it("no string, template or JSX text says band / bands", () => {
    const hits: string[] = [];
    for (const f of FILES) {
      if (NOT_COPY.has(f)) continue;
      for (const t of textsOf(f)) {
        if (t.className) continue;
        if (/\bband(s|ed|ing)?\b/i.test(t.text.replace(/\bpre-session-bands\b/g, ""))) hits.push(`${f}:${t.line} ${t.text.trim().slice(0, 80)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("no screen names a fit tier the old way (Likely / Target / Reach / Out of range)", () => {
    // "Target schools" is the saved list, "Reach out" a verb, and the
    // tournament checker's "Out of range" a draw, not a school.
    // Allowed phrases are removed match by match, so "a Reach. Target
    // schools need work." still fails on its "Reach".
    const ALLOWED = /Target schools|Target-school|Targets start|Reach out/g;
    const hits: string[] = [];
    for (const f of FILES) {
      if (f.startsWith("components/seeded/methodology/tournament-checker-section")) continue;
      for (const t of textsOf(f)) {
        if (t.className) continue;
        const rest = t.text.replace(ALLOWED, "");
        if (/\b(Likely|Reach|Target)\b/.test(rest) || /\bout of range\b/i.test(rest)) {
          hits.push(`${f}:${t.line} ${t.text.trim().slice(0, 80)}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("the four tier names are Niran's", () => {
    expect(SCHOOL_FIT_BAND_LABEL).toEqual({ likely: "Safe bet", target: "Good match", reach: "Stretch", "out-of-range": "Long shot" });
  });

  it("the school page heading is 'Your chances here'", () => {
    const src = readFileSync("components/seeded/schools/seeded-school-detail.tsx", "utf8");
    expect(src).toMatch(/"Your chances here"/);
  });
});

describe("fitComparisonSentence — the real comparison, said plainly", () => {
  const checked = {
    shortName: "Fake U", minCompetitiveUTR: 10.4, avgRosterUTR: 11, utrRange: { low: 10.4, middle: 11, high: 12.1 },
  } as unknown as SchoolLite;
  const estimated = { shortName: "Est U", minCompetitiveUTR: 9, avgRosterUTR: 10.2, utrRange: null } as unknown as SchoolLite;
  const plan: JudgingRating = { utr: 11.5, basis: { kind: "plan", year: 2027 } };
  const est: JudgingRating = { utr: 8.7, basis: { kind: "estimate", year: 2027 } };

  it("one sentence per tier, naming the rating, the range and whether it is a realistic shot", () => {
    expect(fitComparisonSentence(plan, checked, "likely")).toBe(
      "Your plan UTR (11.50 by summer 2027) is at or above the middle of Fake U's UTR range (10.4–12.1). Safe bet: a realistic shot."
    );
    expect(fitComparisonSentence({ ...plan, utr: 10.6 }, checked, "target")).toBe(
      "Your plan UTR (10.60 by summer 2027) is inside Fake U's UTR range (10.4–12.1). Good match: a realistic shot."
    );
    expect(fitComparisonSentence(est, checked, "reach")).toBe(
      "Your estimated UTR (8.7 by summer 2027) is below Fake U's UTR range (10.4–12.1). Stretch: not a realistic shot yet. It would take a climb to the floor by the summer before senior year."
    );
    expect(fitComparisonSentence(est, checked, "out-of-range", "Avery")).toBe(
      "Avery's estimated UTR (8.7 by summer 2027) is below Fake U's UTR range (10.4–12.1). Long shot: not a realistic shot by the summer before senior year at the pace we plan with."
    );
  });

  it("Stretch promises no pace: it is also the tier when fewer than three ratings are logged (verifier HIGH 2)", () => {
    for (const j of [est, plan, { utr: 9, basis: { kind: "today" } } as JudgingRating]) {
      expect(fitComparisonSentence(j, checked, "reach")).not.toMatch(/\bpace\b|gets? (you|them) (there|to)/);
    }
  });

  it("judged on today's rating (the date has passed), the sentence names no date", () => {
    const today: JudgingRating = { utr: 9, basis: { kind: "today" } };
    for (const band of ["reach", "out-of-range"] as const) {
      expect(fitComparisonSentence(today, checked, band)).not.toMatch(/summer before senior year/);
    }
  });

  it("an unchecked team: the estimated floor and middle, never a drawn top (verifier MEDIUM)", () => {
    const s = fitComparisonSentence(est, estimated, "target")!;
    expect(s).toContain("Est U's estimated range (floor 9.0, middle 10.2)");
    expect(s).not.toMatch(/11\.4/); // the drawn top, avg + (avg − floor)
  });

  it("no rating or no tier → null (the caller shows its own prompt)", () => {
    expect(fitComparisonSentence(null, checked, "likely")).toBeNull();
    expect(fitComparisonSentence(plan, checked, "unverified")).toBeNull();
    expect(fitComparisonSentence(plan, checked, null)).toBeNull();
  });
});

describe("the school page: college players as whole numbers, nothing 'Not tracked'", () => {
  it("the U.S. News line is printed only when there is a rank (its null text says 'not tracked')", () => {
    const src = readFileSync("components/seeded/schools/seeded-school-detail.tsx", "utf8");
    const calls = [...src.matchAll(/academicRankSentence\(/g)];
    expect(calls).toHaveLength(1);
    expect(src).toMatch(/school\.usNewsRanking !== null \? \(\s*<p[^>]*>\{academicRankSentence\(school\.usNewsRanking\)\}/);
  });

  it("the roster loader hands the page only toRosterPlayer's output", () => {
    const src = readFileSync("lib/db/roster.ts", "utf8");
    expect(src).toMatch(/return \{ players: sortRoster\(players\)\.map\(toRosterPlayer\), staff: members \};/);
    expect(src).toMatch(/export async function loadProgramRosterPage\([^)]*\): Promise<ProgramRosterPage>/);
    expect(src).toMatch(/players: RosterPlayer\[\];/);
    expect(src).not.toMatch(/hometown/);
  });

  it("the roster table has no Hometown column and prints the whole number with a profile link", () => {
    const src = readFileSync("components/seeded/schools/school-roster.tsx", "utf8");
    expect(src).not.toMatch(/hometown/i);
    expect(src).toMatch(/\{p\.utrWhole\}\.xx/);
    expect(src).toMatch(/target="_blank"/);
    expect(src).not.toMatch(/toFixed\(/);
  });

  it("no school screen prints 'Not tracked' / 'Location not tracked' for a school field", () => {
    for (const f of [
      "components/seeded/schools/seeded-school-detail.tsx",
      "components/seeded/schools/school-roster.tsx",
      "components/seeded/schools/seeded-schools-browser.tsx",
      "components/seeded/onboarding/seeded-pre-auth-onboarding.tsx",
    ]) {
      const hits = textsOf(f).filter((t) => /Location not tracked|Cost and aid: Not tracked/.test(t.text));
      expect(hits, f).toEqual([]);
    }
    const detail = textsOf("components/seeded/schools/seeded-school-detail.tsx").filter((t) => /^Not tracked$/.test(t.text.trim()));
    expect(detail).toEqual([]);
  });
});
