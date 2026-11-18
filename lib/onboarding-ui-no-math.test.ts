import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { codeOnly } from "./testing/source-text";

// The /onboarding diagnostic shows a projected UTR on one screen and a fit
// report judged at it on the next. They agree only because ONE function,
// lib/fit.ts's diagnosticProjection(), produces the number. The same rule as
// lib/fit-single-source.test.ts: components render, lib/fit.ts decides.
//
// So nothing under components/seeded/onboarding/ or lib/onboarding/ may
//   (a) import a growth/pace/projection internal and do its own projecting;
//   (b) do arithmetic on a UTR, a pace or a projection.

const ROOT = join(__dirname, "..");
const DIR = join(ROOT, "components/seeded/onboarding");
/** The onboarding UI's own lib code: answer parsing, step rules and the
 *  save. It hands numbers to lib/fit.ts and lib/db, and computes none. */
const LIB_DIR = join(ROOT, "lib/onboarding");

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
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    // Regex literals (`/^\d+$/.test(t)`): their slashes are not division.
    .replace(/(?<=[=(,:!&|?;{}[]\s*)\/(?![/*])(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[gimsuy]*/g, "RE");
}

const UTR_WORD = /utr|pace|projection|projected/i;
/** A TEAM's published-range fields (sorting schools by floor) are not the
 * player's rating; everything else with "utr" in it is. */
const TEAM_FIELD = /\w*(?:Competitive|Roster)UTR\b/g;
const namesUtr = (operand: string) => UTR_WORD.test(operand.replace(TEAM_FIELD, ""));

const IDENT = /[A-Za-z_$][\w$]*/g;

/**
 * Local names that hold a UTR-ish value under a name that does not say so:
 *   const { utrToday: t } = values;          -> t
 *   const { utrToday } = values;             -> utrToday (already says so)
 *   const t = values.utrToday ?? 0;          -> t
 *   const u = t;                             -> u (chains, to a fixpoint)
 * An independent review defeated the first version of this guard with
 * exactly the first shape (`t * 2`). A plain alias is caught when the right
 * side is just a value read — a member chain or name, optionally with `!`,
 * `?? x` / `|| x`, or wrapped in Number(...).
 */
export function utrAliases(code: string): Set<string> {
  const tainted = new Set<string>();
  const isUtr = (s: string) => namesUtr(s) || [...s.matchAll(IDENT)].some((m) => tainted.has(m[0]));
  for (let changed = true; changed; ) {
    changed = false;
    const add = (name: string) => {
      if (name && !tainted.has(name)) {
        tainted.add(name);
        changed = true;
      }
    };
    for (const m of code.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
      for (const part of m[1].split(",")) {
        const [rawKey, rawAlias] = part.split(":");
        const key = (rawKey ?? "").replace(/^\s*\.\.\./, "").replace(/=.*$/, "").trim();
        const local = (rawAlias ?? rawKey ?? "").replace(/^\s*\.\.\./, "").replace(/=.*$/, "").trim();
        if (key && /^[\w$]+$/.test(local) && isUtr(key)) add(local);
      }
    }
    for (const m of code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*([^;\n]+)/g)) {
      const rhs = m[2]
        .trim()
        .replace(/^Number\((.*)\)$/, "$1")
        .replace(/\s*(?:\?\?|\|\|)\s*[\w$.]+$/, "")
        .replace(/!$/, "")
        .trim();
      if (/^[\w$]+(?:\??\.[\w$]+|!)*$/.test(rhs)) {
        const last = rhs.split(/\??\./).pop()!.replace(/!$/, "");
        if (namesUtr(last) || tainted.has(rhs)) add(m[1]);
      }
    }
  }
  return tainted;
}

const MATH_FN = /\bMath\.(max|min|round|floor|ceil|trunc|abs|pow|sqrt|sign)\s*\(/g;

/** The argument text of the call whose "(" is at `open`. */
function callArgs(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")" && --depth === 0) return code.slice(open + 1, i);
  }
  return code.slice(open + 1);
}

/** Every binary + - * / % whose either operand names a UTR-ish value (or a
 *  local alias of one), and every Math.max/min/round/floor/ceil/… applied
 *  to one. */
export function utrArithmetic(code: string): string[] {
  const hits: string[] = [];
  const aliases = utrAliases(code);
  const utrish = (operand: string) =>
    namesUtr(operand) || [...operand.replace(TEAM_FIELD, "").matchAll(IDENT)].some((m) => aliases.has(m[0]));
  const re = /([\w$.?!\])]+)\s*([-+*/%])(?![-+=>*/])\s*([\w$.(!]+)/g;
  for (const m of code.matchAll(re)) {
    const [whole, left, , right] = m;
    if (utrish(left) || utrish(right)) hits.push(whole.trim());
  }
  // A parenthesised operand: `(t ?? 0) * 2`, `2 * Number(values.utrToday)`.
  for (const m of code.matchAll(/\(([^()]*)\)\s*([-+*/%])(?![-+=>*/])|([-+*/%])(?<![-+=<>*/]{2})\s*[\w$.]*\(([^()]*)\)/g)) {
    const inner = m[1] ?? m[4] ?? "";
    if (utrish(inner)) hits.push(m[0].trim());
  }
  for (const m of code.matchAll(MATH_FN)) {
    const args = callArgs(code, m.index! + m[0].length - 1);
    if (utrish(args)) hits.push(`Math.${m[1]}(${args.trim()})`);
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
      // The two bypasses an independent review found (2026-11-18):
      "const { utrToday: t } = values; const v = t * 2;",
      "const m = Math.max(values.utrToday, 1);",
      // ...and their neighbours.
      "const { utrToday } = values; const v = utrToday / 2;",
      "const { utrYearAgo: then, utrToday: now } = v; const d = now - then;",
      "const t = values.utrToday ?? 0; const v = t + 1;",
      "const t = values.utrToday!; const u = t; const v = 2 * u;",
      "const r = Math.round(projection.value * 100) / 100;",
      "const f = Math.floor(answers.utrToday);",
      "const { utrToday: t } = values; const m = Math.min(t, 16.5);",
      "const { utrToday: t } = values; return (t ?? 0) * 2;",
      "const v = 2 * Number(values.utrToday);",
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
      "const { name: n } = values; const s = n + suffix;",
      "const m = Math.max(step, 1);",
      "const t = values.utrToday; const label = formatUtrOrNotTracked(t);",
    ]) {
      expect(utrArithmetic(codeWithoutText(s)), s).toEqual([]);
    }
  });

  const list = [...files(DIR), ...files(LIB_DIR)];

  it("finds the diagnostic", () => {
    expect(list.some((f) => f.endsWith("diagnostic-flow.tsx"))).toBe(true);
    expect(list.some((f) => f.endsWith("lib/onboarding/diagnostic.ts"))).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(6);
  });

  it("no file under components/seeded/onboarding or lib/onboarding does arithmetic on a UTR", () => {
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
