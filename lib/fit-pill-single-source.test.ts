import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  FIT_BAND_ICON,
  FIT_BAND_LABEL,
  FIT_BAND_RULE,
  FIT_RANGE_RULE,
} from "@/components/seeded/ui/fit-badge";
import { classifySchoolFit, fitBasis, SCHOOL_FIT_BAND_LABEL } from "./school-fit";
import { PLANNING_PACE_CAP_PER_YEAR } from "./fit";
import { HelpCircle, Lock } from "lucide-react";

// Herdy's design review (2026-11-22): ONE fit band pill. Every
// Likely / Target / Reach / Out of range — and "No UTR yet" / "Locked" — is
// drawn by components/seeded/ui/fit-badge.tsx or reads its label, colour and
// icon from there. Before this there were four tables of the same words and
// tints (the pill, the schools filter chips, the onboarding report, the
// landing calculator) and a `label` override that put a question mark on a
// rating that was locked, not unknown.

const ROOT = join(__dirname, "..");
const PILL = "components/seeded/ui/fit-badge.tsx";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}
const FILES = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d))).map((f) => relative(ROOT, f));
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

const BAND_WORDS = ["Likely", "Target", "Reach", "Out of range", "No UTR yet"];

describe("one fit pill", () => {
  it("no other file keeps its own band → label table", () => {
    const table = /\b(?:likely|reach)\s*:\s*["'`](?:Likely|Reach)["'`]|["']out-of-range["']\s*:\s*["'`]Out of range["'`]/;
    const offenders = FILES.filter((f) => f !== PILL && f !== "lib/school-fit.ts" && table.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no other file keeps its own band → colour table", () => {
    // `reach: "…clay-tint…"` / `likely: { on: "…sage-tint…" }` — the shape
    // the schools filter chips used to carry.
    const tone = /\b(?:reach|likely)\s*:\s*\{?\s*(?:on\s*:\s*)?["'`][^"'`]*(?:clay|sage)-tint/;
    const offenders = FILES.filter((f) => f !== PILL && f.endsWith(".tsx") && tone.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no element styled as a pill spells out a band word itself", () => {
    const offenders: string[] = [];
    for (const f of FILES.filter((x) => x.endsWith(".tsx") && x !== PILL && !x.startsWith("components/dev/"))) {
      const sf = ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node)) {
          const cls = node.openingElement.attributes.properties
            .find((p) => ts.isJsxAttribute(p) && p.name.getText() === "className")
            ?.getText() ?? "";
          if (/rounded-pill/.test(cls)) {
            const text = node.children
              .filter(ts.isJsxText)
              .map((t) => t.getText().trim())
              .join(" ");
            for (const w of BAND_WORDS) {
              if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(text)) {
                offenders.push(`${f}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} "${w}"`);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    expect(offenders).toEqual([]);
  });

  it("FitBadge takes a state, not a free-text label override", () => {
    const src = read(PILL);
    expect(src).not.toMatch(/label\?\s*:\s*string/);
    for (const f of FILES.filter((x) => x.endsWith(".tsx"))) {
      expect(read(f), f).not.toMatch(/<FitBadge\b[^>]*\blabel=/);
    }
  });

  it("the locked state is a padlock, never a question mark", () => {
    expect(FIT_BAND_ICON.locked).toBe(Lock);
    expect(FIT_BAND_ICON.locked).not.toBe(HelpCircle);
    expect(FIT_BAND_LABEL.locked).toMatch(/Locked/);
  });

  it("band words come from lib/school-fit.ts, the same words its sentences use", () => {
    for (const band of ["likely", "target", "reach", "out-of-range"] as const) {
      expect(FIT_BAND_LABEL[band]).toBe(SCHOOL_FIT_BAND_LABEL[band]);
    }
  });
});

describe("the pill's words match the rule the code applies", () => {
  const school = { minCompetitiveUTR: 9, avgRosterUTR: 10 };
  const NOW = new Date(2026, 10, 22);
  // A real three-point history (never an undefined projection — CLAUDE.md).
  const history = (a: number, b: number, c: number) => [
    { date: new Date(2026, 0, 1), utr: a },
    { date: new Date(2026, 5, 1), utr: b },
    { date: new Date(2026, 10, 1), utr: c },
  ];
  const projection = (h: ReturnType<typeof history>) => ({
    utrHistory: h,
    graduationYear: 2029,
    now: NOW,
    paceCapPerYear: PLANNING_PACE_CAP_PER_YEAR,
  });
  const basis = (utr: number, h = history(utr, utr, utr)) => fitBasis(utr, projection(h));

  it("Likely starts AT the middle; Target starts AT the floor", () => {
    expect(classifySchoolFit(basis(10), school)).toBe("likely");
    expect(classifySchoolFit(basis(9.99), school)).toBe("target");
    expect(classifySchoolFit(basis(9), school)).toBe("target");
    expect(FIT_BAND_RULE.likely).toMatch(/at or above the middle/);
    expect(FIT_BAND_RULE.target).toMatch(/at or above the floor/);
    expect(FIT_BAND_RULE.target).toMatch(/below its middle/);
  });

  it("Reach / Out of range name the projection, its cap and its date", () => {
    for (const band of ["reach", "out-of-range"] as const) {
      expect(FIT_BAND_RULE[band]).toMatch(/below the floor/);
      expect(FIT_BAND_RULE[band]).toContain(String(PLANNING_PACE_CAP_PER_YEAR));
      expect(FIT_BAND_RULE[band]).toMatch(/summer before senior year/);
    }
    // classifySchoolFit: fewer than three real points cannot prove a gap is
    // unclosable, so it stays Reach — the tooltip says so.
    expect(FIT_BAND_RULE.reach).toMatch(/fewer than three ratings/);
    // A flat 7.0 never reaches a 9.0 floor; a rising line capped at 1.5/yr
    // from 8.6 does by summer 2028.
    expect(classifySchoolFit(basis(7), school)).toBe("out-of-range");
    expect(classifySchoolFit(basis(8.6, history(7.6, 8.1, 8.6)), school)).toBe("reach");
  });

  it("the range is defined as DATA_QUALITY.md's second source defines it", () => {
    expect(FIT_RANGE_RULE).toMatch(/lower quartile/);
    expect(FIT_RANGE_RULE).toMatch(/median/);
    expect(FIT_RANGE_RULE).toMatch(/highest/);
    // Legacy rows keep their honesty label.
    expect(FIT_RANGE_RULE).toMatch(/Unverified estimate/);
  });

  it("a band is never a percent", () => {
    for (const s of [...Object.values(FIT_BAND_RULE), ...Object.values(FIT_BAND_LABEL), FIT_RANGE_RULE]) {
      expect(s).not.toMatch(/%|percent|chance/i);
    }
  });

  it("the methodology legend reads the pill's rule, not its own copy", () => {
    const src = read("components/seeded/methodology/seeded-methodology-view.tsx");
    expect(src).toMatch(/FIT_BAND_RULE\[band\]/);
    expect(src).toMatch(/FIT_RANGE_RULE/);
  });
});
