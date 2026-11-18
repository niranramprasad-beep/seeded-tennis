import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeOnly } from "./testing/source-text";

// The /onboarding diagnostic shows a projected UTR on one screen and a fit
// report judged at it on the next. They agree only because ONE function,
// lib/fit.ts's diagnosticProjection(), produces the number. The same rule as
// lib/fit-single-source.test.ts: components render, lib/fit.ts decides.
//
// So nothing under components/seeded/onboarding/ may
//   (a) import a growth/pace/projection internal and do its own projecting;
//   (b) do arithmetic on a UTR, a pace or a projection.

const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "components/seeded/onboarding");

function files(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, acc);
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) acc.push(full);
  }
  return acc;
}

/** Code with comments, quoted strings and the static parts of template
 * literals removed — `${…}` slots are kept, they are code. */
export function codeWithoutText(src: string): string {
  return src
    .replace(/`(?:[^`\\]|\\.)*`/g, (t) => (t.match(/\$\{[^}]*\}/g) ?? []).join(" "))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

const UTR_WORD = /utr|pace|projection|projected/i;
/** A TEAM's published-range fields (sorting schools by floor) are not the
 * player's rating; everything else with "utr" in it is. */
const TEAM_FIELD = /\w*(?:Competitive|Roster)UTR\b/g;
const namesUtr = (operand: string) => UTR_WORD.test(operand.replace(TEAM_FIELD, ""));

/** Every binary + - * / % whose either operand names a UTR-ish value. */
export function utrArithmetic(code: string): string[] {
  const hits: string[] = [];
  const re = /([\w$.?!\])]+)\s*([-+*/%])(?![-+=>*/])\s*([\w$.(!]+)/g;
  for (const m of code.matchAll(re)) {
    const [whole, left, , right] = m;
    if (namesUtr(left) || namesUtr(right)) hits.push(whole.trim());
  }
  return hits;
}

const BANNED_IMPORTS = [
  "computeUtrProjection",
  "realisticPaceProjectionFor",
  "computePlusPaceUTR",
  "computeMyPaceUTR",
  "syntheticUtrHistoryFor",
  "clampToRealisticUtr",
  "projectUtrAtRecruiting",
  "recruitingTimeUtr",
  "yearsUntilRecruiting",
  "UTR_GROWTH_PER_YEAR",
  "REALISTIC_UTR_IMPROVEMENT_PER_YEAR",
  "REALISTIC_UTR_CEILING",
];

describe("the onboarding UI does no UTR arithmetic of its own", () => {
  it("the detector catches the shapes it must (self-test)", () => {
    for (const s of [
      "const pace = (todayUtr - yearAgoUtr) / 12;",
      "const v = values.utrToday * 2;",
      "x = utr + 1.5 * years",
      "projection.value + 0.5",
      "{answers.utrToday! - 1}",
      "const n = 3 * pacePerMonth;",
      "a.minCompetitiveUTR - utrToday",
    ]) {
      expect(utrArithmetic(codeWithoutText(s)), s).not.toEqual([]);
    }
    for (const s of [
      "utrToPct((range.min + range.max) / 2)",
      "setStep(step + 1)",
      "MONTH_NAMES[answers.birthMonth - 1]",
      'label={"UTR - today"}',
      "`UTR around ${label}`",
      "const x = -1;",
      "a.minCompetitiveUTR - b.minCompetitiveUTR",
    ]) {
      expect(utrArithmetic(codeWithoutText(s)), s).toEqual([]);
    }
  });

  const list = files(DIR);

  it("finds the diagnostic", () => {
    expect(list.some((f) => f.endsWith("diagnostic-flow.tsx"))).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(4);
  });

  it("no file under components/seeded/onboarding does arithmetic on a UTR", () => {
    const offenders: string[] = [];
    for (const f of list) {
      for (const hit of utrArithmetic(codeWithoutText(codeOnly(f)))) {
        offenders.push(`${f.slice(ROOT.length + 1)}: ${hit}`);
      }
    }
    expect(offenders, "call lib/fit.ts (diagnosticProjection / buildDiagnosticFitReport) instead").toEqual([]);
  });

  it("no file under components/seeded/onboarding imports a projection internal", () => {
    const offenders: string[] = [];
    for (const f of list) {
      const src = codeOnly(f);
      for (const name of BANNED_IMPORTS) {
        if (new RegExp(`\\b${name}\\b`).test(src)) offenders.push(`${f.slice(ROOT.length + 1)} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the diagnostic's projection comes from lib/fit.ts", () => {
    const flow = codeOnly(join(DIR, "diagnostic/diagnostic-flow.tsx"));
    expect(flow).toMatch(/import \{[^}]*\bdiagnosticProjection\b[^}]*\} from "@\/lib\/fit"/);
    const report = codeOnly(join(DIR, "seeded-pre-auth-onboarding.tsx"));
    expect(report).toMatch(/import \{[^}]*\bbuildDiagnosticFitReport\b[^}]*\} from "@\/lib\/fit"/);
    const aside = readFileSync(join(DIR, "diagnostic/diagnostic-aside.tsx"), "utf8");
    expect(aside, "the card prints what lib/fit.ts formatted").toMatch(/projection\.display/);
  });
});
