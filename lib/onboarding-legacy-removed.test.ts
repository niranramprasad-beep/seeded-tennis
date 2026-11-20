import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// PR D, D2. Signed-in /onboarding used to show the LEGACY four-step flow
// (components/onboarding/onboarding-flow.tsx): a gradient UTR slider whose
// readout labelled the player "Developing", "Competitive", "High
// performance", "College-ready" or "Elite college level" from fixed
// thresholds. Those labels were Seeded's invention — no source assigns a
// junior one — and they sat next to a rating the player had not chosen yet.
// A dead training catalog (lib/db/plan-data-training-plans.ts) carried the
// same five names as plan titles.
//
// Both are DELETED, and signed-in players get the board-20 diagnostic. This
// file fails the build if the flow, its switch, the catalog, or anything
// shaped like a UTR rating label comes back. It is a source scan: a lint,
// not a proof. The self-tests at the bottom show each detector catching the
// thing that shipped.

const ROOT = join(__dirname, "..");
const ROOTS = ["app", "components", "lib"];

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

// Comments name the removed labels on purpose (that history is the defence),
// so only live code is scanned. Block comments, then whole-line and
// trailing `//` comments that are not inside a string on that line.
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("//")) return "";
      const i = line.indexOf(" //");
      if (i >= 0 && (line.slice(0, i).match(/["'`]/g)?.length ?? 0) % 2 === 0) return line.slice(0, i);
      return line;
    })
    .join("\n");
}

const FILES = ROOTS.flatMap((r) => sourceFiles(join(ROOT, r)));
const rel = (f: string) => f.slice(ROOT.length + 1).split(/[\\/]/).join("/");

/** Deleted files. Re-adding any path is the regression. */
export const DELETED_PATHS = [
  "components/onboarding/onboarding-flow.tsx",
  "components/onboarding/onboarding-page-switch.tsx",
  "lib/db/plan-data-training-plans.ts",
];

/** Identifiers of the deleted pieces. */
export const BANNED_IDENTIFIERS = [
  "OnboardingFlow",
  "utrBand",
  "getTrainingPlanForUTR",
  "getTrainingPlans",
  "trainingPlansData",
  "plan-data-training-plans",
  "SLIDER_REST_POSITION",
];

/** A UTR rating label, as a string literal or JSX text. Case-sensitive and
 * anchored to a quote or `>` so ordinary prose ("arrive physically
 * college-ready") and identifiers (minCompetitiveUTR) do not trip it. */
export const RATING_LABEL =
  /["'`>]\s*(?:Developing|Competitive|High[- ]performance|College[- ]ready|Elite college(?: level| track)?)\b/;

/** The shape of the deleted mapper: a rating threshold that returns a word.
 * `if (utr < 6) return "Developing"`, or a band table keyed by `utrLevel`. */
export const RATING_LABEL_MAPPER =
  /if\s*\(\s*\w*utr\w*\s*[<>]=?\s*[\d.]+\s*\)\s*return\s*["'`][A-Z]|\butrLevel\s*:\s*[\d.]+/i;

describe("the legacy onboarding flow and UTR rating labels stay deleted", () => {
  it("the deleted files do not come back", () => {
    for (const p of DELETED_PATHS) expect(existsSync(join(ROOT, p)), p).toBe(false);
  });

  it("no live code names a deleted piece", () => {
    const hits: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const id of BANNED_IDENTIFIERS) if (src.includes(id)) hits.push(`${rel(f)}: ${id}`);
    }
    expect(hits).toEqual([]);
  });

  it("no live code prints a UTR rating label or maps a rating to one", () => {
    const hits: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, "utf8"));
      const label = src.match(RATING_LABEL);
      if (label) hits.push(`${rel(f)}: label ${label[0].trim()}`);
      const mapper = src.match(RATING_LABEL_MAPPER);
      if (mapper) hits.push(`${rel(f)}: mapper ${mapper[0].trim()}`);
    }
    expect(hits).toEqual([]);
  });

  it("/onboarding renders the diagnostic for a signed-in player and sends an onboarded account to Settings", () => {
    const page = readFileSync(join(ROOT, "app/onboarding/page.tsx"), "utf8");
    expect(page).toMatch(/@\/components\/seeded\/onboarding\/onboarding-page-switch/);
    const sw = stripComments(readFileSync(join(ROOT, "components/seeded/onboarding/onboarding-page-switch.tsx"), "utf8"));
    expect(sw).toMatch(/router\.replace\(SETTINGS_FROM_ONBOARDING_HREF\)/);
    expect(sw).toMatch(/<SeededDiagnosticOnboarding[\s\S]*?signedIn/);
    // No second onboarding UI is imported into the switch.
    const imports = [...sw.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.filter((i) => /onboarding/i.test(i) && !/diagnostic/.test(i))).toEqual([]);
  });
});

describe("the detectors catch what shipped (mutation self-tests)", () => {
  const legacy = `
function utrBand(utr: number): string {
  if (utr < 6) return "Developing";
  if (utr < 8) return "Competitive";
  return "Elite college level";
}
<span>{utrBand(utr)}</span>`;

  it("catches the legacy mapper and its labels", () => {
    expect(RATING_LABEL.test(stripComments(legacy))).toBe(true);
    expect(RATING_LABEL_MAPPER.test(stripComments(legacy))).toBe(true);
    expect(BANNED_IDENTIFIERS.some((id) => legacy.includes(id))).toBe(true);
  });

  it("catches the catalog's band table and a JSX label", () => {
    expect(RATING_LABEL_MAPPER.test(`{ utrLevel: 6, label: "x" }`)).toBe(true);
    expect(RATING_LABEL.test(`label: "Developing — UTR 5-6",`)).toBe(true);
    expect(RATING_LABEL.test(`<Badge>College-ready</Badge>`)).toBe(true);
    expect(RATING_LABEL.test("`High performance`")).toBe(true);
  });

  it("ignores comments, prose and identifiers", () => {
    expect(RATING_LABEL.test(stripComments(`// the old "Developing" label`))).toBe(false);
    expect(RATING_LABEL.test(stripComments(`/* "College-ready" */ const x = 1;`))).toBe(false);
    expect(RATING_LABEL.test(`"Arrive on campus physically college-ready"`)).toBe(false);
    expect(RATING_LABEL.test(`school.minCompetitiveUTR`)).toBe(false);
    expect(RATING_LABEL_MAPPER.test(`if (utr < 6) setError(UTR_INPUT_ERROR)`)).toBe(false);
  });

  it("a `//` inside a string does not hide the rest of the line", () => {
    expect(RATING_LABEL.test(stripComments(`const u = "https://x"; const l = "Developing";`))).toBe(true);
  });
});
