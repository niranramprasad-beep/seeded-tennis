import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { codeOnly } from "./testing/source-text";

// Every "Manage billing" entry — Seeded and Legacy — goes to
// /settings/billing. Never /pricing (a price table is not someone's plan),
// and never Whop directly: only /settings/billing knows whether the signed-in
// person is the one who pays. A player whose parent pays, sent straight to
// Whop, gets "You do not have access to this page on this account. Press
// continue to switch accounts." (live repro, 2026-11-17).

const ROOT = join(__dirname, "..");
const DIRS = ["components", "app", "lib"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

const FILES = DIRS.flatMap((d) => walk(join(ROOT, d)));
const rel = (f: string) => relative(ROOT, f);

const MANAGE_BILLING = /manage\s+billing/gi;
const OPEN_TAG = /<(button|a|Link|Button|SeededButton)\b/g;

/** The attribute text of the nearest button-like tag opened before `index`.
 * Braces and quotes are tracked so `onClick={() => …}` does not end the
 * tag at its arrow. */
function enclosingTagAttrs(code: string, index: number): string | null {
  let last: RegExpExecArray | null = null;
  OPEN_TAG.lastIndex = 0;
  for (let m = OPEN_TAG.exec(code); m && m.index < index; m = OPEN_TAG.exec(code)) last = m;
  if (!last) return null;
  let i = last.index + last[0].length;
  let depth = 0;
  let quote: string | null = null;
  for (; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) break;
  }
  return code.slice(last.index + last[0].length, i);
}

/** "" when the entry is fine, otherwise why not. */
export function manageBillingProblems(code: string): string[] {
  const problems: string[] = [];
  for (const m of code.matchAll(MANAGE_BILLING)) {
    const attrs = enclosingTagAttrs(code, m.index!);
    if (attrs == null) {
      problems.push(`"${m[0]}" is not inside a link or button`);
      continue;
    }
    const goesToBilling =
      /["'`]\/settings\/billing["'`]/.test(attrs) || /onClick=\{\s*manageBilling\s*\}/.test(attrs);
    if (!goesToBilling) problems.push(`"${m[0]}" does not go to /settings/billing: ${attrs.trim().slice(0, 120)}`);
    if (/\/pricing|whop\.com/.test(attrs)) problems.push(`"${m[0]}" points at /pricing or Whop`);
  }
  // Every manageBilling handler itself.
  for (const m of code.matchAll(/(?:const|function)\s+manageBilling\b[\s\S]*?\n\s*\};?\n/g)) {
    const body = m[0];
    if (!/["'`]\/settings\/billing["'`]/.test(body)) problems.push("manageBilling does not go to /settings/billing");
    if (/\/pricing|whop\.com|window\.open|_blank/.test(body)) problems.push("manageBilling goes to /pricing or Whop");
  }
  return problems;
}

describe("every Manage billing entry goes to /settings/billing", () => {
  it("the detector catches each wrong destination (self-test)", () => {
    const bad = [
      `<Button variant="outline" onClick={() => router.push("/pricing")}>\n  Manage billing\n</Button>`,
      `<a href="https://whop.com/@me/settings/memberships/" target="_blank">Manage billing</a>`,
      `<Link href="/pricing" className="x">Manage billing or cancel</Link>`,
      `const manageBilling = () => {\n    window.location.href = WHOP_MEMBERSHIPS_URL;\n  };\n`,
      `<button onClick={() => go("/settings")}>Manage Billing</button>`,
    ];
    for (const s of bad) expect(manageBillingProblems(s), s).not.toEqual([]);

    const good = [
      `<button type="button" onClick={() => router.push("/settings/billing")}>\n  Manage billing\n</button>`,
      `<Link href="/settings/billing">Manage billing</Link>`,
      `<button type="button" onClick={manageBilling} disabled={busy}>Manage billing or cancel your plan</button>`,
      `const manageBilling = () => {\n    router.push("/settings/billing");\n  };\n`,
    ];
    for (const s of good) expect(manageBillingProblems(s), s).toEqual([]);
  });

  it("finds the entries it is guarding", () => {
    // The Settings account card and /pricing. Was 4+ while the Legacy
    // settings and pricing pages existed (deleted 2026-11-20).
    const withEntry = FILES.filter((f) => /manage\s+billing/i.test(codeOnly(f)));
    expect(withEntry.length).toBeGreaterThanOrEqual(2);
  });

  it("no Manage billing link or handler points anywhere else", () => {
    const hits: string[] = [];
    for (const f of FILES) {
      for (const p of manageBillingProblems(codeOnly(f))) hits.push(`${rel(f)}: ${p}`);
    }
    expect(hits).toEqual([]);
  });
});

describe("only /settings/billing sends anyone to Whop's member portal", () => {
  // The portal is where the payer-check matters. Checkout (a NEW purchase,
  // for the signed-in user themselves) is a different Whop page.
  const ALLOWED = new Set(["lib/billing-view.ts"]);

  it("the portal URL lives in one place", () => {
    const hits = FILES.filter((f) => !ALLOWED.has(rel(f)) && /whop\.com\/@me/.test(codeOnly(f))).map(rel);
    expect(hits).toEqual([]);
  });

  it("no Whop link on the billing page opens a new tab", () => {
    const code = codeOnly(join(ROOT, "components/seeded/settings/billing-content.tsx"));
    expect(code).not.toMatch(/_blank|window\.open/);
  });
});
